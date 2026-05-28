import type { WatchlistBrand } from './types'

/**
 * Mom-founded, women-founded, BIPOC-founded, and representation-focused brands.
 * Many of these overlap with other categories — they're duplicated here so the
 * diversity watchlist can be independently monitored and boosts applied correctly.
 *
 * Fit score boosts applied by scanner:
 *   mom_founded: +10, women_founded: +5, bipoc_founded: +5
 */
export const DIVERSITY: WatchlistBrand[] = [
  // ── Explicitly mom-founded ────────────────────────────────────────────────
  { name: 'Bobbie',            domain: 'hibobbie.com',         category: 'infant formula',     categoryFit: 95, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Hatch Collection',  domain: 'hatchcollection.com',  category: 'maternity fashion',  categoryFit: 95, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Frida Mom',         domain: 'fridababy.com',        category: 'postpartum care',    categoryFit: 93, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Coterie',           domain: 'coterie.com',          category: 'premium diaper',     categoryFit: 90, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Solly Baby',        domain: 'sollybaby.com',        category: 'baby wrap',          categoryFit: 92, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Quincy Mae',        domain: 'quincymae.com',        category: 'baby clothing',      categoryFit: 93, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Little Spoon',      domain: 'littlespoon.com',      category: 'baby food',          categoryFit: 90, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Kyte Baby',         domain: 'kytebaby.com',         category: 'baby sleepwear',     categoryFit: 93, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Tubby Todd',        domain: 'tubbytodd.com',        category: 'baby skincare',      categoryFit: 95, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Spearmint Love',    domain: 'spearmintlove.com',    category: 'nursery décor',      categoryFit: 88, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Bodily',            domain: 'bodily.com',           category: 'postpartum care',    categoryFit: 95, founderAttributes: { mom_founded: true, women_founded: true } },

  // ── BIPOC-founded / representation-focused ───────────────────────────────
  { name: 'Healthy Roots Dolls', domain: 'healthyrootsdolls.com', category: 'children\'s toy', categoryFit: 80, founderAttributes: { bipoc_founded: true, women_founded: true } },
  { name: 'Bébé Tete',         domain: 'bebetete.com',         category: 'baby hair care',     categoryFit: 85, founderAttributes: { bipoc_founded: true, women_founded: true } },
  { name: 'The Honest Company', domain: 'honest.com',          category: 'baby/family care',   categoryFit: 88, founderAttributes: { women_founded: true } },
  { name: 'Lalo',              domain: null,                   category: 'baby gear',          categoryFit: 88, founderAttributes: { mom_founded: true } },

  // ── LGBTQ+ and adoption-focused ───────────────────────────────────────────
  { name: 'Rainbow Sprout',    domain: null,                   category: 'LGBTQ+ family',      categoryFit: 82, founderAttributes: { lgbtq_focused: true } },
  { name: 'Pride Baby',        domain: null,                   category: 'LGBTQ+ family',      categoryFit: 80, founderAttributes: { lgbtq_focused: true } },
]
