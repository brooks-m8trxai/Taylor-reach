/**
 * Scanner orchestrator.
 *
 * Flow:
 *   1. Pull raw signals from all 3 source groups in parallel
 *   2. For each raw signal:
 *        a. If source is a known media publisher (Motherly, Romper, etc.) →
 *           skip Haiku entirely; build extraction with is_media_opportunity=true
 *        b. Otherwise call Claude Haiku to extract brand + score niche fit
 *        c. If Haiku returns empty brand_name, run fallback extraction
 *           (URL slug → title pattern → first proper noun in excerpt)
 *   3. Dedupe against existing signals (brand+URL within 48h)
 *   4. Write new signals to DB, storing is_media_opportunity in metadata
 *   5. Upsert brands for fit >= 60
 *   6. Return stats + high-fit brand IDs for downstream enrichment
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@taylor-reach/db'
import type { SignalType } from '@taylor-reach/db'
// ── Existing sources ──────────────────────────────────────────────────────────
import { fetchSignals as fetchPressWire } from './sources/pr_newswire'
import { fetchSignals as fetchFunding } from './sources/crunchbase_news'
import { fetchSignals as fetchCelebs } from './sources/page_six_celebs'
// ── Channel A: Brand-deal sources ─────────────────────────────────────────────
import { fetchSignals as fetchBrandLaunches } from './sources/brand_launches'
import { fetchSignals as fetchFundedBrands } from './sources/funded_brands'
import { fetchSignals as fetchRetailSignals } from './sources/retail_signals'
import { fetchSignals as fetchSmallBrands } from './sources/small_brands'
// ── Channel B: Content radar sources (Social Media Brain) ─────────────────────
import { fetchSignals as fetchCelebBabies } from './sources/celebrity_babies'
import { fetchSignals as fetchNameTrends } from './sources/name_trends'
import { fetchSignals as fetchParentingCulture } from './sources/parenting_culture'
import type { RawSignal } from './sources/pr_newswire'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

interface HaikuExtraction {
  brand_name: string
  brand_domain: string | null
  signal_type: SignalType
  category_fit: number
  audience_overlap: number
  /** Haiku sets this when the article is FROM a media publisher / creator (not a product brand) */
  is_publisher_or_creator?: boolean
  skip: boolean
  skip_reason: string
}

interface ScanStats {
  rawSignals: number
  relevant: number
  newSignals: number
  brandsCreated: number
  brandsUpdated: number
}

type FinalDecision =
  | { outcome: 'written';                    signalId: string; brandId: string; brandCreated: boolean }
  | { outcome: 'dropped_haiku_skip';         reason: string }
  | { outcome: 'dropped_no_brand' }
  | { outcome: 'dropped_haiku_failed';       error: string }
  | { outcome: 'dropped_below_threshold';    fitScore: number; threshold: number }
  | { outcome: 'dropped_dedupe';             matchType: 'url' | 'domain_48h' | 'seen_this_scan' }
  | { outcome: 'dropped_off_niche';          reason: string }
  | { outcome: 'dropped_brand_upsert_fail';  error: string }
  | { outcome: 'dropped_signal_insert_fail'; error: string }

// ─── Known media publishers (Taylor pitches herself as guest/expert) ──────────
//
// When an article comes from one of these sources, it is a "media opportunity":
// Taylor is the product, not a brand. The publisher is the target.
// These bypass Haiku entirely — we know exactly what they are.

const MEDIA_PUBLISHERS: {
  /** Substring matched against source name OR URL (case-insensitive) */
  match: string
  displayName: string
  /** Prefer podcast_episode over editorial_mention when true */
  hasPodcast: boolean
}[] = [
  { match: 'motherly',       displayName: 'Motherly',          hasPodcast: true  },
  { match: 'mother.ly',      displayName: 'Motherly',          hasPodcast: true  },
  { match: 'romper',         displayName: 'Romper',            hasPodcast: true  },
  { match: 'babylist',       displayName: 'Babylist',          hasPodcast: true  },
  { match: 'parents.com',    displayName: 'Parents Magazine',  hasPodcast: true  },
  { match: 'today.com',      displayName: 'TODAY',             hasPodcast: true  },
  { match: 'vogue',          displayName: 'Vogue',             hasPodcast: false },
  { match: 'nytimes',        displayName: 'The New York Times',hasPodcast: false },
  { match: 'babycenter',     displayName: 'BabyCenter',        hasPodcast: true  },
  { match: 'hellomagazine',  displayName: 'Hello Magazine',    hasPodcast: false },
  { match: 'hello magazine', displayName: 'Hello Magazine',    hasPodcast: false },
  { match: 'guardian',       displayName: 'The Guardian',      hasPodcast: false },
  { match: 'cosmopolitan',   displayName: 'Cosmopolitan',      hasPodcast: false },
  { match: 'newyorker',      displayName: 'The New Yorker',    hasPodcast: false },
  { match: 'new yorker',     displayName: 'The New Yorker',    hasPodcast: false },
  { match: 'people.com',     displayName: 'People',            hasPodcast: true  },
]

