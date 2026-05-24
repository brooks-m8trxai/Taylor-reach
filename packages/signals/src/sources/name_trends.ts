/**
 * Baby name trend articles from parenting and naming publications.
 * Channel: content_radar — feeds Social Media Brain with naming content ideas.
 *
 * Sources: Nameberry blog, The Bump, BabyCenter, Romper (baby names), Verywell Family.
 * These give Taylor angles on trending names, vintage revivals, name origin stories, etc.
 */

import Parser from 'rss-parser'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 15_000 })

const NAME_TREND_KEYWORDS = [
  'baby name', 'baby names', 'name trend', 'trending name', 'popular name',
  'popular baby', 'name meaning', 'name origin', 'unique name', 'rare name',
  'old fashioned name', 'vintage name', 'classic name', 'gender neutral name',
  'unisex name', 'name inspiration', 'naming', 'name reveal', 'name for a baby',
  'newborn name', 'names of the year', 'top names', 'most popular names',
  'unusual names', 'old name', 'royal name', 'nature name', 'nature-inspired',
  'celebrity baby name', 'name list', 'name ideas', 'sibling name',
  'middle name', 'first name ideas', 'name etymology', 'what to name',
  'choosing a name', 'name history', 'historic name', 'cultural name',
]

function isNameTrendContent(text: string): boolean {
  const lower = text.toLowerCase()
  return NAME_TREND_KEYWORDS.some(kw => lower.includes(kw))
}

const SOURCES = [
  {
    name: 'Nameberry',
    url: 'https://nameberry.com/blog/feed',
    maxAgeDays: 14,
  },
  {
    name: 'The Bump',
    url: 'https://www.thebump.com/news/rss',
    maxAgeDays: 14,
  },
  {
    name: 'BabyCenter',
    url: 'https://www.babycenter.com/baby-names/most-popular/rss',
    maxAgeDays: 21,
  },
  {
    name: 'Romper',
    url: 'https://www.romper.com/rss',
    maxAgeDays: 14,
  },
  {
    name: 'Verywell Family',
    url: 'https://www.verywellfamily.com/baby-names-4157397',
    maxAgeDays: 21,
  },
  {
    name: 'Scary Mommy',
    url: 'https://www.scarymommy.com/feed',
    maxAgeDays: 7,
  },
]

async function fetchSource(source: typeof SOURCES[number]): Promise<RawSignal[]> {
  try {
    const feed = await parser.parseURL(source.url)
    const signals: RawSignal[] = []
    const maxAgeMs = source.maxAgeDays * 86_400_000

    for (const item of feed.items.slice(0, 30)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      if (!isNameTrendContent(text)) continue

      const pub = item.pubDate ? new Date(item.pubDate) : new Date()
      if (Date.now() - pub.getTime() > maxAgeMs) continue

      signals.push({
        headline: title.trim(),
        excerpt: content.slice(0, 800).trim(),
        url: item.link ?? '',
        publishedAt: pub.toISOString(),
        source: source.name,
        channel: 'content_radar',
      })
    }

    return signals
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[signals/name_trends] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s)))
  const all = results
    .filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)

  // Dedupe by URL
  const seen = new Set<string>()
  return all.filter(s => {
    if (!s.url || seen.has(s.url)) return false
    seen.add(s.url)
    return true
  })
}
