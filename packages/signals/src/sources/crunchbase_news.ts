/**
 * Funding + business signals for baby/parenting DTC brands.
 * Sources: Crunchbase News, TechCrunch, Entrepreneur, The Toy Book,
 *          Glossy, Glossy Beauty.
 * Funding rounds and hiring signals indicate brands with budget right now.
 * Glossy covers brand marketing/retail moves in beauty/fashion — catches
 * premium brands targeting new moms or launching maternal/baby lines.
 */

import Parser from 'rss-parser'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 15_000 })

const FUNDING_KEYWORDS = [
  'baby', 'infant', 'toddler', 'parenting', 'family', 'maternity', 'postpartum',
  'pregnancy', 'expecting', 'childcare', 'nursery', 'pediatric', 'kids', 'children',
  'stroller', 'carrier', 'sleep training', 'breastfeeding', 'diaper', 'baby food',
  'prenatal', 'fertility', 'newborn', 'motherhood', 'new parent', 'birth',
  'baby gear', 'baby care', 'parent', 'mom', 'dad', 'nanny', 'daycare',
  'new mom', 'bump', 'nursing', 'baby shower', 'mama', 'maternal', 'nesting',
]

// Skip these regardless — they produce false positives in funding feeds
const EXCLUDE_TERMS = [
  'enterprise software', 'blockchain', 'crypto', 'web3', 'nft',
  'data center', 'automotive manufacturer', 'heavy industry',
]

function isBabyRelated(text: string): boolean {
  const lower = text.toLowerCase()
  if (EXCLUDE_TERMS.some(t => lower.includes(t))) return false
  return FUNDING_KEYWORDS.some(kw => lower.includes(kw))
}

const SOURCES = [
  {
    name: 'Crunchbase News',
    url: 'https://news.crunchbase.com/feed/',
    maxAgeDays: 14,
  },
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    maxAgeDays: 14,
  },
  {
    name: 'Entrepreneur',
    url: 'https://www.entrepreneur.com/latest.rss',
    maxAgeDays: 14,
  },
  {
    name: 'The Toy Book',
    url: 'https://toybook.com/feed/',
    maxAgeDays: 14,
  },
  {
    name: 'Glossy',
    url: 'https://www.glossy.co/feed/',
    maxAgeDays: 7,
  },
  {
    name: 'Glossy Beauty',
    url: 'https://www.glossy.co/beauty/feed/',
    maxAgeDays: 7,
  },
]

async function fetchSource(source: typeof SOURCES[number]): Promise<RawSignal[]> {
  try {
    const feed = await parser.parseURL(source.url)
    const signals: RawSignal[] = []
    const maxAgeMs = source.maxAgeDays * 86_400_000

    for (const item of feed.items.slice(0, 60)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      if (!isBabyRelated(text)) continue

      const pub = item.pubDate ? new Date(item.pubDate) : new Date()
      if (Date.now() - pub.getTime() > maxAgeMs) continue

      signals.push({
        headline: title.trim(),
        excerpt: content.slice(0, 600).trim(),
        url: item.link ?? '',
        publishedAt: pub.toISOString(),
        source: source.name,
      })
    }

    return signals
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[signals/crunchbase_news] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s)))
  return results
    .filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}