function detectMediaPublisher(sourceName: string, url: string): typeof MEDIA_PUBLISHERS[number] | null {
  const haystack = `${sourceName} ${url}`.toLowerCase()
  return MEDIA_PUBLISHERS.find(p => haystack.includes(p.match)) ?? null
}

/** Build the extraction without calling Haiku — used for known media publishers.
 *  signal_type is always 'media_opportunity'; the pitch agent reads
 *  metadata.is_media_opportunity to pick the podcast_guest template.
 */
function buildMediaOpportunityExtraction(
  publisher: typeof MEDIA_PUBLISHERS[number],
): HaikuExtraction {
  return {
    brand_name: publisher.displayName,
    brand_domain: null,
    signal_type: 'media_opportunity',
    category_fit: 90,     // these publishers reach Taylor's exact audience
    audience_overlap: 95,
    is_publisher_or_creator: true,
    skip: false,
    skip_reason: '',
  }
}

// ─── Brand name fallback extraction ───────────────────────────────────────────
//
// Called when Haiku returns an empty brand_name.
// Priority order: title patterns → URL slug → first proper noun in excerpt.

const SKIP_SLUG_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'from', 'best', 'top',
  'new', 'how', 'why', 'what', 'where', 'when', 'who', 'which', 'this',
  'review', 'test', 'tested', 'testing', 'approved', 'fda', 'otc', 'cleared',
  'my', 'its', 'their', 'product', 'brand', 'launch', 'news', 'update',
  'baby', 'mom', 'parent', 'parenting', 'child', 'kids', 'family',
])

function extractFromTitlePattern(headline: string): string | null {
  const patterns: RegExp[] = [
    // "Uresta review:", "BabyBjörn launches", "Hatch raises $"
    /^([A-Z][a-zA-Z0-9]{2,}(?:\s+[A-Z][a-zA-Z0-9]{2,})?)\s+(?:review|launch|raises|closes|announces|expands|releases|unveils|debuts)/i,
    // "I tested Uresta", "I tried the Hatch", "Testing the Snoo"
    /(?:I tested|I tried|Testing|We tested)\s+(?:the\s+)?([A-Z][a-zA-Z0-9]{2,}(?:\s+[A-Z][a-zA-Z0-9]{2,})?)/i,
    // "Review of Uresta", "Review: Uresta"
    /review(?:\s+of|:)\s+([A-Z][a-zA-Z0-9]{2,}(?:\s+[A-Z][a-zA-Z0-9]{2,})?)/i,
    // "X gets FDA clearance", "X passes OTC approval", "X cleared by..."
    /([A-Z][a-zA-Z0-9]{2,}(?:\s+[A-Z][a-zA-Z0-9]{2,})?)\s+(?:gets|gets|receives|earns|passes|cleared|approved|secures)/i,
    // "X is now available", "X is launching"
    /^([A-Z][a-zA-Z0-9]{3,}(?:\s+[A-Z][a-zA-Z0-9]{2,})?)\s+(?:is |are |has )/,
  ]
  for (const p of patterns) {
    const m = headline.match(p)
    const candidate = m?.[1]?.trim()
    if (candidate && candidate.length >= 3 && !SKIP_SLUG_WORDS.has(candidate.toLowerCase())) {
      return candidate
    }
  }
  return null
}

function extractFromUrlSlug(url: string): string | null {
  try {
    const pathname = new URL(url.startsWith('http') ? url : `https://x.com${url}`).pathname
    const segments = pathname.split('/').filter(Boolean)
    // The last segment is the article slug; earlier segments may be categories
    const slug = segments[segments.length - 1] ?? ''
    const words = slug
      .split(/[-_]/)
      .map(w => w.replace(/[^a-zA-Z]/g, '').toLowerCase())
      .filter(w => w.length >= 4 && !SKIP_SLUG_WORDS.has(w))
    if (words[0]) return words[0].charAt(0).toUpperCase() + words[0].slice(1)
  } catch {}
  return null
}

function extractFirstProperNounFromExcerpt(excerpt: string): string | null {
  // Skip the first word of every sentence (capitalised by grammar, not by brand).
  // Look for a capitalised word mid-sentence that isn't a generic stop-word.
  const tokens = excerpt.split(/\s+/)
  for (let i = 1; i < tokens.length && i < 80; i++) {
    const prev = tokens[i - 1] ?? ''
    const startsNewSentence = /[.!?]$/.test(prev)
    if (startsNewSentence) continue

    const word = tokens[i].replace(/[^a-zA-Z]/g, '')
    if (
      word.length >= 4
      && /^[A-Z]/.test(word)
      && !SKIP_SLUG_WORDS.has(word.toLowerCase())
    ) {
      return word
    }
  }
  return null
}

type FallbackSource = 'title_pattern' | 'url_slug' | 'excerpt_proper_noun'

