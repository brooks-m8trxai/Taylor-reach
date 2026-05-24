/**
 * Channel A — Brand-deal source: Retail distribution signals.
 *
 * Brands entering Target, Walmart, Nordstrom, Babylist, or Maisonette have
 * ALREADY secured a retail partner — they have marketing budget and a
 * demonstrated need for creator amplification at launch.
 *
 * Strategy: filter press release feeds for retail-expansion language
 * ("now available at Target", "launching at Walmart", etc.) combined with
 * baby/family category keywords.
 *
 * TODO (Phase C): Add scraping of Target Press Releases page
 *   (https://corporate.target.com/press/releases) — no RSS available.
 *   Use Playwright to scrape monthly.
 *
 * All signals tagged channel: 'brand_deal'.
 */

import Parser from 'rss-parser'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 15_000 })

// Retail distribution trigger phrases
const RETAIL_PHRASES = [
  'now available at target', 'available at target', 'launching at target', 'sold at target',
  'now available at walmart', 'available at walmart', 'launching at walmart', 'sold at walmart',
  'now at nordstrom', 'available at nordstrom', 'nordstrom launch',
  'babylist exclusive', 'now on babylist', 'babylist partnership', 'added to babylist',
  'maisonette launch', 'now at maisonette', 'maisonette exclusive',
  'amazon launch', 'now on amazon', 'prime day', 'amazon baby registry',
  'whole foods', 'buy buy baby', 'buybuybaby', 'carter\'s launch',
  'lands end kids', 'pottery barn kids', 'crate and kids', 'west elm kids',
  'expanded distribution', 'national retail launch', 'retail debut',
  'retail expansion', 'entering retail', 'brick and mortar launch',
]

const BABY_FAMILY_TERMS = [
  'baby', 'infant', 'toddler', 'newborn', 'nursery', 'stroller', 'carrier',
  'maternity', 'postpartum', 'pregnancy', 'prenatal', 'fertility',
  'breastfeeding', 'nursing', 'formula', 'diaper', 'baby food', 'organic baby',
  'child', 'children', 'family', 'parenting', 'motherhood', 'new mom',
  'pediatric', 'kids', 'play', 'toy', 'sleep', 'feeding',
]

function isRetailSignal(text: string): boolean {
  const lower = text.toLowerCase()
  const hasRetail = RETAIL_PHRASES.some(p => lower.includes(p))
  const hasBabyFamily = BABY_FAMILY_TERMS.some(t => lower.includes(t))
  return hasRetail && hasBabyFamily
}

const SOURCES = [
  {
    // PR Newswire retail vertical — rich source for retail launch announcements
    name: 'PR Newswire',
    url: 'https://www.prnewswire.com/rss/news-releases-list.rss',
    maxAgeDays: 7,
  },
  {
    // Business Wire — DTC brands often announce retail partnerships here
    name: 'Business Wire (retail)',
    url: 'https://feed.businesswire.com/rss/home/?rss=G7&rssid=20',
    maxAgeDays: 7,
  },
  {
    // GlobeNewswire — catches mid-sized brand retail announcements
    name: 'GlobeNewswire',
    url: 'https://www.globenewswire.com/RssFeed/subjectcode/25-Consumer+Products',
    maxAgeDays: 7,
  },
  {
    // Chain Store Age — retailer perspective on new brand additions
    name: 'Chain Store Age',
    url: 'https://chainstoreage.com/feed/',
    maxAgeDays: 7,
  },
]

async function fetchSource(source: (typeof SOURCES)[number]): Promise<RawSignal[]> {
  try {
    const feed = await parser.parseURL(source.url)
    const signals: RawSignal[] = []
    const maxAgeMs = source.maxAgeDays * 86_400_000

    for (const item of feed.items.slice(0, 60)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      if (!isRetailSignal(text)) continue

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
    console.error(`[signals/retail_signals] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s)))
  return results
    .filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}
