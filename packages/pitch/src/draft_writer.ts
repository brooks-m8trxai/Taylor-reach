/**
 * Draft writer.
 *
 * Given a brand + signal, generates a full pitch email in Taylor's voice,
 * then inserts it into pitch_drafts with status='awaiting_approval'.
 *
 * Uses the angle_generator to pick the best angle first, then writes the
 * full email body with Claude Sonnet using the sponsorship template.
 *
 * Hard rules enforced here:
 * - Body must be 100-180 words
 * - Subject must be under 60 chars
 * - No forbidden phrases (hope this finds you, love your brand, synergy, etc.)
 * - All credentials come from taylor_credibility.json
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@taylor-reach/db'
import { generateAngles } from './angle_generator'
import type { PitchAngle } from './angle_generator'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Voice enforcement ────────────────────────────────────────────────────────

const FORBIDDEN_PHRASES = [
  // Original set
  'hope this finds you',
  "hope you're doing well",
  'love your brand',
  "i'm a huge fan",
  'huge fan',
  'synergy',
  'leverage',
  'circle back',
  'touch base',
  'passionate about',
  "let's hop on",
  'let me know if interested',
  'would love to collab',
  'let me know if you have any questions',
  'feel free to reach out',
  'best regards',
  'kind regards',
  'warmly',
  'cheers',
  // Extended AI-tell phrases
  'i wanted to reach out',
  'i came across',
  'circling back',
  'touching base',
  'collaboration opportunity',
  'win-win',
  'let me know if',
  'looking forward to hearing',
  'excited to connect',
  'thrilled to share',
  "i'd love to explore",
  'following up to see',
]

// Bad openers specifically (checked against start of body)
const BAD_OPENERS = [
  'I hope',
  'I wanted to',
  'I came across',
  'I am reaching out',
  'I am writing to',
]

function containsForbiddenPhrase(text: string): string | null {
  const lower = text.toLowerCase()
  return FORBIDDEN_PHRASES.find(p => lower.includes(p)) ?? null
}

function hasBadOpener(text: string): boolean {
  return BAD_OPENERS.some(o => text.trimStart().startsWith(o))
}

// ─── Post-processing sanitizer ────────────────────────────────────────────────
// Strips AI-tell punctuation that Claude can't always suppress even when asked.

function sanitizeDraft(text: string): string {
  return text
    .replace(/\s+—\s+/g, '. ')        // em-dash with spaces → sentence break
    .replace(/—/g, ', ')               // bare em-dash → comma
    .replace(/[‘’]/g, "'")  // curly single quotes → straight
    .replace(/[“”]/g, '"')  // curly double quotes → straight
    .replace(/…/g, '...')             // ellipsis char → three dots
    .replace(/\s{2,}/g, ' ')          // collapse double spaces
    .replace(/\.{4,}/g, '...')        // 4+ dots → three
    .replace(/\.\s+\./g, '.')         // ". ." → "."
    .trim()
}

// ─── Load assets ──────────────────────────────────────────────────────────────

function loadFile(relative: string): string {
  const candidates = [
    join(process.cwd(), relative),
    join(process.cwd(), '..', '..', relative),
    join(process.cwd(), '..', '..', '..', relative),
  ]
  for (const p of candidates) {
    try { return readFileSync(p, 'utf-8') } catch {}
  }
  return ''
}

// ─── Main draft writer ─────────────────────────────────────────────────────────

export interface DraftResult {
  pitchDraftId: string
  brandName: string
  subject: string
  bodyText: string
  angle: string
  qualityScore: number
}

export async function writeDraft(
  brandId: string,
  signalId: string,
  /** When the caller already knows which angle to use (e.g. from "Draft this angle" button),
   *  pass it here to skip the angle-generation round-trip to Sonnet. */
  preselectedAngle?: PitchAngle,
): Promise<DraftResult | null> {
  // Load brand + signal + best contact
  const [{ data: brand }, { data: signal }, { data: contacts }, { data: tenant }] = await Promise.all([
    supabase.from('brands').select('*').eq('id', brandId).single(),
    supabase.from('signals').select('*').eq('id', signalId).single(),
    supabase.from('brand_contacts').select('*').eq('brand_id', brandId).order('role_priority').limit(1),
    supabase.from('tenants').select('*').limit(1).single(),
  ])

  if (!brand || !signal || !tenant) {
    console.error(`[draft_writer] Missing data for brand=${brandId} signal=${signalId}`)
    return null
  }

  const b = brand as any
  const s = signal as any
  const t = tenant as any
  const contact = contacts?.[0] as any

  // Generate angles — or use the preselected one if provided
  let best: PitchAngle
  let angles: PitchAngle[]
  let reasoning: string
  let isMediaOpportunity: boolean

  if (preselectedAngle) {
    best = preselectedAngle
    angles = [preselectedAngle]
    reasoning = `Angle preselected: ${preselectedAngle.angle}`
    isMediaOpportunity = preselectedAngle.deal_type === 'podcast_guest'
  } else {
    const angleResult = await generateAngles(brandId, signalId)
    if (!angleResult) return null
    ;({ best, angles, reasoning, isMediaOpportunity } = angleResult)
  }

  // Load voice guide + template
  const voiceGuide = loadFile('docs/taylor-voice.md')
  const template = loadFile(
    best.deal_type === 'podcast_guest'
      ? 'packages/pitch/templates/podcast_guest.md'
      : 'packages/pitch/templates/sponsorship.md',
  )
  const credibility = loadFile('docs/taylor_credibility.json')

  const calLink = (t.cal_links as any)?.intro_call ?? 'https://cal.com/taylorhumphrey/intro'
  const siteUrl = 'https://www.whatsinababyname.com'

  const modeNote = isMediaOpportunity
    ? `IMPORTANT: This is a MEDIA OPPORTUNITY pitch. Taylor is pitching HERSELF as a guest/expert/source to this publisher — not a brand partnership. She is the product. Lead with her press credentials. Offer 3 specific episode/story angles. The ask is a booking call.`
    : `This is a BRAND PARTNERSHIP pitch. Taylor is pitching a paid content deal to a product brand.`

  const systemPrompt = `You are Taylor Humphrey writing a pitch email.

${modeNote}

Voice guide:
${voiceGuide}

Email template structure to follow:
${template}

Taylor's verified credentials (USE ONLY THESE — DO NOT INVENT):
${credibility}

CRITICAL — This email must NOT read as AI-written:
1. ZERO em-dashes (—). Use periods, commas, or new sentences. No exceptions.
2. ZERO smart/curly quotes. Only straight quotes (").
3. ZERO of these phrases: "I hope this email finds you well", "I wanted to reach out", "I came across", "circling back", "touching base", "synergy", "leverage", "passionate about", "collaboration opportunity", "win-win", "let me know if", "looking forward to hearing".
Write like a smart, busy expert texting a peer. Casual but confident. Short sentences. Real personality. If a sentence sounds like a marketing email template, rewrite it.

FORMATTING — every pitch body must follow this exact paragraph structure. Separate each block with a blank line. Never run blocks together into a wall of text.

Block 1 — OPENING HOOK (1-2 sentences): Reference one specific, current thing about their brand. Not generic flattery — a detail that earns expertise.

Block 2 — CREDIBILITY (2-3 sentences): Who Taylor is and why her audience matches theirs. Reference real verified press. No invented follower counts — use qualitative language if numbers are unverified.

Block 3 — IDEA (2-3 sentences): One specific concept. Not a menu of options. Concrete format, angle, and tie-in.

Block 4 — RIGHT-PERSON LINE (1 sentence): Acknowledge you might not have the right contact. Keep it casual, vary the phrasing across pitches. Examples: "If partnerships sit with someone else on your team, happy to be redirected." / "If this should go to someone else, just point me that way." / "If brand collabs aren't your lane, no worries — happy to be forwarded." Never make this the focal point.

Block 5 — ASK + WARM CLOSE (2 sentences, one paragraph): Ask first (one concrete question). Then a warm brand-specific closer — it MUST reference something specific to this brand. Patterns by deal type:
  - Product brands: "Either way, love what you're building." / "Big fan of [specific product/campaign] either way." / "Either way, excited to see what comes next."
  - Publishers/media: "Either way, your [piece reference] was a great read." / "Either way, love the work your team is doing on [topic]." / "Either way, happy to be on your radar."
  - Podcast guesting: "Either way, the [episode reference] episode was great." / "Either way, love what you and the team are doing."
  If you cannot make it specific, default to "Either way, love what you're building." — never invent.

Block 6 — SIGNATURE (each element on its own line, exactly):
Taylor Humphrey
What's In A Baby Name
${siteUrl}
${calLink}

ABSOLUTE RULES:
- Body must be 100-180 words (count carefully — signature counts)
- Subject must be under 60 characters
- Never use these phrases: ${FORBIDDEN_PHRASES.slice(0, 8).join(', ')}...
- Signature starts with "Taylor Humphrey" — NEVER write "Taylor" alone on a separate line before it
- The opening sentence MUST reference something specific from this signal
- If audience numbers are marked as needing verification, use qualitative language instead
- No emoji in pitches`

  const userPrompt = `Write the pitch email now.

Brand: ${b.brand_name}
Domain: ${b.domain ?? 'unknown'}
Brand kind: ${b.brand_kind ?? 'product brand'}
Categories: ${(b.categories ?? []).join(', ')}
Description: ${b.about_summary ?? b.description ?? 'premium baby/parenting brand'}

Signal headline: ${s.headline}
Signal type: ${s.signal_type}
Signal excerpt: ${s.raw_excerpt ?? ''}
Published: ${s.source_published_at?.slice(0, 10) ?? 'recently'}

Deal type: ${best.deal_type}
Contact: ${contact ? `${contact.name ?? 'Hi'}, ${contact.title ?? 'Marketing team'}` : 'Hi'}

Chosen angle: ${best.angle}
Hook sentence to open with: "${best.hook_sentence}"
Subject: ${best.subject}

Return JSON only:
{
  "subject": "email subject line under 60 chars",
  "body_text": "full email body including signature, plain text",
  "word_count": 0,
  "quality_score": 0-100
}`

  for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''

    // Robust JSON extraction: strip code fences, find outermost { ... }
    let raw = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd > jsonStart) raw = raw.slice(jsonStart, jsonEnd + 1)

    let parsed: { subject: string; body_text: string; word_count: number; quality_score: number }
    try {
      parsed = JSON.parse(raw)
    } catch (parseErr) {
      if (attempt < 2) {
        console.warn(`[draft_writer] JSON parse failed for ${b.brand_name} (attempt ${attempt}), retrying…`)
        continue
      }
      throw parseErr
    }

    // ── PART 3: Post-processing sanitize ───────────────────────────────────
    parsed.subject  = sanitizeDraft(parsed.subject)
    parsed.body_text = sanitizeDraft(parsed.body_text)

    // ── PART 4: Quality gate — retry once if AI-tells sneak through ────────
    const stillHasEmDash = parsed.body_text.includes('—')
    const stillHasBadOpener = hasBadOpener(parsed.body_text)
    const stillHasForbidden = containsForbiddenPhrase(parsed.body_text)

    if ((stillHasEmDash || stillHasBadOpener || stillHasForbidden) && attempt < 2) {
      const reason = stillHasEmDash ? 'em-dash found'
        : stillHasBadOpener ? 'bad opener'
        : `forbidden phrase: "${stillHasForbidden}"`
      console.warn(`[draft_writer] Quality gate failed for ${b.brand_name} (attempt ${attempt}): ${reason} — retrying…`)
      continue
    }

    // Voice guard: flag quality score if forbidden phrase still present after retry
    const forbidden = containsForbiddenPhrase(parsed.body_text)
    const qualityScore = forbidden
      ? Math.min(parsed.quality_score - 20, 50)
      : parsed.quality_score

    // Append CAN-SPAM footer
    const footer = [
      '',
      '—',
      "Taylor Humphrey · What's In A Baby Name",
      t.physical_address ?? '',
      t.unsubscribe_url ? `Unsubscribe: ${t.unsubscribe_url}` : '',
    ].filter(Boolean).join('\n')

    const bodyWithFooter = `${parsed.body_text}\n${footer}`

    // Find the highest-scoring alternate angles (exclude the best one)
    const alternateAngles = angles
      .filter(a => a !== best)
      .map(a => ({ angle: a.angle, hook_sentence: a.hook_sentence }))

    // Insert pitch_draft
    const { data: draft, error } = await supabase
      .from('pitch_drafts')
      .insert({
        tenant_id: t.id,
        brand_id: brandId,
        contact_id: contact?.id ?? null,
        selected_signal_id: signalId,
        deal_type: best.deal_type,
        angle_used: best.angle,
        alternate_angles: alternateAngles,
        subject: parsed.subject,
        body_text: bodyWithFooter,
        body_html: null,
        draft_quality_score: qualityScore,
        reasoning,
        status: 'awaiting_approval',
      })
      .select('id')
      .single()

    if (error || !draft) {
      console.error(`[draft_writer] Insert failed:`, error?.message)
      return null
    }

    console.log(`[draft_writer] Created draft ${draft.id} for ${b.brand_name} (score=${qualityScore})`)

    return {
      pitchDraftId: draft.id,
      brandName: b.brand_name,
      subject: parsed.subject,
      bodyText: bodyWithFooter,
      angle: best.angle,
      qualityScore,
    }
  } catch (err) {
    console.error(`[draft_writer] Failed for ${b.brand_name}:`, err)
    return null
  }
  } // end for-loop (retry)
  return null
}