function fallbackBrandName(
  headline: string,
  excerpt: string,
  url: string,
): { name: string; source: FallbackSource } | null {
  const fromTitle = extractFromTitlePattern(headline)
  if (fromTitle) return { name: fromTitle, source: 'title_pattern' }

  const fromSlug = extractFromUrlSlug(url)
  if (fromSlug) return { name: fromSlug, source: 'url_slug' }

  const fromExcerpt = extractFirstProperNounFromExcerpt(excerpt)
  if (fromExcerpt) return { name: fromExcerpt, source: 'excerpt_proper_noun' }

  return null
}

// ─── Per-signal structured logger ─────────────────────────────────────────────

type ExtractionPath =
  | { path: 'publisher_override'; publisher: string }
  | { path: 'haiku_publisher_detected'; publisher: string }  // Haiku returned is_publisher_or_creator=true
  | { path: 'haiku' }
  | { path: 'haiku_with_fallback'; fallbackSource: FallbackSource }

function logSignal(
  index: number,
  total: number,
  raw: RawSignal,
  haiku: HaikuExtraction | null,
  haikuRaw: string,
  extractionPath: ExtractionPath,
  fitScore: number | null,
  fitBreakdown: string | null,
  dedupeResult: { isDupe: boolean; matchType?: 'url' | 'domain_48h' | 'seen_this_scan' } | null,
  decision: FinalDecision,
): void {
  const SEP = '─'.repeat(60)
  const lines: string[] = [
    `[scanner] ${SEP}`,
    `[scanner] Signal ${index}/${total}  source="${raw.source}"`,
    `[scanner]   title: ${raw.headline.slice(0, 100)}${raw.headline.length > 100 ? '…' : ''}`,
    `[scanner]   url:   ${raw.url || '(no url)'}`,
    `[scanner]   age:   ${Math.round((Date.now() - new Date(raw.publishedAt).getTime()) / 3_600_000)}h old`,
  ]

  // Extraction path label
  switch (extractionPath.path) {
    case 'publisher_override':
      lines.push(`[scanner]   path:  PUBLISHER_OVERRIDE → "${extractionPath.publisher}" (media_opportunity, skipped Haiku)`)
      break
    case 'haiku_publisher_detected':
      lines.push(`[scanner]   path:  haiku → PUBLISHER/CREATOR DETECTED → "${extractionPath.publisher}" (media_opportunity)`)
      break
    case 'haiku':
      lines.push(`[scanner]   path:  haiku`)
      break
    case 'haiku_with_fallback':
      lines.push(`[scanner]   path:  haiku → brand empty → FALLBACK(${extractionPath.fallbackSource})`)
      break
  }

  // Haiku result (not shown for publisher overrides which skip Haiku entirely)
  if (haiku === null && extractionPath.path !== 'publisher_override') {
    lines.push(`[scanner]   haiku: FAILED — ${haikuRaw}`)
  } else if (haiku !== null) {
    lines.push(
      `[scanner]   haiku: brand="${haiku.brand_name || '(none)'}"  domain=${haiku.brand_domain ?? 'null'}  type=${haiku.signal_type}`,
      `[scanner]   haiku: category_fit=${haiku.category_fit}  audience_overlap=${haiku.audience_overlap}  skip=${haiku.skip}${haiku.skip_reason ? `  reason="${haiku.skip_reason}"` : ''}`,
    )
  }

  // Fit score
  if (fitBreakdown !== null) {
    lines.push(`[scanner]   score: ${fitBreakdown}  → ${fitScore}`)
  }

  // Dedupe
  if (dedupeResult !== null) {
    lines.push(
      dedupeResult.isDupe
        ? `[scanner]   dedupe: MATCH (${dedupeResult.matchType})`
        : `[scanner]   dedupe: no match`,
    )
  }

  // Final decision
  switch (decision.outcome) {
    case 'written':
      lines.push(`[scanner]   ✅ WRITTEN  signal_id=${decision.signalId}  brand_id=${decision.brandId} (${decision.brandCreated ? 'created' : 'updated'})`)
      break
    case 'dropped_haiku_skip':
      lines.push(`[scanner]   ❌ DROPPED  haiku_skip: ${decision.reason}`)
      break
    case 'dropped_no_brand':
      lines.push(`[scanner]   ❌ DROPPED  no brand name extracted (Haiku empty + all fallbacks failed)`)
      break
    case 'dropped_haiku_failed':
      lines.push(`[scanner]   ❌ DROPPED  haiku_failed: ${decision.error}`)
      break
    case 'dropped_below_threshold':
      lines.push(`[scanner]   ❌ DROPPED  fit_score=${decision.fitScore} < threshold(${decision.threshold})`)
      break
    case 'dropped_dedupe':
      lines.push(`[scanner]   ❌ DROPPED  dedupe: ${
        decision.matchType === 'url'          ? 'exact URL already in signals table'
        : decision.matchType === 'seen_this_scan' ? 'URL already processed in this scan run'
        : 'same domain seen within last 48h'
      }`)
      break
    case 'dropped_off_niche':
      lines.push(`[scanner]   🚫 DROPPED  off_niche_excluded: ${decision.reason}`)
      break
    case 'dropped_brand_upsert_fail':
      lines.push(`[scanner]   ❌ DROPPED  brand_upsert_failed: ${decision.error}`)
      break
    case 'dropped_signal_insert_fail':
      lines.push(`[scanner]   ❌ DROPPED  signal_insert_failed: ${decision.error}`)
      break
  }

  console.log(lines.join('\n'))
}

