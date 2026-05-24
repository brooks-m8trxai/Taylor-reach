/**
 * Parenting culture, viral baby moments, and baby-related health/wellness content.
 * Channel: content_radar — feeds Social Media Brain with lifestyle + culture angles.
 *
 * Sources:
 *   - Reddit r/BabyNames (JSON API — no API key required for public .json endpoint)
 *   - What to Expect
 *   - TODAY Show parenting section
 *   - Motherly
 *   - Fatherly
 *   - Parents Magazine
 */

import Parser from 'rss-parser'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 15_000 })

const PARENTING_CULTURE_KEYWORDS = [
  'baby', 'newborn', 'infant', 'toddler', 'new mom', 'new parent', 'new dad',
  'pregnancy', 'postpartum', 'birth', 'breastfeed', 'formula', 'sleep training',
  'baby trend', 'parenting trend', 'motherhood', 'fatherhood', 'milestone',
  'child development', 'baby health', 'baby wellness', 'baby gear', 'baby hack',
  'baby product', 'baby shower', 'gender reveal', 'birth story', 'pregnancy loss',
  'miscarriage', 'fertility', 'ivf', 'surrogacy', 'adoption', 'rainbow baby',
  'baby name', 'naming', 'name trend', 'celebrity pregnancy', 'celebrity baby',
  'baby registry', 'stroller', 'car seat', 'swaddle', 'pacifier', 'teething',
  'solid food', 'weaning', 'baby led weaning', 'nursery', 'nursery decor',
  'mom guilt', 'working mom', 'stay at home', 'maternity leave', 'parental leave',
]

function isParentingCultureContent(text: string): boolean {
  const lower = text.toLowerCase()
  return PARENTING_CULTURE_KEYWORDS.some(kw => lower.includes(kw))
}

// ─── Reddit r/BabyNames fetcher ───────────────────────────────────────────────
// Reddit's .json endpoint is public and doesn't require auth.
// We use it as a plain fetch (not rss-parser) since it's JSON not RSS.

interface RedditPost {
  data: {
    title: string
    selftext: string
    url: string
    permalink: string
    score: number
    num_comments: number
    created_utc: number
  }
}

async function fetchRedditBabyNames(): Promise<RawSignal[]> {
  try {
    const resp = await fetch(
      'https://www.reddit.com/r/BabyNames/top.json?limit=25&t=week',
      {
        headers: { 'User-Agent': 'TaylorReach/1.0 (content radar)' },
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!resp.ok) return []

    const json = await resp.json() as { data?: { children?: { data: RedditPost['data'] }[] } }
    const posts = json?.data?.children ?? []
    const signals: RawSignal[] = []
    const maxAgeMs = 7 * 86_400_000

    for (const post of posts) {
      const { title, selftext, permalink, created_utc } = post.data
      if (Date.now() - created_utc * 1000 > maxAgeMs) continue

      // r/BabyNames is all on-topic; include everything with a reasonable score
      if (post.data.score < 5) continue

      signals.push({
        headline: title.trim(),
        excerpt: selftext.slice(0, 600).trim() || `Reddit discussion with ${post.data.num_comments} comments`,
        url: `https://reddit.com${permalink}`,
        publishedAt: new Date(created_utc * 1000).toISOString(),
        source: 'Reddit r/BabyNames',
        channel: 'content_radar',
      })
    }

    return signals
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[signals/parenting_culture] Reddit r/BabyNames failed: ${msg}`)
    return []
  }
}

// ─── RSS sources ──────────────────────────────────────────────────────────────

const RSS_SOURCES = [
  {
    name: 'What to Expect',
    url: 'https://www.whattoexpect.com/news/rss',
    maxAgeDays: 14,
  },
  {
    name: 'TODAY Parenting',
    url: 'https://feeds.today.com/id/43752958',
    maxAgeDays: 7,
  },
  {
    name: 'Motherly',
    url: 'https://www.mother.ly/feed/',
    maxAgeDays: 7,
  },
  {
    name: 'Fatherly',
    url: 'https://www.fatherly.com/rss',
    maxAgeDays: 14,
  },
  {
    name: 'Parents Magazine',
    url: 'https://www.parents.com/rss',
    maxAgeDays: 14,
  },
]

async function fetchRssSource(source: typeof RSS_SOURCES[number]): Promise<RawSignal[]> {
  try {
    const feed = await parser.parseURL(source.url)
    const signals: RawSignal[] = []
    const maxAgeMs = source.maxAgeDays * 86_400_000

    for (const item of feed.items.slice(0, 30)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      if (!isParentingCultureContent(text)) continue

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
    console.error(`[signals/parenting_culture] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const [redditSignals, ...rssResults] = await Promise.allSettled([
    fetchRedditBabyNames(),
    ...RSS_SOURCES.map(s => fetchRssSource(s)),
  ])

  const all: RawSignal[] = []

  if (redditSignals.status === 'fulfilled') all.push(...redditSignals.value)

  for (const r of rssResults) {
    if (r.status === 'fulfilled') all.push(...r.value)
  }

  // Dedupe by URL
  const seen = new Set<string>()
  return all.filter(s => {
    if (!s.url || seen.has(s.url)) return false
    seen.add(s.url)
    return true
  })
}
