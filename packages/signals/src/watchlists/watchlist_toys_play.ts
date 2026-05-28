import type { WatchlistBrand } from './types'

/** Developmental toys, play gyms, audio/story players, and learning tools (0-3). */
export const TOYS_PLAY: WatchlistBrand[] = [
  // ── Play kits + subscription ─────────────────────────────────────────────
  { name: 'Lovevery',        domain: 'lovevery.com',         category: 'play kit',            categoryFit: 95, founderAttributes: { women_founded: true } },
  { name: 'Monti Kids',      domain: 'montikids.com',        category: 'Montessori toys',     categoryFit: 88, founderAttributes: { women_founded: true } },

  // ── Audio + screen-free play ──────────────────────────────────────────────
  { name: 'Tonies',          domain: 'tonies.com',           category: 'audio player',        categoryFit: 85 },
  { name: 'Yoto',            domain: 'yotoplay.com',         category: 'audio player',        categoryFit: 85 },

  // ── Tactile + sensory toys ────────────────────────────────────────────────
  { name: 'Manhattan Toy',   domain: 'manhattantoy.com',     category: 'infant toy',          categoryFit: 88 },
  { name: 'Plan Toys',       domain: 'plantoys.com',         category: 'wooden toy',          categoryFit: 87 },
  { name: 'Tegu',            domain: 'tegu.com',             category: 'magnetic blocks',     categoryFit: 85 },
  { name: 'Janod',           domain: 'janod.com',            category: 'wooden toy',          categoryFit: 85 },
  { name: 'Bannor Toys',     domain: 'bannortoys.com',       category: 'wooden toy',          categoryFit: 87, founderAttributes: { mom_founded: true } },
  { name: 'Tender Leaf Toys',domain: 'tenderleaftoys.com',   category: 'wooden toy',          categoryFit: 85 },

  // ── Open-ended building + construction ────────────────────────────────────
  { name: 'Magna-Tiles',     domain: 'magna-tiles.com',      category: 'magnetic tiles',      categoryFit: 82 },

  // ── App-based / digital play ──────────────────────────────────────────────
  { name: 'Sago Mini',       domain: 'sagomini.com',         category: 'toddler app',         categoryFit: 80, founderAttributes: { women_founded: true } },
  { name: 'Wonder & Wise',   domain: null,                   category: 'developmental toy',   categoryFit: 83 },

  // ── Activity gyms ─────────────────────────────────────────────────────────
  { name: 'Lalo',            domain: null,                   category: 'baby gear',           categoryFit: 88, founderAttributes: { mom_founded: true } },
]
