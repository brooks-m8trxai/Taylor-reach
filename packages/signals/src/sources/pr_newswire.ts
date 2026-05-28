/**
 * Press wire + editorial RSS sources for baby/parenting brand signals.
 * Covers: PR Newswire, Modern Retail, Motherly, Hello Magazine,
 *         Tinybeans, Cool Mom Picks, Scary Mommy.
 * Each item is keyword-filtered before returning, so noise is low by the time
 * the scanner sees these.
 */

import Parser from 'rss-parser'

const parser = new Parser({ timeout: 15_000 })

export interface RawSignal {
  headline: string
  excerpt: string
  url: string
  publishedAt: string
  source: string
  /**
   * Which acquisition channel this signal belongs to.
   * Drives the `funnel` column on the signals table.
   *   'brand_deal'        — Channel A: monetizable sponsorship / gifted / ambassador targets
   *   'media_opportunity' — existing publisher / creator media opps (set by publisher override)
   *   'content_radar'     — Channel B: cultural moments / content calendar ideas
   * Omit for legacy sources (scanner will derive from extraction path).
   */
  channel?: 'brand_deal' | 'media_opportunity' | 'content_radar'

  /**
   * Pre-populated brand metadata from a curated watchlist or award list.
   * When present, the scanner skips Haiku entirely — we trust the brand data.
   * Enables fit score boosts for founder attributes and curated picks.
   */
  knownBrand?: {
    name: string
    domain: string | null
    /** Haiku-equivalent category_fit — pre-scored because we know the brand */
    categoryFit: number
    founderAttributes?: {
      mom_founded?: boolean
      women_founded?: boolean
      bipoc_founded?: boolean
      lgbtq_focused?: boolean
      adoption_focused?: boolean
    }
    /** How this brand was discovered — written to brands.discovery_source */
    discoverySource?: 'watchlist' | 'curated' | 'retailer' | 'job_posting'
    /** Brand appears on a curated award list → +5 fit score boost */
    isCuratedPick?: boolean
    /** Brand is actively hiring influencer/creator marketing roles → +15 boost */
    isHiringCreators?: boolean
  }
}

const BABY_KEYWORDS = [
  'baby', 'infant', 'toddler', 'newborn', 'nursery', 'parenting', 'maternity',
  'postpartum', 'pregnancy', 'expecting', 'prenatal', 'neonatal', 'pediatric',
  'child', 'children', 'kids', 'family', 'stroller', 'crib', 'diaper', 'bottle',
  'formula', 'swaddle', 'breastfeed', 'lullaby', 'developmental', 'naming',
  'name reveal', 'baby shower', 'milestone', 'feeding', 'carrier', 'bassinet',
  'mom', 'motherhood', 'new parent', 'new mom', 'birth',
]

function matchesNiche(text: string): boolean {
  const lower = text.toLowerCase()
  return BABY_KEYWORDS.some(kw => lower.includes(kw))
}

const SOURCES = [
  {
    name: 'PR Newswire',
    url: 'https://www.prnewswire.com/rss/news-releases-list.rss',
    maxAgeDays: 7,
  },
  {
    name: 'Modern Retail',
    url: 'https://www.modernretail.co/feed/',
    maxAgeDays: 7,
  },
  {
    name: 'Motherly',
    url: 'https://www.mother.ly/feed/',
    maxAgeDays: 7,
  },
  {
    name: 'Hello Magazine',
    url: 'https://www.hellomagazine.com/rss/',
    maxAgeDays: 7,
  },
  {
    name: 'Tinybeans',
    url: 'https://tinybeans.com/feed/',
    maxAgeDays: 14,
  },
  {
    name: 'Cool Mom Picks',
    url: 'https://coolmompicks.com/feed/',
    maxAgeDays: 7,
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

    for (const item of feed.items.slice(0, 60)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      if (!matchesNiche(text)) continue

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
    console.error(`[signals/pr_newswire] ${source.name} failed: ${msg}`)
    return []
  }
}

export async function fetchSignals(): Promise<RawSignal[]> {
  const results = await Promise.allSettled(SOURCES.map(s => fetchSource(s)))
  return results
    .filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
}
