/**
 * Brand intelligence generator.
 *
 * Generates and caches three sections for the brand detail page:
 *   A) about_summary        — 2-3 sentences: what this brand does + who their customer is
 *   B) opportunity_summary  — 2-3 sentences: why Taylor should pitch them, and what kind of deal
 *   C) suggested_angles_json — 2-3 ranked pitch angles (uses existing generateAngles())
 *
 * Caching: results are saved to brands.about_summary, brands.opportunity_summary,
 * brands.suggested_angles_json, and brands.intelligence_generated_at.
 *
 * Staleness: regenerate when intelligence_generated_at IS NULL or
 * intelligence_generated_at < last_signal_at (new signal since last analysis).
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@taylor-reach/db'
import { generateAngles } from './angle_generator'
import type { GeneratedAngles } from './angle_generator'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Sanitizer (mirrors draft_writer — strips AI punctuation tells) ──────────

function sanitizeText(text: string): string {
  return text
    .replace(/\s+—\s+/g, '. ')
    .replace(/—/g, ', ')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/…/g, '...')
    .replace(/\s{2,}/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .trim()
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandIntelligenceResult {
  about: string
  opportunity: string
  angles: GeneratedAngles | null
  fromCache: boolean
}

// ─── Asset loader ─────────────────────────────────────────────────────────────

function loadCredibility(): string {
  const candidates = [
    join(process.cwd(), 'docs', 'taylor_credibility.json'),
    join(process.cwd(), '..', '..', 'docs', 'taylor_credibility.json'),
    join(process.cwd(), '..', '..', '..', 'docs', 'taylor_credibility.json'),
  ]
  for (const p of candidates) {
    try { return readFileSync(p, 'utf-8') } catch {}
  }
  return '{}'
}

// ─── Homepage fetch (for brands without an enriched description) ───────────────

async function fetchHomepageText(domain: string): Promise<string> {
  try {
    const resp = await fetch(`https://${domain}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TaylorReachBot/1.0; research only)' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!resp.ok) return ''
    const html = await resp.text()
    // Strip tags, collapse whitespace, truncate — enough for Haiku to summarize
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000)
  } catch {
    return ''
  }
}

// ─── Section A: About the brand ───────────────────────────────────────────────

async function generateAboutSummary(brand: any): Promise<string> {
  const knownDescription = brand.description ?? ''
  const voiceSamples: string[] = brand.voice_samples ?? []
  const categories: string[] = brand.categories ?? []

  // Gather context — prefer enriched description, fall back to homepage fetch
  let context = ''
  if (knownDescription.length > 60) {
    context = knownDescription
  } else if (brand.domain) {
    context = await fetchHomepageText(brand.domain)
  }

  const userContent = `Brand name: ${brand.brand_name}
Domain: ${brand.domain ?? 'unknown'}
Categories: ${categories.join(', ') || 'unknown'}
Enriched description: ${knownDescription || 'not enriched yet'}
Voice samples: ${voiceSamples.slice(0, 2).join(' ') || 'none'}
Homepage / raw context: ${context.slice(0, 2000) || 'not available'}

Write 2-3 factual sentences about:
• What this brand sells and who their customer is
• What makes them distinctive or premium in their space
• Their price positioning (luxury/premium/mass) if apparent

Return only the summary sentences. No preamble, no headers.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      temperature: 0.3,
      system: 'You summarize brands for a PR consultant evaluating sponsorship potential. Be specific and factual. 2-3 sentences only.',
      messages: [{ role: 'user', content: userContent }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const text = sanitizeText(raw)
    return text || `${brand.brand_name} is a ${categories[0] ?? 'consumer'} brand.`
  } catch (err) {
    console.error('[brand_intelligence] About generation failed:', err)
    return `${brand.brand_name} is a ${categories[0] ?? 'consumer'} brand.`
  }
}

// ─── Section B: Why this is an opportunity ────────────────────────────────────

async function generateOpportunitySummary(brand: any, signalHeadlines: string[], credentialJson: string): Promise<string> {
  const categories: string[] = brand.categories ?? []

  const userContent = `Brand: ${brand.brand_name}
About: ${brand.about_summary || 'a parenting/baby brand'}
Categories: ${categories.join(', ') || 'unknown'}
Fit score: ${brand.fit_score ?? 'unknown'} / 100
Size: ${brand.size_band ?? 'unknown'}
Brand kind: ${brand.brand_kind ?? 'brand'}

Most recent signals (why they're in Taylor's pipeline right now):
${signalHeadlines.map(h => `• ${h}`).join('\n') || '• Recently flagged as relevant'}

Taylor's verified credentials (use only what's in here):
${credentialJson.slice(0, 3000)}

Write 2-3 sentences that answer:
1. Why this brand's specific audience (their buyers) would care about baby names / Taylor's expertise
2. What the signal above tells us about WHY NOW is the right time to pitch (be specific, not generic)
3. What TYPE of deal is most natural: "paid sponsorship" (Taylor creates content for them), "media opportunity" (Taylor appears as guest/expert on their channel), "gifted collaboration", or "speaking"

Be direct. Reference the actual signal. Return only the 2-3 sentences.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `You are Taylor Humphrey's pitch strategist. Be specific about why THIS brand matters to Taylor right now.
Avoid generic phrases like "their audience overlaps" without evidence.
Never invent credentials for Taylor — only reference what's in the credibility JSON.
Write in plain prose sentences only. Do not use markdown formatting — no bold (**text**), no bullets, no headers.`,
      messages: [{ role: 'user', content: userContent }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const text = sanitizeText(raw)
    return text || 'This brand represents a strong fit based on recent signals.'
  } catch (err) {
    console.error('[brand_intelligence] Opportunity generation failed:', err)
    return 'This brand represents a strong fit based on recent signals.'
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function generateBrandIntelligence(brandId: string): Promise<BrandIntelligenceResult | null> {
  // Fetch brand + recent signals
  const [{ data: brand }, { data: signals }] = await Promise.all([
    supabase.from('brands').select('*').eq('id', brandId).single(),
    supabase
      .from('signals')
      .select('id, signal_type, headline, detected_at')
      .eq('brand_id', brandId)
      .order('detected_at', { ascending: false })
      .limit(5),
  ])

  if (!brand) {
    console.error(`[brand_intelligence] Brand not found: ${brandId}`)
    return null
  }

  const b = brand as any

  // ── Staleness check ───────────────────────────────────────────────────────
  const intelligenceAt = b.intelligence_generated_at ? new Date(b.intelligence_generated_at) : null
  const lastSignalAt = b.last_signal_at ? new Date(b.last_signal_at) : null
  const isStale =
    !intelligenceAt ||
    (lastSignalAt && intelligenceAt < lastSignalAt)

  if (!isStale && b.about_summary && b.opportunity_summary && b.suggested_angles_json) {
    console.log(`[brand_intelligence] ${b.brand_name}: returning cached intelligence`)
    return {
      about: b.about_summary,
      opportunity: b.opportunity_summary,
      angles: b.suggested_angles_json as GeneratedAngles,
      fromCache: true,
    }
  }

  console.log(`[brand_intelligence] ${b.brand_name}: generating fresh intelligence (stale=${isStale})`)

  const credentialJson = loadCredibility()
  const signalHeadlines = (signals ?? []).map((s: any) => `[${s.signal_type}] ${s.headline}`)
  const latestSignalId = signals?.[0]?.id ?? null

  // ── Generate in parallel where possible ──────────────────────────────────
  // About must finish before opportunity (opportunity uses about_summary)
  const about = await generateAboutSummary({ ...b, about_summary: b.about_summary })

  // Now update brand with about so opportunity can reference it
  const brandWithAbout = { ...b, about_summary: about }
  const [opportunity, anglesResult] = await Promise.all([
    generateOpportunitySummary(brandWithAbout, signalHeadlines, credentialJson),
    latestSignalId ? generateAngles(brandId, latestSignalId) : Promise.resolve(null),
  ])

  // ── Persist to DB ─────────────────────────────────────────────────────────
  await supabase
    .from('brands')
    .update({
      about_summary: about,
      opportunity_summary: opportunity,
      suggested_angles_json: anglesResult ?? null,
      intelligence_generated_at: new Date().toISOString(),
    })
    .eq('id', brandId)

  return {
    about,
    opportunity,
    angles: anglesResult,
    fromCache: false,
  }
}
