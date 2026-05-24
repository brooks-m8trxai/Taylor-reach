/**
 * Celebrity pregnancy, baby name reveals, and birth announcements.
 * Sources: Page Six, Hollywood Life, Us Weekly, Romper.
 * These drive "celebrity_moment" signal type — name reveals especially,
 * since Taylor is the go-to expert for media comment on celebrity names.
 */

import Parser from 'rss-parser'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 15_000 })

const CELEB_KEYWORDS = [
  'baby', 'pregnant', 'expecting', 'newborn', 'birth', 'named', 'name reveal',
  'baby shower', 'maternity', 'pregnancy announcement', 'due', 'born', 'welcomed',
  'bundle of joy', 'baby boy', 'baby girl', 'baby name', 'named their baby',
  'announced their pregnancy', 'gives birth', 'welcomed a', 'new addition',
]

function isCelebBabyMoment(text: string): boolean {
  const lower = text.toLowerCase()
  return CELEB_KEYWORDS.some(kw => lower.includes(kw))
}

const SOURCES = [
  {
    name: 'Page Six',
    url: 'https://pagesix.com/feed/',
    maxAgeDays: 5, // celebrity news goes stale fast
  },
  {
    name: 'Hollywood Life',
    url: 'https://hollywoodlife.com/feed/',
    maxAgeDays: 5,
  },
  {
    name: 'Us Weekly',
    url: 'https://www.usmagazine.com/feed/',
    maxAgeDays: 5,
  },
  {
    name: 'Romper',
    url: 'https://www.romper.com/rss',
    maxAgeDays: 21, // publishes quality baby/parenting content but not daily; extend window
  },
]

async function fetchSource(source: typeof SOURCES[number]): Promise<RawSignal[]> {
  try {
    const feed = await parser.parseURL(source.url)
    const signals: RawSignal[] = []
    const maxAgeMs = source.maxAgeDays * 86_400_000

    for (const item of feed.items.slice(0, 50)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      if (!isCelebBabyMoment(text)) continue

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
    console.error(`[signals/page_six] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s)))
  return results
    .filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}