// ─── Brand fit scoring (matches brand-rules.md formula exactly) ────────────────

interface FitInputs {
  categoryFit: number
  signalAgeDays: number
  budgetSignalScore: number
  audienceOverlap: number
  pastCreatorTierScore: number
}

function computeFitScore(opts: FitInputs): { score: number; breakdown: string } {
  const { categoryFit, signalAgeDays, budgetSignalScore, audienceOverlap, pastCreatorTierScore } = opts

  let signalRecency = 15
  if (signalAgeDays <= 7)  signalRecency = 100
  else if (signalAgeDays <= 14) signalRecency = 75
  else if (signalAgeDays <= 30) signalRecency = 40

  const uniqueness = 70

  const score = Math.round(
    0.35 * categoryFit
    + 0.20 * signalRecency
    + 0.15 * budgetSignalScore
    + 0.15 * audienceOverlap
    + 0.10 * pastCreatorTierScore
    + 0.05 * uniqueness,
  )

  const breakdown = `cat(${categoryFit})×.35 + recency(${signalRecency})×.20 + budget(${budgetSignalScore})×.15 + audience(${audienceOverlap})×.15 + creator(${pastCreatorTierScore})×.10 + unique(${uniqueness})×.05`

  return { score, breakdown }
}

// ─── Haiku brand extraction ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a signal-processing agent for a baby name consultant's brand partnership system.

Given a press headline and excerpt, extract:
1. The PRIMARY brand being written about (the company with a product launch, campaign, funding round, or news)
2. Whether this signal is relevant to a baby name consultant's partnership pipeline

Taylor's niche pillars: baby naming, pregnancy, new parenthood (0-2 years), modern parenting culture, family identity.

Category fit scale (0-100):
- Baby naming services/products: 100
- Pregnancy/prenatal/postpartum products: 95
- Baby gear (strollers, sleep, carriers, monitors): 90
- Baby/kid food + nutrition: 85
- Parenting apps + digital subscriptions: 85
- Maternity fashion + postpartum body care: 85
- Premium/luxury baby brands: 80
- Family clothing (matching, gender-neutral): 80
- Children's books/media: 75
- Kids products (3+ years): 60
- Home/lifestyle for new parents: 65
- Health/wellness with motherhood angle: 65
- General DTC women's brands: 35
- Unrelated categories: < 30

PUBLISHER vs PRODUCT BRAND detection (is_publisher_or_creator field):
- Set is_publisher_or_creator: TRUE if the article is published BY a media outlet, blog, podcast, or content creator that covers parenting/family/lifestyle topics (e.g., Scary Mommy, Fatherly, Tinybeans, Cool Mom Picks, Motherly, Today Show, Romper, BabyCenter). The TARGET for Taylor is the publication itself — she would pitch herself as a guest expert or contributor.
- Set is_publisher_or_creator: FALSE for product/DTC brands (baby gear, formula, clothing, apps, etc.). The TARGET is the brand's marketing team for a sponsorship deal.
- When is_publisher_or_creator is TRUE: brand_name = the publication/show/creator name; signal_type = "media_opportunity".

Important: extract the BRAND or PUBLICATION being written ABOUT or FROM.
If no specific brand is clearly identifiable from the content, return brand_name as an empty string — do NOT fall back to the publisher name when reporting on a product brand.

Respond with valid JSON only. No markdown.`

async function callHaiku(signal: RawSignal): Promise<{ extraction: HaikuExtraction | null; rawResponse: string }> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      temperature: 0.2,   // conservative — reduces hallucinated brand names
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Headline: ${signal.headline}\n\nExcerpt: ${signal.excerpt}\n\nSource: ${signal.source}\n\nReturn JSON with these fields:
{
  "brand_name": "Company name OR publication name (if is_publisher_or_creator) OR empty string if nothing identifiable",
  "brand_domain": "domain.com or null",
  "signal_type": one of: product_launch|campaign_launch|funding_round|creator_partnership|celebrity_moment|editorial_mention|hiring_signal|podcast_episode|seasonal_window|taylor_press_hit|media_opportunity,
  "category_fit": 0-100,
  "audience_overlap": 0-100 (does their audience match expecting/new parents aged 25-40?),
  "is_publisher_or_creator": true if this is a media publication/blog/podcast/creator (not a product brand),
  "skip": true if no identifiable entity OR category_fit < 30,
  "skip_reason": "reason or empty"
}`,
      }],
    })

    const rawResponse = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const extraction = JSON.parse(cleaned) as HaikuExtraction
    return { extraction, rawResponse }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return { extraction: null, rawResponse: errMsg }
  }
}

// ─── Dedupe check ─────────────────────────────────────────────────────────────

