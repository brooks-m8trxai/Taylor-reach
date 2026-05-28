/**
 * Phase 1 — Watchlist scanner.
 *
 * Two exported functions:
 *
 *   fetchSignals()
 *     Polls Google News RSS for each pre-validated brand in ALL_WATCHLIST_BRANDS.
 *     Brands are batched into groups of 8 to reduce HTTP requests (~31 requests
 *     total for 250 brands vs 250 individual requests).
 *     Returns RawSignal[] with knownBrand pre-populated → scanner skips Haiku.
 *
 *   seedWatchlistBrands(tenantId)
 *     Upserts all 250 watchlist brands into both brand_watchlist (for future
 *     monitoring state) and brands (so Taylor has a populated library immediately).
 *     Safe to call repeatedly — uses upsert by domain.
 *
 * Google News RSS is free, requires no API key, and supports full-text
 * OR queries. Rate limit: conservative 5 concurrent + 150ms between rounds.
 */

import Parser from 'rss-parser'
import { supabase } from '@taylor-reach/db'
import { ALL_WATCHLIST_BRANDS } from '../watchlists/index'
import type { WatchlistBrand } from '../watchlists/types'
import type { RawSignal } from './pr_newswire'

const parser = new Parser({ timeout: 12_000 })

const BATCH_SIZE = 8           // brands per Google News OR query
const CONCURRENCY = 5          // parallel batch fetches
const DELAY_BETWEEN_ROUNDS = 150  // ms between concurrency rounds
const MAX_AGE_DAYS = 30        // only surface signals from last 30 days

// ─── Google News RSS query builder ────────────────────────────────────────────

function buildGnQuery(brands: WatchlistBrand[]): string {
  const phrases = brands.map(b => `"${b.name}"`).join(' OR ')
  // Append niche context so results stay relevant
  return `${phrases} (baby OR maternity OR parenting OR postpartum OR "new mom")`
}

function buildGnUrl(query: string): string {
  const encoded = encodeURIComponent(query)
  return `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`
}

// ─── Brand mention detection ──────────────────────────────────────────────────

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function brandMentionedIn(brand: WatchlistBrand, text: string): boolean {
  const lower = text.toLowerCase()
  const name = brand.name.toLowerCase()

  if (name.length <= 3) {
    // Short names: require word boundary to avoid false positives
    return new RegExp(`\\b${escapeForRegex(name)}\\b`).test(lower)
  }
  return lower.includes(name)
}

// ─── Batch fetch ──────────────────────────────────────────────────────────────

async function fetchBatch(batch: WatchlistBrand[]): Promise<RawSignal[]> {
  const query = buildGnQuery(batch)
  const url = buildGnUrl(query)

  try {
    const feed = await parser.parseURL(url)
    const signals: RawSignal[] = []
    const maxAgeMs = MAX_AGE_DAYS * 86_400_000

    for (const item of feed.items.slice(0, 40)) {
      const title = item.title ?? ''
      const content = item.contentSnippet ?? item.summary ?? ''
      const text = `${title} ${content}`

      const pub = item.pubDate ? new Date(item.pubDate) : new Date()
      if (Date.now() - pub.getTime() > maxAgeMs) continue

      // Find which brands from this batch are mentioned
      for (const brand of batch) {
        if (!brandMentionedIn(brand, text)) continue

        signals.push({
          headline: title.trim(),
          excerpt: content.slice(0, 500).trim(),
          url: item.link ?? '',
          publishedAt: pub.toISOString(),
          source: `Watchlist: ${brand.name}`,
          channel: 'brand_deal',
          knownBrand: {
            name: brand.name,
            domain: brand.domain,
            categoryFit: brand.categoryFit,
            founderAttributes: brand.founderAttributes,
            discoverySource: 'watchlist',
          },
        })
        // One signal per article per brand (a single article may mention multiple)
      }
    }

    return signals
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const brandNames = batch.map(b => b.name).join(', ')
    console.warn(`[watchlist_scanner] Google News batch failed (${brandNames.slice(0, 60)}): ${msg}`)
    return []
  }
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export async function fetchSignals(): Promise<RawSignal[]> {
  // Chunk brands into batches
  const batches: WatchlistBrand[][] = []
  for (let i = 0; i < ALL_WATCHLIST_BRANDS.length; i += BATCH_SIZE) {
    batches.push(ALL_WATCHLIST_BRANDS.slice(i, i + BATCH_SIZE))
  }

  console.log(`[watchlist_scanner] Polling Google News for ${ALL_WATCHLIST_BRANDS.length} brands in ${batches.length} batches (${CONCURRENCY} concurrent)`)

  const allSignals: RawSignal[] = []

  // Process batches in concurrency groups
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const round = batches.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(round.map(batch => fetchBatch(batch)))

    for (const r of results) {
      if (r.status === 'fulfilled') allSignals.push(...r.value)
    }

    // Polite delay between rounds to avoid triggering rate limits
    if (i + CONCURRENCY < batches.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ROUNDS))
    }
  }

  console.log(`[watchlist_scanner] Done — ${allSignals.length} raw signals from watchlist`)
  return allSignals
}

