/**
 * Celebrity pregnancy, baby name reveals, and birth announcements.
 * Channel: content_radar — these feed the Social Media Brain, not the brand pipeline.
 *
 * Sources: People Babies, Just Jared, E! Online, ET Online, People general (pregnancy filter).
 * These give Taylor naming commentary angles, baby news Reels, carousel breakdowns, etc.
 */

import Parser from 'rss-parser'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 15_000 })

const CELEB_BABY_KEYWORDS = [
  'baby name', 'named their baby', 'baby names', 'name reveal',
  'baby girl', 'baby boy', 'expecting', 'pregnant', 'pregnancy',
  'baby shower', 'maternity', 'due date', 'gives birth', 'welcomed a',
  'new addition', 'born', 'baby arrived', 'bundle of joy', 'newborn',
  'birth announcement', 'baby announcement', 'pregnancy announcement',
  'baby bump', 'bump reveal', 'maternal', 'first child', 'second child',
  'welcomed their', 'welcomed a baby', 'announced she is expecting',
  'celebrity baby', 'royal baby', 'new mom', 'new dad', 'new parent',
  'named her', 'named his', 'named the baby',
]

function isCelebBabyContent(text: string): boolean {
  const lower = text.toLowerCase()
  return CELEB_BABY_KEYWORDS.some(kw => lower.includes(kw))
}

const SOURCES = [
  {
    name: 'People',
    url: 'https://people.com/babies/feed/',
    maxAgeDays: 7,
  },
  {
    name: 'People',
    url: 'https://people.com/pregnancy/feed/',
    maxAgeDays: 7,
  },
  {
    name: 'Just Jared',
    url: 'https://www.justjared.com/feed/',
    maxAgeDays: 5,
  },
  {
    name: 'E! Online',
    url: 'https://www.eonline.com/syndication/feeds/rssfeeds/topstories.xml',
    maxAgeDays: 5,
  },
  {
    name: 'ET Online',
    url: 'https://www.etonline.com/rss',
    maxAgeDays: 5,
  },
  {
    name: 'Us Weekly',
    url: 'https://www.usmagazine.com/celebrity-moms/feed/',
    maxAgeDays: 7,
  },
]

async function fetchSource(source: typeof SOURCES[number]): Promise<RawSignal[]> {
  try {
    const feed = await parser.parseURL(source.url)
    const signals: RawSignal[] = []
    const maxAgeMs = source.maxAgeDays * 86_400_000

    for (const item of feed.items.slice(0, 40)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      if (!isCelebBabyContent(text)) continue

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
    console.error(`[signals/celebrity_babies] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s)))
  const all = results
    .filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)

  // Dedupe by URL within this fetch (multiple People feeds can overlap)
  const seen = new Set<string>()
  return all.filter(s => {
    if (!s.url || seen.has(s.url)) return false
    seen.add(s.url)
    return true
  })
}
