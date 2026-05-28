/**
 * POST /api/admin/seed-watchlist
 *
 * One-time (idempotent) operation that:
 *   1. Upserts all 250 watchlist brands into brand_watchlist (monitoring queue)
 *   2. Upserts all 250 watchlist brands into brands table (pipeline library)
 *
 * Safe to call repeatedly — uses upsert by domain/name.
 * After running, Taylor will have 250 pre-vetted brands in her library
 * with fit scores already computed, ready for enrichment and pitching.
 *
 * Takes ~30–60 seconds due to sequential DB inserts.
 */

import { NextResponse } from 'next/server'
import { seedWatchlistBrands, ALL_WATCHLIST_BRANDS } from '@taylor-reach/signals'
import { getTenantId } from '@/lib/tenant'

export const maxDuration = 120  // 2 min

export async function POST() {
  const tenantId = await getTenantId()
  if (!tenantId) {
    return NextResponse.json(
      { error: 'No tenant configured. Run 003_seed_taylor.sql first.' },
      { status: 400 },
    )
  }

  const startedAt = Date.now()

  try {
    const result = await seedWatchlistBrands(tenantId)

    const elapsed = Math.round((Date.now() - startedAt) / 1000)

    return NextResponse.json({
      ok: true,
      elapsed_seconds: elapsed,
      total_brands_in_watchlist: ALL_WATCHLIST_BRANDS.length,
      watchlist_seeded: result.watchlistSeeded,
      watchlist_skipped: result.watchlistSkipped,
      brands_seeded: result.brandsSeeded,
      brands_skipped: result.brandsSkipped,
      errors: result.errors.length > 0 ? result.errors : undefined,
      message: `Seeded ${result.brandsSeeded} new brands. ${result.brandsSkipped} already existed.`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    )
  }
}