async function checkDedupe(
  tenantId: string,
  brandDomain: string | null,
  sourceUrl: string,
): Promise<{ isDupe: boolean; matchType?: 'url' | 'domain_48h' }> {
  if (sourceUrl) {
    const { data } = await supabase
      .from('signals')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('source_url', sourceUrl)
      .limit(1)
    if (data && data.length > 0) return { isDupe: true, matchType: 'url' }
  }

  if (brandDomain) {
    const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString()
    const { data } = await supabase
      .from('signals')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('brand_domain', brandDomain)
      .gte('detected_at', cutoff)
      .limit(1)
    if (data && data.length > 0) return { isDupe: true, matchType: 'domain_48h' }
  }

  return { isDupe: false }
}

// ─── Niche filter ─────────────────────────────────────────────────────────────
//
// Hard gates applied AFTER Haiku extraction and BEFORE writing to brands table.
// Prevents clearly off-niche brands from entering the library regardless of
// Haiku's score — Haiku occasionally passes brands that are tangentially
// baby-adjacent but not a real partnership fit.
//
// Policy: DROP if any hard-exclude pattern matches, or if no hard-include
// criteria are met for non-publisher signals.

// Hard-exclude keyword patterns — these categories are never a fit.
const OFF_NICHE_EXCLUDE: RegExp[] = [
  // Energy/protein/snack bars for adults
  /\blärabar|larabar|rxbar|clif\s*bar|kind\s*bar|quest\s*bar|protein\s*bar|energy\s*bar\b/i,
  // Lunchables / school-lunch products (school-age kids, not baby/toddler)
  /\blunchable|uncrustable|lunchbox\s*brand\b/i,
  // Adult food/beverage chains unrelated to parenting
  /\bparis\s*baguette|kwench|boba\s*shop|coffee\s*chain|smoothie\s*chain|juice\s*bar\b/i,
  // B2B SaaS with no parenting angle
  /\benterprise\s*(saas|software)|b2b\s*(tech|platform)|hr\s*software|payroll\s*(tool|software)\b/i,
  // Generic celebrity/entertainment not parenting-linked
  /\bhello\s*nation|hellonation\b/i,
  // School-age food marketing (Lunchables category)
  /\bschool\s*lunch|after.?school\s*snack\s*brand\b/i,
]

// Hard-include: at least one must pass for non-publisher product signals
const IN_NICHE_INCLUDE: RegExp[] = [
  // Core baby (0-24 months)
  /\bbaby|newborn|infant|toddler|diaper|stroller|crib|bassinet|swaddle|formula|breast\s*pump|baby\s*food|baby\s*gear|baby\s*monitor|car\s*seat|baby\s*carrier\b/i,
  // Pregnancy & postpartum
  /\bpregnant|pregnancy|prenatal|postpartum|maternity|trimester|ob.?gyn|fertility|ivf|surrogacy|doula|midwif\b/i,
  // Parenting media & services
  /\bparenting|new\s*parent|expecting\s*parent|family\s*brand|parenting\s*app|baby\s*name|naming\s*service\b/i,
  // 0-5 products (preschool included)
  /\bpreschool|toddler\s*food|toddler\s*sleep|toddler\s*gear|early\s*childhood|sensory\s*play|early\s*learning\b/i,
  // Breastfeeding & nutrition
  /\bbreastfeed|lactation|nursing\s*pad|bottle\s*feeding|wean\b/i,
]

/**
 * Returns null if the brand is in-niche, or a reason string if it should be dropped.
 * Media opportunities (publishers, podcasts) bypass the include check but still
 * get the hard-exclude check applied.
 */
function nicheFilter(
  brandName: string,
  headline: string,
  excerpt: string,
  isMediaOpportunity: boolean,
): string | null {
  const haystack = `${brandName} ${headline} ${excerpt}`.toLowerCase()

  // Hard exclude — applies to everyone
  for (const re of OFF_NICHE_EXCLUDE) {
    if (re.test(haystack)) {
      return `matched hard-exclude pattern: ${re.source.slice(0, 60)}`
    }
  }

  // Media opportunities (publishers) skip the include check — if they passed
  // Haiku and aren't hard-excluded, we trust them.
  if (isMediaOpportunity) return null

  // Product brands must pass at least one include pattern
  for (const re of IN_NICHE_INCLUDE) {
    if (re.test(haystack)) return null
  }

  return `no in-niche include pattern matched (brand/signal appears off-niche)`
}

// ─── Brand upsert ─────────────────────────────────────────────────────────────

