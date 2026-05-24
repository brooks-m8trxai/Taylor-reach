/**
 * Channel A — Brand-deal source: Emerging & small brand discovery.
 *
 * Sources that surface new/small brands BEFORE they're saturated with macro
 * creators — Taylor's best opportunity window. A Cubby editorial mention or
 * Babylist New & Notable is a much stronger signal for emerging brands than
 * a TechCrunch article.
 *
 * The Cool Mom Picks gift guide format is especially valuable: each guide
 * IS a curated list of pitchable brands with audience validation built in.
 *
 * All signals tagged channel: 'brand_deal'.
 */

import Parser from 'rss-parser'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 15_000 })

// Keywords that suggest an emerging/reviewable brand (not just celebrity news)
const BRAND_DISCOVERY_KEYWORDS = [
  // Direct product mentions
  'best', 'top', 'new', 'launches', 'review', 'tested', 'picks', 'favorites',
  'gift guide', 'gift ideas', 'registry', 'baby shower', 'must have',
  'editor\'s pick', 'notable', 'worth it', 'recommendation',
  // Product categories
  'baby', 'infant', 'toddler', 'newborn', 'nursery', 'stroller', 'carrier',
  'crib', 'diaper', 'formula', 'bottle', 'nursing', 'postpartum', 'pregnancy',
  'maternity', 'baby food', 'swaddle', 'sleep', 'feeding', 'play mat',
  'baby monitor', 'highchair', 'car seat', 'bassinet', 'baby gear',
  'kids clothing', 'children', 'toys', 'organic',
]

// Skip pure listicle/editorial content — we want brand signals, not mom advice
const SKIP_PATTERNS = [
  'how to', 'tips for', 'when to', 'signs that', 'ways to', 'things every',
  'celebrity', 'royal baby', 'famous', 'star', 'actress',
]

function isSmallBrandSignal(text: string): boolean {
  const lower = text.toLowerCase()
  if (SKIP_PATTERNS.some(p => lower.includes(p))) return false
  return BRAND_DISCOVERY_KEYWORDS.some(kw => lower.includes(kw))
}

const SOURCES = [
  {
    // Cubby — dedicated to thoughtful reviews of emerging baby/kid brands
    // Strong signal for small brands with quality-conscious audiences
    name: 'Cubby',
    url: 'https://cubbyathome.com/feed/',
    maxAgeDays: 14,
  },
  {
    // Babylist blog — editorial coverage of their own registry brands;
    // being on Babylist = commerce validation + engaged expectant parent audience
    name: 'Babylist',
    url: 'https://www.babylist.com/blog/feed',
    maxAgeDays: 14,
  },
  {
    // Project Nursery — nursery/baby gear reviews, covers emerging brands
    // strong for nursery furniture, decor, small batch baby brands
    name: 'Project Nursery',
    url: 'https://projectnursery.com/feed/',
    maxAgeDays: 14,
  },
  {
    // The Bump editorial — covers new products and brands for expectant parents
    name: 'The Bump',
    url: 'https://www.thebump.com/feed',
    maxAgeDays: 14,
  },
  {
    // Lucie's List — no-BS baby gear reviews; brand mentions here are earned
    // One of the most trusted sources for stroller/car seat/carrier reviews
    name: "Lucie's List",
    url: 'https://www.lucieslist.com/feed/',
    maxAgeDays: 21,
  },
  {
    // Fatherly — dadvertorial content but good signal for gender-neutral baby brands
    name: 'Fatherly',
    url: 'https://www.fatherly.com/feed/',
    maxAgeDays: 14,
  },
]

async function fetchSource(source: (typeof SOURCES)[number]): Promise<RawSignal[]> {
  try {
    const feed = await parser.parseURL(source.url)
    const signals: RawSignal[] = []
    const maxAgeMs = source.maxAgeDays * 86_400_000

    for (const item of feed.items.slice(0, 40)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      if (!isSmallBrandSignal(text)) continue

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
    console.error(`[signals/small_brands] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s)))
  return results
    .filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}
