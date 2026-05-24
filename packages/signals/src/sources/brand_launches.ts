/**
 * Channel A — Brand-deal source: DTC + retail brand launches.
 *
 * Covers trade publications that report on new product launches,
 * brand campaigns, and retail partnerships in the baby/parenting/family space.
 *
 * Sources chosen to NOT overlap with pr_newswire.ts (Modern Retail is already
 * there) or crunchbase_news.ts (Glossy, TechCrunch already covered).
 *
 * All signals tagged channel: 'brand_deal' → funnel = 'brand_deal'.
 */

import Parser from 'rss-parser'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 15_000 })

// ─── Brand-deal keyword filter ─────────────────────────────────────────────────
// Lean toward actionable brand/product signals, not publisher content.

const BRAND_KEYWORDS = [
  // Product categories Taylor's audience cares about
  'baby', 'infant', 'toddler', 'newborn', 'nursery', 'stroller', 'carrier',
  'crib', 'diaper', 'formula', 'bottle', 'breastfeeding', 'breast pump',
  'nursing', 'postpartum', 'pregnancy', 'maternity', 'prenatal', 'bump',
  'swaddle', 'sleep sack', 'baby monitor', 'highchair', 'feeding', 'pacifier',
  'teether', 'play mat', 'baby food', 'puree', 'snack', 'organic baby',
  // Brand signals
  'launches', 'launch', 'unveils', 'debuts', 'releases', 'expands', 'partners',
  'raises', 'series a', 'series b', 'funding', 'campaign', 'ambassador',
  // Category expansions
  'motherhood', 'mama', 'new mom', 'new parent', 'expecting', 'pregnancy',
  'gender reveal', 'baby shower', 'baby registry', 'kids clothing', 'children',
]

// Exclude publisher/media signals — those belong in the media_opportunity funnel
const PUBLISHER_SIGNALS = [
  'motherly', 'romper', 'scary mommy', 'babycenter', 'the bump', 'cool mom',
  'babylist blog', 'tinybeans', 'parents magazine', 'new york times',
  'podcast episode', 'editorial', 'opinion',
]

function isBrandDeal(text: string): boolean {
  const lower = text.toLowerCase()
  if (PUBLISHER_SIGNALS.some(p => lower.includes(p))) return false
  return BRAND_KEYWORDS.some(kw => lower.includes(kw))
}

// ─── Sources ───────────────────────────────────────────────────────────────────

const SOURCES = [
  {
    // Retail trade pub — covers Target, Walmart, specialty retail launches
    name: 'Retail Dive',
    url: 'https://www.retaildive.com/feeds/news/',
    maxAgeDays: 7,
  },
  {
    // Fashion/apparel trade — catches maternity, baby clothing, nursery brands
    name: 'WWD',
    url: 'https://wwd.com/feed/',
    maxAgeDays: 7,
  },
  {
    // Health/beauty trade — baby skincare, nursing, postpartum wellness brands
    name: 'Happi',
    url: 'https://happi.com/feed/',
    maxAgeDays: 14,
  },
  {
    // Kids/family retail trade — toy launches, nursery brands, baby gear
    name: 'Toy World',
    url: 'https://www.toyworldmag.co.uk/feed/',
    maxAgeDays: 14,
  },
  {
    // Specialty retail news — covers boutique kids/baby brand expansions
    name: 'Gift & Tableware Reporter',
    url: 'https://www.giftandtableware.com/feed/',
    maxAgeDays: 14,
  },
  {
    // Mass market / CPG trade — catches baby food, formula, wipes brand news
    name: 'Progressive Grocer',
    url: 'https://progressivegrocer.com/feed/',
    maxAgeDays: 7,
  },
  {
    // Drug/pharmacy channel — baby skincare, nursing, postpartum brands
    name: 'Drug Store News',
    url: 'https://drugstorenews.com/feed/',
    maxAgeDays: 14,
  },
]

async function fetchSource(source: (typeof SOURCES)[number]): Promise<RawSignal[]> {
  try {
    const feed = await parser.parseURL(source.url)
    const signals: RawSignal[] = []
    const maxAgeMs = source.maxAgeDays * 86_400_000

    for (const item of feed.items.slice(0, 50)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      if (!isBrandDeal(text)) continue

      const pub = item.pubDate ? new Date(item.pubDate) : new Date()
      if (Date.now() - pub.getTime() > maxAgeMs) continue

      signals.push({
        headline: title.trim(),
        excerpt: content.slice(0, 600).trim(),
        url: item.link ?? '',
        publishedAt: pub.toISOString(),
        source: source.name,
        channel: 'brand_deal',
      })
    }

    return signals
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[signals/brand_launches] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s)))
  return results
    .filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}
