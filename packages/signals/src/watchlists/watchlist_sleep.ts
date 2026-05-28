import type { WatchlistBrand } from './types'

/** Baby sleep: smart bassinets, monitors, sleep sacks, sound machines, white noise. */
export const SLEEP: WatchlistBrand[] = [
  // ── Smart bassinets + monitors ────────────────────────────────────────────
  { name: 'Happiest Baby',   domain: 'happiestbaby.com',    category: 'smart bassinet',    categoryFit: 95, founderAttributes: { women_founded: true } },
  { name: 'Nanit',           domain: 'nanit.com',           category: 'baby monitor',      categoryFit: 92 },
  { name: 'Cubo Ai',         domain: 'cuboai.com',          category: 'baby monitor',      categoryFit: 90 },
  { name: 'Owlet',           domain: 'owletcare.com',       category: 'baby monitor',      categoryFit: 90 },
  { name: 'DockATot',        domain: 'dockatot.com',        category: 'baby lounger',      categoryFit: 90 },
  { name: 'Newton Baby',     domain: 'newtonbaby.com',      category: 'baby mattress',     categoryFit: 90, founderAttributes: { mom_founded: true } },

  // ── Sleep sacks + swaddles ────────────────────────────────────────────────
  { name: 'Halo Innovations', domain: 'halosleep.com',      category: 'sleep sack',        categoryFit: 90 },
  { name: 'Slumberkins',     domain: 'slumberkins.com',     category: 'comfort toy/sleep', categoryFit: 85, founderAttributes: { women_founded: true } },

  // ── Sound machines + nightlights ──────────────────────────────────────────
  { name: 'Hatch Baby',      domain: 'hatchbaby.com',       category: 'sound machine',     categoryFit: 92, founderAttributes: { mom_founded: true } },
  { name: 'Project Nursery', domain: 'projectnursery.com',  category: 'nursery tech',      categoryFit: 85 },

  // ── Audio / story players ─────────────────────────────────────────────────
  { name: 'Yoto',            domain: 'yotoplay.com',        category: 'audio player',      categoryFit: 85 },
  { name: 'Lulla Doll',      domain: 'lulladoll.com',       category: 'comfort toy',       categoryFit: 85 },

  // ── Strollers / bassinets that cross into sleep ────────────────────────────
  { name: 'Mockingbird',     domain: 'hellomockingbird.com',category: 'stroller/bassinet', categoryFit: 90, founderAttributes: { women_founded: true } },
  { name: 'Crane Baby',      domain: 'cranebaby.com',       category: 'nursery/humidifier',categoryFit: 85 },

  // ── Furniture that anchors sleep setups ──────────────────────────────────
  { name: 'Lalo',            domain: null,                  category: 'baby gear',         categoryFit: 88, founderAttributes: { mom_founded: true } },
  { name: 'Wonderkin',       domain: null,                  category: 'nursery',           categoryFit: 82 },
]
