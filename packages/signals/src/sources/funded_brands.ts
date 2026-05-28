/**
 * Channel A — Brand-deal source: Recently funded baby/parent brands.
 *
 * Specifically targets funding announcements that signal marketing budget:
 * a freshly funded brand needs creator amplification NOW.
 *
 * Distinct from crunchbase_news.ts (which already covers Crunchbase News,
 * TechCrunch, Entrepreneur, Glossy) — this file covers complementary sources.
 *
 * Funding keywords are intentionally expansive to capture tangential
 * baby/parenting crossover brands (postpartum wellness, fertility, etc.)
 *
 * All signals tagged channel: 'brand_deal'.
 */

import Parser from 'rss-parser'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 15_000 })

// Funding round signals — look for money + baby/family context
const FUNDING_TERMS = [
  'raises', 'raised', 'funding', 'series a', 'series b', 'series c',
  'seed round', 'seed funding', 'investment', 'venture', 'closes', 'secured',
  'capital', 'backed', 'investor', 'valuation', 'ipo', 'acquisition',
]

const BABY_FAMILY_TERMS = [
  'baby', 'infant', 'toddler', 'newborn', 'nursery', 'stroller', 'carrier',
  'maternity', 'postpartum', 'pregnancy', 'prenatal', 'fertility',
  'breastfeeding', 'nursing', 'formula', 'diaper', 'baby food', 'organic baby',
  'child', 'children', 'family', 'parenting', 'motherhood', 'new mom',
  'pediatric', 'kids', 'teen', 'tween',
]

function isFundedBrandSignal(text: string): boolean {
  const lower = text.toLowerCase()
  const hasFunding = FUNDING_TERMS.some(t => lower.includes(t))
  const hasBabyFamily = BABY_FAMILY_TERMS.some(t => lower.includes(t))
  return hasFunding && hasBabyFamily
}

const SOURCES = [
  // ── Broad business / tech coverage ────────────────────────────────────────
  {
    // Business news — catches funding rounds not covered by Crunchbase News
    name: 'VentureBeat',
    url: 'https://venturebeat.com/feed/',
    maxAgeDays: 14,
  },
  {
    // Inc. Magazine — small-to-mid brand growth stories, often first to cover
    // DTC baby/family brands before they hit TechCrunch
    name: 'Inc.',
    url: 'https://www.inc.com/rss/homepage.xml',
    maxAgeDays: 14,
  },
  {
    // FastCompany — covers DTC brand innovation including baby/family segment
    name: 'Fast Company',
    url: 'https://www.fastcompany.com/feed',
    maxAgeDays: 14,
  },
  {
    // Business Wire — official press releases including funding announcements
    // Different from PR Newswire in coverage; catches many DTC brands
    name: 'Business Wire',
    url: 'https://feed.businesswire.com/rss/home/?rss=G7&rssid=20',
    maxAgeDays: 7,
  },
  {
    // PRWeb — smaller DTC brands post here; good for emerging brand discovery
    name: 'PRWeb',
    url: 'https://service.prweb.com/k/all/rss.xml',
    maxAgeDays: 7,
  },
  {
    // Fortune — covers Series B+ funding rounds for consumer brands
    name: 'Fortune',
    url: 'https://fortune.com/feed/',
    maxAgeDays: 14,
  },

  // ── Phase 3: Funding-specific + VC newsletters ────────────────────────────
  {
    // Axios Pro Rata — daily VC/PE deal coverage; first to break many rounds
    name: 'Axios Pro Rata',
    url: 'https://www.axios.com/feeds/feed.rss',
    maxAgeDays: 7,
  },
  {
    // StrictlyVC — newsletter turned RSS; covers seed + Series A consumer brands
    name: 'StrictlyVC',
    url: 'https://strictlyvc.com/feed/',
    maxAgeDays: 14,
  },
  {
    // Crunchbase News — comprehensive funding coverage; complement to crunchbase_news.ts
    name: 'Crunchbase News',
    url: 'https://news.crunchbase.com/feed/',
    maxAgeDays: 7,
  },
  {
    // TechCrunch startups — catches DTC and consumer brand rounds
    name: 'TechCrunch Startups',
    url: 'https://techcrunch.com/category/startups/feed/',
    maxAgeDays: 7,
  },
  {
    // GlobeNewswire consumer — press releases from smaller DTC brands announcing rounds
    name: 'GlobeNewswire Consumer',
    url: 'https://www.globenewswire.com/RssFeed/subjectcode/25-Consumer+Products',
    maxAgeDays: 7,
  },
  {
    // Forerunner Ventures news — parent-tech/consumer VC; their portfolio = Taylor's targets
    // NOTE: no RSS available; we catch their portfolio brands via press wire instead
    // Forerunner portfolio brands to watch: Hims, Ritual, Curology, Oura, Away...
    // Many of their consumer portfolio companies serve new parents.
    name: 'Business Wire',  // fallback — Forerunner portfolio companies use Business Wire
    url: 'https://feed.businesswire.com/rss/home/?rss=G7&rssid=20',
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

      if (!isFundedBrandSignal(text)) continue

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
    console.error(`[signals/funded_brands] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s)))
  return results
    .filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}