// ─── Watchlist brand seeder ───────────────────────────────────────────────────
//
// Called once from POST /api/admin/seed-watchlist.
// Safe to call repeatedly — upserts by domain (or name if domain is null).
// Writes to BOTH brand_watchlist (monitoring state) AND brands (pipeline).

export interface SeedResult {
  watchlistSeeded: number
  watchlistSkipped: number
  brandsSeeded: number
  brandsSkipped: number
  errors: string[]
}

export async function seedWatchlistBrands(tenantId: string): Promise<SeedResult> {
  const result: SeedResult = {
    watchlistSeeded: 0, watchlistSkipped: 0,
    brandsSeeded: 0,    brandsSkipped: 0,
    errors: [],
  }

  const UPSERT_BATCH = 20  // DB upsert batch size

  // ── 1. Seed brand_watchlist ───────────────────────────────────────────────

  const watchlistRows = ALL_WATCHLIST_BRANDS.map(b => ({
    tenant_id:     tenantId,
    brand_name:    b.name,
    domain:        b.domain,
    ig_handle:     b.igHandle ?? null,
    category_hint: b.category,
    notes:         b.founderAttributes ? JSON.stringify(b.founderAttributes) : null,
    last_checked_at: null,
  }))

  for (let i = 0; i < watchlistRows.length; i += UPSERT_BATCH) {
    const batch = watchlistRows.slice(i, i + UPSERT_BATCH)
    const { error } = await supabase
      .from('brand_watchlist')
      .upsert(batch, { onConflict: 'tenant_id,brand_name', ignoreDuplicates: false })

    if (error) {
      result.errors.push(`brand_watchlist batch ${i / UPSERT_BATCH + 1}: ${error.message}`)
      result.watchlistSkipped += batch.length
    } else {
      result.watchlistSeeded += batch.length
    }
  }

  // ── 2. Seed brands table ──────────────────────────────────────────────────
  // Only seed brands that don't already exist (by domain, or by name if no domain).
  // Assigns a base fit_score from categoryFit + founder boosts.

  for (const brand of ALL_WATCHLIST_BRANDS) {
    try {
      // Check if brand already exists
      const existingQuery = brand.domain
        ? supabase.from('brands').select('id').eq('tenant_id', tenantId).eq('domain', brand.domain).maybeSingle()
        : supabase.from('brands').select('id').eq('tenant_id', tenantId).ilike('brand_name', brand.name).maybeSingle()

      const { data: existing } = await existingQuery

      if (existing) {
        // Already in pipeline — just backfill founder_attributes and discovery_source if missing
        await supabase
          .from('brands')
          .update({
            founder_attributes: brand.founderAttributes ?? null,
            // Only set discovery_source if not already set
          })
          .eq('id', existing.id)
          .is('founder_attributes', null)

        result.brandsSkipped++
        continue
      }

      // Compute fit score: base from categoryFit + founder boosts
      let fitScore = Math.round(
        0.35 * brand.categoryFit
        + 0.20 * 100    // recency=100 (brand is fresh to our pipeline)
        + 0.15 * 50     // budget unknown
        + 0.15 * 85     // audience_overlap: pre-validated = high
        + 0.10 * 50     // creator tier unknown
        + 0.05 * 70     // uniqueness default
      )
      const fa = brand.founderAttributes
      if (fa?.mom_founded)    fitScore = Math.min(100, fitScore + 10)
      if (fa?.women_founded)  fitScore = Math.min(100, fitScore + 5)
      if (fa?.bipoc_founded)  fitScore = Math.min(100, fitScore + 5)
      if (fa?.lgbtq_focused)  fitScore = Math.min(100, fitScore + 5)
      if (fa?.adoption_focused) fitScore = Math.min(100, fitScore + 8)

      const { error } = await supabase.from('brands').insert({
        tenant_id:           tenantId,
        brand_name:          brand.name,
        domain:              brand.domain,
        brand_category:      brand.category,
        categories:          [brand.category],
        brand_kind:          'brand',
        status:              fitScore >= 75 ? 'scoring' : 'new',
        fit_score:           fitScore,
        founder_attributes:  brand.founderAttributes ?? null,
        discovery_source:    'watchlist',
        sources:             ['watchlist'],
        conflict_flag:       { is_competitor_of: [], blocked_until: null },
        voice_samples:       [],
        last_signal_at:      new Date().toISOString(),
      })

      if (error) {
        result.errors.push(`brands insert (${brand.name}): ${error.message}`)
        result.brandsSkipped++
      } else {
        result.brandsSeeded++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`brands (${brand.name}): ${msg}`)
      result.brandsSkipped++
    }
  }

  console.log(`[watchlist_scanner] Seed complete: watchlist=${result.watchlistSeeded} brands=${result.brandsSeeded} errors=${result.errors.length}`)
  return result
}
