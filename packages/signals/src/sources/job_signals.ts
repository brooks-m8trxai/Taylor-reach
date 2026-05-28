/**
 * Phase 6 — Job posting signals (hiring intent detection).
 *
 * A baby/parenting brand hiring for influencer marketing, creator partnerships,
 * or community management roles is ACTIVELY building a creator program.
 * This is the highest-intent pitch signal: they need creators NOW.
 *
 * The scanner applies a +15 fit score boost when signal_type = 'hiring_signal'
 * (Haiku correctly classifies these based on the headline).
 *
 * Sources:
 *   - Google News RSS: search for creator/influencer job titles at baby companies
 *   - PR/news feeds filtered for hiring announcements
 *   - LinkedIn RSS (limited public access — falls back to news coverage)
 *
 * All signals tagged channel: 'brand_deal'.
 */

import Parser from 'rss-parser'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 15_000 })

// Job title keywords that indicate an active creator program
const HIRING_TITLES = [
  'influencer marketing', 'creator partnerships', 'brand partnerships',
  'creator marketing', 'influencer program', 'ambassador program',
  'community manager', 'social media manager', 'content creator',
  'content partnerships', 'creator relations', 'influencer relations',
  'head of influencer', 'vp of influencer', 'director of influencer',
  'director of creator', 'head of creator', 'manager of influencer',
]

const BABY_COMPANY_SIGNALS = [
  'baby', 'infant', 'toddler', 'maternity', 'postpartum', 'prenatal',
  'fertility', 'parenting', 'nursing', 'breastfeed', 'formula', 'diaper',
  'stroller', 'nursery', 'new parent', 'new mom', 'family brand',
  'children\'s brand', 'kids brand', 'mommy', 'motherhood',
]

function isHiringSignal(text: string): boolean {
  const lower = text.toLowerCase()
  const hasHiring = HIRING_TITLES.some(t => lower.includes(t))
  const hasBaby = BABY_COMPANY_SIGNALS.some(b => lower.includes(b))
  return hasHiring && hasBaby
}

// ── Google News RSS queries for creator hiring ────────────────────────────────
// These are targeted search queries rather than RSS feed subscriptions.
// Returns news coverage of job openings (LinkedIn announcements, company news, etc.)

const GOOGLE_NEWS_QUERIES = [
  // Creator/influencer marketing hires at baby brands
  '"influencer marketing" hiring baby parenting',
  '"creator partnerships" "baby" OR "maternity" OR "parenting" hiring',
  '"brand ambassador program" launch baby OR toddler OR maternity',
  'baby brand "creator program" launch OR hiring OR expanding',
  'parenting brand "influencer program" launch OR new',
]

function buildGnUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
}

async function fetchGoogleNewsQuery(query: string, label: string): Promise<RawSignal[]> {
  try {
    const feed = await parser.parseURL(buildGnUrl(query))
    const signals: RawSignal[] = []
    const maxAgeMs = 30 * 86_400_000  // 30 days

    for (const item of feed.items.slice(0, 20)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      if (!isHiringSignal(text)) continue

      const pub = item.pubDate ? new Date(item.pubDate) : new Date()
      if (Date.now() - pub.getTime() > maxAgeMs) continue

      signals.push({
        headline: title.trim(),
        excerpt: content.slice(0, 600).trim(),
        url: item.link ?? '',
        publishedAt: pub.toISOString(),
        source: `Job Signal: ${label}`,
        channel: 'brand_deal',
      })
    }

    return signals
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[signals/job_signals] Query "${label}" failed: ${msg}`)
    return []
  }
}

// ── RSS feeds with hiring / company news angle ────────────────────────────────

const RSS_SOURCES = [
  {
    // PR Newswire — companies announce key hires and program launches here
    name: 'PR Newswire (hiring)',
    url: 'https://www.prnewswire.com/rss/news-releases-list.rss',
    maxAgeDays: 14,
  },
  {
    // Business Wire — DTC brands often announce creator program launches here
    name: 'Business Wire (hiring)',
    url: 'https://feed.businesswire.com/rss/home/?rss=G7&rssid=20',
    maxAgeDays: 14,
  },
  {
    // GlobeNewswire — program launches and expansion announcements
    name: 'GlobeNewswire (hiring)',
    url: 'https://www.globenewswire.com/RssFeed/subjectcode/25-Consumer+Products',
    maxAgeDays: 14,
  },
]

async function fetchRssSource(source: typeof RSS_SOURCES[number]): Promise<RawSignal[]> {
  try {
    const feed = await parser.parseURL(source.url)
    const signals: RawSignal[] = []
    const maxAgeMs = source.maxAgeDays * 86_400_000

    for (const item of feed.items.slice(0, 60)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      if (!isHiringSignal(text)) continue

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
    console.error(`[signals/job_signals] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const [gnResults, rssResults] = await Promise.all([
    // Google News targeted queries
    Promise.allSettled(
      GOOGLE_NEWS_QUERIES.map((q, i) =>
        fetchGoogleNewsQuery(q, `query-${i + 1}`)
      )
    ),
    // RSS feeds
    Promise.allSettled(RSS_SOURCES.map(s => fetchRssSource(s))),
  ])

  return [
    ...gnResults.filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled').flatMap(r => r.value),
    ...rssResults.filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled').flatMap(r => r.value),
  ]
}

/**
 * NOTE: Phase 6 stretch — full LinkedIn job scraping.
 *
 * LinkedIn Jobs RSS feed:
 *   https://www.linkedin.com/jobs/search/?keywords=influencer+marketing&location=United+States
 *
 * LinkedIn deprecated public job RSS feeds in 2023. Options:
 *   1. LinkedIn Talent Solutions API (requires company account + approval)
 *   2. Phantombuster LinkedIn scraper (~$50/mo)
 *   3. Wellfound (AngelList) API — covers many startup creator roles
 *      GET https://wellfound.com/jobs?role[]=Influencer+Marketing
 *
 * Implement when Taylor is ready to pay for one of these services.
 * The Google News RSS queries above catch most high-signal hiring news in the meantime.
 */