async function upsertBrand(
  tenantId: string,
  extraction: HaikuExtraction,
  fitScore: number,
  brandKind: 'brand' | 'publisher' | 'creator' = 'brand',
): Promise<{ id: string; created: boolean }> {
  const query = extraction.brand_domain
    ? supabase.from('brands').select('id, status').eq('tenant_id', tenantId).eq('domain', extraction.brand_domain).maybeSingle()
    : supabase.from('brands').select('id, status').eq('tenant_id', tenantId).ilike('brand_name', extraction.brand_name).maybeSingle()

  const { data: existing } = await query

  if (existing) {
    await supabase
      .from('brands')
      .update({
        last_signal_at: new Date().toISOString(),
        fit_score: fitScore,
        brand_kind: brandKind,
        status: (existing as any).status === 'new' ? 'scoring' : (existing as any).status,
      })
      .eq('id', existing.id)
    return { id: existing.id, created: false }
  }

  const { data: created, error } = await supabase
    .from('brands')
    .insert({
      tenant_id: tenantId,
      brand_name: extraction.brand_name,
      domain: extraction.brand_domain,
      categories: [],
      fit_score: fitScore,
      brand_kind: brandKind,
      status: fitScore >= 75 ? 'scoring' : 'new',
      last_signal_at: new Date().toISOString(),
      conflict_flag: { is_competitor_of: [], blocked_until: null },
      voice_samples: [],
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`Brand insert failed: ${error?.message}`)
  }

  return { id: created.id, created: true }
}

// ─── Main run function ─────────────────────────────────────────────────────────

export interface ScanResult extends ScanStats {
  highFitBrandIds: string[]
  newSignalIds: string[]
}

