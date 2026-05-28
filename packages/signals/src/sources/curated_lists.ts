/**
 * Phase 5 — Curated list discovery.
 *
 * Scrapes award lists, gift guides, and editor-curated roundups from
 * high-trust baby/parenting publishers. Every brand mentioned in these
 * lists has pre-validated audience fit — the editorial team already did
 * the research.
 *
 * The scanner applies a +5 fit score boost to signals where source name
 * matches a CURATED_SOURCE pattern (see scanner.ts).
 *
 * Signal flow: RSS → keyword filter → RawSignal (channel: 'brand_deal')
 * → Haiku extracts brand → scanner applies curated boost.
 *
 * All signals tagged channel: 'brand_deal'.
 */

import Parser from 'rss-parser'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 15_000 })

// Keywords that indicate an article IS a curated list / award roundup
const CURATED_KEYWORDS = [
  'best of', 'gift guide', 'award', 'editor\'s pick', 'editor\'s choice',
  'top picks', 'our favorites', 'must have', 'roundup', 'tested and approved',
  'readers\' choice', 'product of the year', 'innovation award',
  'babylist best', 'babylist health award', 'the bump best',
  'parents magazine best', 'parents best', 'cool mom picks',
  'good housekeeping', 'real simple', 'what to expect',
  'recommended by', 'vetted by', 'experts pick', 'certified',
  'most innovative', 'fast company most', 'inc 5000', 'inc. 5000',
]

const BABY_NICHE_KEYWORDS = [
  'baby', 'infant', 'toddler', 'newborn', 'nursery', 'stroller',
  'carrier', 'maternity', 'postpartum', 'pregnancy', 'prenatal',
  'breastfeed', 'nursing', 'formula', 'diaper', 'baby food',
  'baby gear', 'new mom', 'new parent', 'family', 'parenting',
]

function isCuratedBabySignal(text: string): boolean {
  const lower = text.toLowerCase()
  const hasCurated = CURATED_KEYWORDS.some(k => lower.includes(k))
  const hasBaby = BABY_NICHE_KEYWORDS.some(k => lower.includes(k))
  return hasCurated && hasBaby
}

// ── Curated source list ────────────────────────────────────────────────────────
// Source names should match CURATED_SOURCE_NAMES in scanner.ts for the boost to apply.

const SOURCES = [
  {
    // Cool Mom Picks — gift guide format IS the curated list; every item is a brand
    name: 'Cool Mom Picks (curated)',
    url: 'https://coolmompicks.com/feed/',
    maxAgeDays: 90,   // gift guides stay relevant for months
  },
  {
    // The Bump editorial — covers awards and product picks for expectant parents
    name: 'The Bump (curated)',
    url: 'https://www.thebump.com/feed',
    maxAgeDays: 90,
  },
  {
    // Babylist blog — covers their own health awards and product roundups
    name: 'Babylist (curated)',
    url: 'https://www.babylist.com/blog/feed',
    maxAgeDays: 90,
  },
  {
    // Project Nursery picks of the year and product roundups
    name: 'Project Nursery (curated)',
    url: 'https://projectnursery.com/feed/',
    maxAgeDays: 90,
  },
  {
    // Romper — parenting culture + product roundups for millennial/Gen Z parents
    name: 'Romper (curated)',
    url: 'https://www.romper.com/rss/index.xml',
    maxAgeDays: 60,
  },
  {
    // Motherly — covers product awards and editorial picks
    name: 'Motherly (curated)',
    url: 'https://www.mother.ly/feed/',
    maxAgeDays: 60,
  },
  {
    // Lucie's List — editor-tested gear roundups; the brand mentioned = vetted
    name: "Lucie's List (curated)",
    url: 'https://www.lucieslist.com/feed/',
    maxAgeDays: 60,
  },
  {
    // What To Expect editorial product picks
    name: 'What To Expect (curated)',
    url: 'https://www.whattoexpect.com/wom/rss.xml',
    maxAgeDays: 60,
  },
  {
    // Scary Mommy product roundups
    name: 'Scary Mommy (curated)',
    url: 'https://www.scarymommy.com/feed',
    maxAgeDays: 60,
  },
  {
    // Fast Company — "Most Innovative Companies" in family/parenting category
    name: 'Fast Company (curated)',
    url: 'https://www.fastcompany.com/feed',
    maxAgeDays: 365,  // annual list — look far back
  },
  {
    // Inc. 5000 and startup award coverage
    name: 'Inc. (curated)',
    url: 'https://www.inc.com/rss/homepage.xml',
    maxAgeDays: 365,
  },
  {
    // Parents Magazine awards coverage
    name: 'Parents Magazine (curated)',
    url: 'https://www.parents.com/feed',
    maxAgeDays: 90,
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

      if (!isCuratedBabySignal(text)) continue

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
    console.error(`[signals/curated_lists] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s)))
  return results
    .filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}

/**
 * Source name substrings that trigger the +5 curated pick boost in scanner.ts.
 * Must be kept in sync with SOURCES above.
 */
export const CURATED_SOURCE_NAMES = [
  'Cool Mom Picks',
  'The Bump',
  'Babylist',
  'Project Nursery',
  'Romper',
  'Motherly',
  "Lucie's List",
  'What To Expect',
  'Scary Mommy',
  'Fast Company',
  'Inc.',
  'Parents Magazine',
]
