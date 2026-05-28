/**
 * Combined watchlist — all pre-validated brands Taylor should actively monitor.
 *
 * ALL_WATCHLIST_BRANDS is the source of truth for:
 *   1. Seeding the brand_watchlist table (via seedWatchlistBrands)
 *   2. Seeding the brands table directly (250 brands available immediately)
 *   3. Driving watchlist_scanner.ts press monitoring via Google News RSS
 *
 * De-duplication: brands that appear in multiple category lists are intentional
 * (e.g., Frida Mom in feeding AND maternity AND diversity). The seeder dedupes
 * by domain when writing to the DB.
 */

export type { WatchlistBrand } from './types'
export { FEEDING } from './watchlist_feeding'
export { SLEEP } from './watchlist_sleep'
export { CARRIERS_STROLLERS } from './watchlist_carriers_strollers'
export { SKINCARE } from './watchlist_skincare'
export { MATERNITY_POSTPARTUM } from './watchlist_maternity_postpartum'
export { CLOTHING } from './watchlist_clothing'
export { TOYS_PLAY } from './watchlist_toys_play'
export { NURSERY } from './watchlist_nursery'
export { SERVICES_APPS } from './watchlist_services_apps'
export { REGISTRY_GIFTING } from './watchlist_registry_gifting'
export { DIVERSITY } from './watchlist_diversity'

import { FEEDING } from './watchlist_feeding'
import { SLEEP } from './watchlist_sleep'
import { CARRIERS_STROLLERS } from './watchlist_carriers_strollers'
import { SKINCARE } from './watchlist_skincare'
import { MATERNITY_POSTPARTUM } from './watchlist_maternity_postpartum'
import { CLOTHING } from './watchlist_clothing'
import { TOYS_PLAY } from './watchlist_toys_play'
import { NURSERY } from './watchlist_nursery'
import { SERVICES_APPS } from './watchlist_services_apps'
import { REGISTRY_GIFTING } from './watchlist_registry_gifting'
import { DIVERSITY } from './watchlist_diversity'
import type { WatchlistBrand } from './types'

// ─── De-duplicate by domain (then name) across all categories ─────────────────
//
// Some brands appear in multiple lists (intentional — diversity list overlaps
// with category lists). Keep the entry with the highest categoryFit.
// Brands with domain=null are kept as-is (can't dedupe without domain).

const seen = new Map<string, WatchlistBrand>()

function dedupeKey(b: WatchlistBrand): string {
  return b.domain ?? `__name__${b.name.toLowerCase().replace(/\s+/g, '_')}`
}

for (const brand of [
  ...FEEDING,
  ...SLEEP,
  ...CARRIERS_STROLLERS,
  ...SKINCARE,
  ...MATERNITY_POSTPARTUM,
  ...CLOTHING,
  ...TOYS_PLAY,
  ...NURSERY,
  ...SERVICES_APPS,
  ...REGISTRY_GIFTING,
  ...DIVERSITY,
]) {
  const key = dedupeKey(brand)
  const existing = seen.get(key)
  if (!existing || brand.categoryFit > existing.categoryFit) {
    // Merge founderAttributes: any list that sets an attribute wins
    seen.set(key, {
      ...brand,
      founderAttributes: existing?.founderAttributes
        ? { ...existing.founderAttributes, ...brand.founderAttributes }
        : brand.founderAttributes,
    })
  }
}

export const ALL_WATCHLIST_BRANDS: WatchlistBrand[] = Array.from(seen.values())
