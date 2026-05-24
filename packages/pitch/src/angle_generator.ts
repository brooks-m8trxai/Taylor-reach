/**
 * Angle generator.
 *
 * Given a brand + signal, calls Claude Sonnet to produce 2-3 pitch angles.
 * Every angle is grounded in real Taylor credibility data from taylor_credibility.json —
 * the model is explicitly forbidden from inventing credentials.
 *
 * Two operating modes, determined by signal.metadata.is_media_opportunity:
 *
 *   Brand partnership (default):
 *     Taylor is pitching a paid content deal / sponsorship.
 *     Target is the brand's marketing/partnerships team.
 *     deal_type = 'sponsorship'
 *
 *   Media opportunity (is_media_opportunity: true):
 *     Taylor IS the product. She is pitching herself as an expert source,
 *     podcast guest, or contributor to the publisher.
 *     Target is the editorial/producer team.
 *     deal_type = 'podcast_guest' (uses the podcast_guest template)
 *
 * Returns ranked angles. The best one feeds into draft_writer.ts.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@taylor-reach/db'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PitchAngle {
  angle: 'launch' | 'campaign_echo' | 'competitor' | 'seasonal' | 'cultural' | 'earned' | 'podcast'
  hook_sentence: string
  subject: string
  score: number
  deal_type: 'sponsorship' | 'podcast_guest'
}

export interface GeneratedAngles {
  angles: PitchAngle[]
  best: PitchAngle
  reasoning: string
  isMediaOpportunity: boolean
}

// ─── Load Taylor's verified credibility data ──────────────────────────────────

function loadCredibility(): string {
  const candidates = [
    join(process.cwd(), 'docs', 'taylor_credibility.json'),
    join(process.cwd(), '..', '..', 'docs', 'taylor_credibility.json'),
    join(process.cwd(), '..', '..', '..', 'docs', 'taylor_credibility.json'),
  ]
  for (const p of candidates) {
    try { return readFileSync(p, 'utf-8') } catch {}
  }
  return JSON.stringify({
    person: { full_name: 'Taylor Humphrey', profession: 'Professional Baby Name Consultant' },
    business: { name: "What's in a Baby Name", website: 'https://www.whatsinababyname.com' },
  })
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildBrandPartnershipPrompt(b: any, s: any, topContact: any, credentialJson: string): { system: string; user: string } {
  const system = `You are Taylor Humphrey's pitch strategy advisor.
Taylor is a professional baby name consultant with The New Yorker, SF Chronicle, NY Post, and other major press.
Her business is "What's in a Baby Name" — boutique, premium, global clientele.

Your job: generate 2-3 pitch angles for a BRAND PARTNERSHIP opportunity.
Taylor is pitching herself as a paid content creator / brand partner to a product brand.

HARD RULES:
1. Every credential you reference MUST appear in the credibility JSON below. Never invent press, followers, or partnerships.
2. If audience numbers seem stale (marked verify_before_using_number: true), use qualitative descriptions instead.
3. Angles must be specific to THIS brand's signal — no generic "let's collaborate" thinking.
4. Taylor's pitches are 100-180 words. The hook_sentence sets the opening. It must reference something specific and current about the brand.
5. deal_type for product/DTC brands = "sponsorship"

Taylor's verified credibility:
${credentialJson}`

  const user = `Brand: ${b.brand_name}
Domain: ${b.domain ?? 'unknown'}
Categories: ${(b.categories ?? []).join(', ')}
Fit score: ${b.fit_score}
Description: ${b.description ?? 'not enriched yet'}
Size: ${b.size_band ?? 'unknown'}

Signal:
Type: ${s.signal_type}
Headline: ${s.headline}
Excerpt: ${s.raw_excerpt ?? ''}
Source: ${s.source}
Published: ${s.source_published_at?.slice(0, 10) ?? 'recently'}

Top contact: ${topContact ? `${topContact.title ?? 'contact'} at ${b.brand_name}` : 'not found yet'}

Generate 2-3 pitch angles. Return JSON only:
{
  "angles": [
    {
      "angle": "launch|campaign_echo|competitor|seasonal|cultural|earned|podcast",
      "hook_sentence": "Opening sentence referencing THIS specific brand signal — specific, confident, expert. No 'hope this finds you well'. Start mid-thought.",
      "subject": "Email subject under 55 chars, specific to signal",
      "score": 0-100,
      "deal_type": "sponsorship"
    }
  ],
  "best_index": 0,
  "reasoning": "1-2 sentences on why the top angle wins"
}`

  return { system, user }
}

function buildMediaOpportunityPrompt(
  publisherName: string,
  s: any,
  credentialJson: string,
): { system: string; user: string } {
  const system = `You are Taylor Humphrey's pitch strategy advisor.
Taylor is a professional baby name consultant with The New Yorker, SF Chronicle, NY Post, and other major press.
Her business is "What's in a Baby Name" — boutique, premium, global clientele.

Your job: generate 2-3 angles for a MEDIA OPPORTUNITY pitch.

CRITICAL FRAMING: In this pitch, TAYLOR IS THE PRODUCT. She is NOT pitching a brand partnership.
She is pitching herself as an expert source, podcast guest, or contributor to a media publisher.
The publisher's readers/listeners are exactly her target audience.

The goal: get Taylor booked as a guest or quoted as an expert.

HARD RULES:
1. Every credential you reference MUST appear in the credibility JSON below. Never invent press, followers, or partnerships.
2. Lead with Taylor's press — The New Yorker profile, SF Chronicle, NY Post, etc. are her booking credentials.
3. Offer 3 specific episode/story angles — concrete topics, not vague "I could talk about baby names."
4. Reference a specific recent episode or article from this publication in the opening.
5. All deal_type values MUST be "podcast_guest" regardless of signal type.
6. The ask is always a booking, not a partnership discussion.

Taylor's verified credibility:
${credentialJson}`

  const user = `Publisher: ${publisherName}
Signal headline: ${s.headline}
Signal excerpt: ${s.raw_excerpt ?? ''}
Signal type: ${s.signal_type}
Published: ${s.source_published_at?.slice(0, 10) ?? 'recently'}

Context: This publisher is a target for Taylor to appear as a guest/expert/source.
Her audience and their audience overlap heavily (expecting + new parents).

Generate 2-3 pitch angles for Taylor to pitch herself as a guest. Return JSON only:
{
  "angles": [
    {
      "angle": "podcast|earned|cultural|seasonal",
      "hook_sentence": "Opening sentence that references something SPECIFIC and recent from this publisher — a recent episode topic, a piece they ran, something in their editorial voice. Specific > generic.",
      "subject": "Email subject under 55 chars — sounds like a pitch to a producer, not a brand",
      "score": 0-100,
      "deal_type": "podcast_guest"
    }
  ],
  "best_index": 0,
  "reasoning": "1-2 sentences on why the top angle wins"
}`

  return { system, user }
}

// ─── Main angle generation ─────────────────────────────────────────────────────

export async function generateAngles(brandId: string, signalId: string): Promise<GeneratedAngles | null> {
  const [{ data: brand }, { data: signal }, { data: contacts }] = await Promise.all([
    supabase.from('brands').select('*').eq('id', brandId).single(),
    supabase.from('signals').select('*').eq('id', signalId).single(),
    supabase.from('brand_contacts').select('*').eq('brand_id', brandId).order('role_priority').limit(3),
  ])

  if (!brand || !signal) {
    console.error(`[angle_generator] Brand or signal not found: ${brandId} / ${signalId}`)
    return null
  }

  const credentialJson = loadCredibility()
  const b = brand as any
  const s = signal as any
  const topContact = contacts?.[0] as any

  // Determine mode from signal metadata
  const metadata = (s.metadata ?? {}) as Record<string, unknown>
  const isMediaOpportunity = metadata.is_media_opportunity === true
  const publisherName = (metadata.publisher_name as string | undefined) ?? b.brand_name

  const { system: systemPrompt, user: userPrompt } = isMediaOpportunity
    ? buildMediaOpportunityPrompt(publisherName, s, credentialJson)
    : buildBrandPartnershipPrompt(b, s, topContact, credentialJson)

  for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''

    // Robust JSON extraction: strip code fences, find outermost { ... }
    let raw = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd > jsonStart) raw = raw.slice(jsonStart, jsonEnd + 1)

    let parsed: { angles: PitchAngle[]; best_index: number; reasoning: string }
    try {
      parsed = JSON.parse(raw)
    } catch (parseErr) {
      if (attempt < 2) {
        console.warn(`[angle_generator] JSON parse failed for ${b.brand_name} (attempt ${attempt}), retrying…`)
        continue
      }
      throw parseErr
    }

    // For media opportunities, enforce deal_type = 'podcast_guest' regardless of what Sonnet returns
    if (isMediaOpportunity) {
      parsed.angles = parsed.angles.map(a => ({ ...a, deal_type: 'podcast_guest' as const }))
    }

    const best = parsed.angles[parsed.best_index ?? 0] ?? parsed.angles[0]

    console.log(`[angle_generator] ${b.brand_name}: ${parsed.angles.length} angles (mode=${isMediaOpportunity ? 'media_opportunity' : 'brand_partnership'})`)

    return { angles: parsed.angles, best, reasoning: parsed.reasoning, isMediaOpportunity }
  } catch (err) {
    console.error(`[angle_generator] Failed for ${b.brand_name}:`, err)
    return null
  }
  } // end for-loop (retry)
  return null
}