export async function run(tenantId: string): Promise<ScanResult> {
  console.log(`\n[scanner] ${'═'.repeat(60)}`)
  console.log(`[scanner] SCAN START  tenant=${tenantId}  time=${new Date().toISOString()}`)
  console.log(`[scanner] ${'═'.repeat(60)}`)

  const [
    pressWire, funding, celebs,
    brandLaunches, fundedBrands, retailSignals, smallBrands,
    celebBabies, nameTrends, parentingCulture,
  ] = await Promise.all([
    fetchPressWire(),
    fetchFunding(),
    fetchCelebs(),
    fetchBrandLaunches(),
    fetchFundedBrands(),
    fetchRetailSignals(),
    fetchSmallBrands(),
    fetchCelebBabies(),
    fetchNameTrends(),
    fetchParentingCulture(),
  ])
  const allRaw = [
    ...pressWire, ...funding, ...celebs,
    ...brandLaunches, ...fundedBrands, ...retailSignals, ...smallBrands,
    ...celebBabies, ...nameTrends, ...parentingCulture,
  ]

  console.log([
    `[scanner] Sources:`,
    `  pressWire=${pressWire.length}`,
    `  funding=${funding.length}`,
    `  celebs=${celebs.length}`,
    `  brandLaunches=${brandLaunches.length}`,
    `  fundedBrands=${fundedBrands.length}`,
    `  retailSignals=${retailSignals.length}`,
    `  smallBrands=${smallBrands.length}`,
    `  celebBabies=${celebBabies.length}`,
    `  nameTrends=${nameTrends.length}`,
    `  parentingCulture=${parentingCulture.length}`,
    `  total=${allRaw.length}`,
  ].join('  '))

  const stats: ScanStats = {
    rawSignals: allRaw.length,
    relevant: 0,
    newSignals: 0,
    brandsCreated: 0,
    brandsUpdated: 0,
  }
  const highFitBrandIds: string[] = []
  const newSignalIds: string[] = []

  // In-memory URL dedup — prevents the same URL from being processed twice
  // within this scan run (catches races between batches and avoids false positives
  // against a currently-empty signals table).
  const seenUrls = new Set<string>()

  const BATCH_SIZE = 3
  for (let i = 0; i < allRaw.length; i += BATCH_SIZE) {
    const batch = allRaw.slice(i, i + BATCH_SIZE)

    await Promise.all(batch.map(async (raw, batchOffset) => {
      const signalIndex = i + batchOffset + 1

      // ── Content radar bypass ──────────────────────────────────────────────
      // Signals with channel='content_radar' are cultural moments / IG content
      // ideas for the Social Media Brain. They skip Haiku, fit scoring, niche
      // filter, and brand upsert — just dedupe by URL and write directly.

      if (raw.channel === 'content_radar') {
        if (raw.url && seenUrls.has(raw.url)) return

        const { isDupe } = await checkDedupe(tenantId, null, raw.url)
        if (isDupe) return

        if (raw.url) seenUrls.add(raw.url)

        const { data: radarSignal, error: radarErr } = await supabase
          .from('signals')
          .insert({
            tenant_id: tenantId,
            source: raw.source,
            source_url: raw.url || null,
            signal_type: 'content_idea' as SignalType,
            funnel: 'content_radar',
            brand_name: raw.source, // source is the "brand" for radar signals
            brand_domain: null,
            brand_id: null,
            headline: raw.headline,
            raw_excerpt: raw.excerpt || null,
            niche_fit_score: null,
            needs_review: false,
            detected_at: new Date().toISOString(),
            source_published_at: raw.publishedAt,
            metadata: {},
            raw_payload: { source: raw.source, url: raw.url },
          })
          .select('id')
          .single()

        if (!radarErr && radarSignal) {
          stats.newSignals++
          newSignalIds.push(radarSignal.id)
          console.log(`[scanner] 🧠 RADAR  "${raw.headline.slice(0, 80)}"  src="${raw.source}"`)
        } else if (radarErr) {
          console.error(`[scanner] radar insert failed: ${radarErr.message}`)
        }
        return
      }

      // ── Step 1: determine extraction path ────────────────────────────────

      let extraction: HaikuExtraction | null = null
      let haikuRaw = ''
      let extractionPath: ExtractionPath

      const knownPublisher = detectMediaPublisher(raw.source, raw.url)

      if (knownPublisher) {
        // Publisher override — no Haiku call needed
        extraction = buildMediaOpportunityExtraction(knownPublisher)
        extractionPath = { path: 'publisher_override', publisher: knownPublisher.displayName }
      } else {
        // Normal Haiku extraction
        const result = await callHaiku(raw)
        extraction = result.extraction
        haikuRaw = result.rawResponse

        if (extraction === null) {
          logSignal(signalIndex, allRaw.length, raw, null, haikuRaw,
            { path: 'haiku' }, null, null, null,
            { outcome: 'dropped_haiku_failed', error: haikuRaw })
          return
        }

        // Haiku said skip
        if (extraction.skip) {
          logSignal(signalIndex, allRaw.length, raw, extraction, haikuRaw,
            { path: 'haiku' }, null, null, null,
            { outcome: 'dropped_haiku_skip', reason: extraction.skip_reason || `category_fit=${extraction.category_fit}` })
          return
        }

        // Haiku returned empty brand name — try fallbacks
        if (!extraction.brand_name) {
          const fallback = fallbackBrandName(raw.headline, raw.excerpt, raw.url)
          if (fallback) {
            extraction = { ...extraction, brand_name: fallback.name }
            extractionPath = { path: 'haiku_with_fallback', fallbackSource: fallback.source }
          } else {
            logSignal(signalIndex, allRaw.length, raw, extraction, haikuRaw,
              { path: 'haiku' }, null, null, null,
              { outcome: 'dropped_no_brand' })
            return
          }
        } else {
          extractionPath = { path: 'haiku' }
        }

        // Haiku dynamically detected a publisher/creator — upgrade to media_opportunity
        // even if it wasn't in the hardcoded MEDIA_PUBLISHERS list.
        if (extraction.is_publisher_or_creator === true && extraction.brand_name) {
          extraction = {
            ...extraction,
            signal_type: 'media_opportunity',
            category_fit: Math.max(extraction.category_fit, 75),
            audience_overlap: Math.max(extraction.audience_overlap, 80),
          }
          extractionPath = { path: 'haiku_publisher_detected', publisher: extraction.brand_name }
        }
      }

      stats.relevant++

      // ── Step 2: fit score ─────────────────────────────────────────────────

      const ageDays = (Date.now() - new Date(raw.publishedAt).getTime()) / 86_400_000
      const { score: baseFitScore, breakdown } = computeFitScore({
        categoryFit: extraction.category_fit,
        signalAgeDays: ageDays,
        budgetSignalScore: 50,
        audienceOverlap: extraction.audience_overlap,
        pastCreatorTierScore: 50,
      })

      // ── Channel-specific score boosts ─────────────────────────────────────
      // Applied after base fit score so they don't distort the formula weights.
      // Use raw.channel here (not funnel) because funnel is derived below.
      let fitScore = baseFitScore
      if (raw.channel === 'brand_deal') {
        fitScore = Math.min(100, fitScore + 10)   // monetizable brand deal: +10
        // Funding signal keywords in the headline: extra +5 (total +15 vs base)
        const headlineLower = raw.headline.toLowerCase()
        if (
          headlineLower.includes('raises') || headlineLower.includes('series') ||
          headlineLower.includes('funding') || headlineLower.includes('investment')
        ) {
          fitScore = Math.min(100, fitScore + 5)
        }
      }

      const THRESHOLD = 40

      if (fitScore < THRESHOLD) {
        logSignal(signalIndex, allRaw.length, raw, extraction, haikuRaw,
          extractionPath, fitScore, breakdown, null,
          { outcome: 'dropped_below_threshold', fitScore, threshold: THRESHOLD })
        return
      }

      // Derive media-opportunity flag + brand kind now — used in Steps 4 and 5
      const isMediaOpportunity =
        extractionPath.path === 'publisher_override' ||
        extractionPath.path === 'haiku_publisher_detected'
      const brandKind: 'brand' | 'publisher' | 'creator' = isMediaOpportunity ? 'publisher' : 'brand'

      // ── Channel / funnel derivation ───────────────────────────────────────
      // funnel drives the three-pane UI split and filtering.
      // Note: 'content_radar' signals are handled by the early-return bypass above
      // and never reach this point, so only brand_deal and media_opportunity apply.
      const funnel: 'brand_deal' | 'media_opportunity' | 'content_radar' | null =
        isMediaOpportunity         ? 'media_opportunity'
        : raw.channel === 'brand_deal' ? 'brand_deal'
        : null

      // ── Step 2b: niche filter ─────────────────────────────────────────────
      // Hard gates AFTER fit score, BEFORE brand creation. Drops brands that
      // slipped through Haiku's loose scoring but are clearly off-niche.

      const nicheRejectReason = nicheFilter(
        extraction.brand_name,
        raw.headline,
        raw.excerpt,
        isMediaOpportunity,
      )
      if (nicheRejectReason) {
        logSignal(signalIndex, allRaw.length, raw, extraction, haikuRaw,
          extractionPath, fitScore, breakdown, null,
          { outcome: 'dropped_off_niche', reason: nicheRejectReason })
        return
      }

      // ── Step 3: dedupe ────────────────────────────────────────────────────

      // In-memory check first — catches dupes within this scan run without a DB round-trip.
      if (raw.url && seenUrls.has(raw.url)) {
        logSignal(signalIndex, allRaw.length, raw, extraction, haikuRaw,
          extractionPath, fitScore, breakdown,
          { isDupe: true, matchType: 'seen_this_scan' },
          { outcome: 'dropped_dedupe', matchType: 'seen_this_scan' })
        return
      }

      const dedupeResult = await checkDedupe(tenantId, extraction.brand_domain, raw.url)

      if (dedupeResult.isDupe) {
        logSignal(signalIndex, allRaw.length, raw, extraction, haikuRaw,
          extractionPath, fitScore, breakdown, dedupeResult,
          { outcome: 'dropped_dedupe', matchType: dedupeResult.matchType! })
        return
      }

      // ── Step 4: brand upsert ──────────────────────────────────────────────

      let brandId: string | null = null
      let brandCreated = false

      try {
        const result = await upsertBrand(tenantId, extraction, fitScore, brandKind)
        brandId = result.id
        brandCreated = result.created
        if (result.created) stats.brandsCreated++
        else stats.brandsUpdated++
        if (fitScore >= 60 && brandId) highFitBrandIds.push(brandId)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        logSignal(signalIndex, allRaw.length, raw, extraction, haikuRaw,
          extractionPath, fitScore, breakdown, dedupeResult,
          { outcome: 'dropped_brand_upsert_fail', error: errMsg })
        return
      }

      // ── Step 5: signal insert ─────────────────────────────────────────────

      // Build metadata — persists media_opportunity flag and publisher name for angle generator
      const signalMetadata: Record<string, unknown> = {}
      if (isMediaOpportunity) {
        signalMetadata.is_media_opportunity = true
        // publisher_name is available on both publisher_override and haiku_publisher_detected paths
        const publisherName =
          extractionPath.path === 'publisher_override'   ? extractionPath.publisher
          : extractionPath.path === 'haiku_publisher_detected' ? extractionPath.publisher
          : undefined
        if (publisherName) signalMetadata.publisher_name = publisherName
      }
      if (extractionPath.path === 'haiku_with_fallback') {
        signalMetadata.brand_fallback_source = extractionPath.fallbackSource
      }

      const { data: signal, error: sigErr } = await supabase
        .from('signals')
        .insert({
          tenant_id: tenantId,
          source: raw.source,
          source_url: raw.url || null,
          signal_type: extraction.signal_type,
          funnel: funnel ?? null,
          brand_name: extraction.brand_name,
          brand_domain: extraction.brand_domain,
          brand_id: brandId,
          headline: raw.headline,
          raw_excerpt: raw.excerpt || null,
          niche_fit_score: fitScore,
          needs_review: fitScore < 65,
          detected_at: new Date().toISOString(),
          source_published_at: raw.publishedAt,
          metadata: signalMetadata,
          raw_payload: { source: raw.source, url: raw.url },
        })
        .select('id')
        .single()

      if (sigErr || !signal) {
        logSignal(signalIndex, allRaw.length, raw, extraction, haikuRaw,
          extractionPath, fitScore, breakdown, dedupeResult,
          { outcome: 'dropped_signal_insert_fail', error: sigErr?.message ?? 'no data returned' })
        return
      }

      stats.newSignals++
      newSignalIds.push(signal.id)
      // Mark URL as processed so subsequent batches in this run don't re-insert it
      if (raw.url) seenUrls.add(raw.url)

      logSignal(signalIndex, allRaw.length, raw, extraction, haikuRaw,
        extractionPath, fitScore, breakdown, dedupeResult,
        { outcome: 'written', signalId: signal.id, brandId: brandId!, brandCreated })
    }))
  }

  console.log(`\n[scanner] ${'═'.repeat(60)}`)
  console.log(`[scanner] SCAN DONE`)
  console.log(`[scanner]   raw=${stats.rawSignals}  relevant=${stats.relevant}  new=${stats.newSignals}`)
  console.log(`[scanner]   brands_created=${stats.brandsCreated}  brands_updated=${stats.brandsUpdated}`)
  console.log(`[scanner]   high_fit_brands=${highFitBrandIds.length}  (fit>=60, queued for enrichment)`)
  console.log(`[scanner] ${'═'.repeat(60)}\n`)

  return { ...stats, highFitBrandIds: [...new Set(highFitBrandIds)], newSignalIds }
}
