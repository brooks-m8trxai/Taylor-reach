import type { WatchlistBrand } from './types'

/** Strollers, car seats, baby carriers, wraps, and slings. */
export const CARRIERS_STROLLERS: WatchlistBrand[] = [
  // ── Premium stroller brands ───────────────────────────────────────────────
  { name: 'UPPAbaby',        domain: 'uppababy.com',        category: 'stroller',          categoryFit: 93 },
  { name: 'Nuna',            domain: 'nunababy.com',        category: 'stroller',          categoryFit: 93 },
  { name: 'Bugaboo',         domain: 'bugaboo.com',         category: 'stroller',          categoryFit: 90 },
  { name: 'Cybex',           domain: 'cybex-online.com',    category: 'stroller',          categoryFit: 90 },
  { name: 'Doona',           domain: 'doonausa.com',        category: 'infant car seat',   categoryFit: 95 },
  { name: 'Colugo',          domain: 'colugolife.com',      category: 'stroller',          categoryFit: 90 },
  { name: 'Veer',            domain: 'veercruiser.com',     category: 'cruiser stroller',  categoryFit: 88 },
  { name: 'BabyZen YOYO',   domain: 'babyzen.com',         category: 'travel stroller',   categoryFit: 88 },
  { name: 'Stokke',          domain: 'stokke.com',          category: 'stroller/high chair',categoryFit: 90 },
  { name: 'Maxi-Cosi',       domain: 'maxi-cosi.com',       category: 'car seat',          categoryFit: 88 },
  { name: 'Britax',          domain: 'britaxusa.com',       category: 'car seat',          categoryFit: 85 },
  { name: 'Joovy',           domain: 'joovy.com',           category: 'stroller',          categoryFit: 85 },
  { name: 'Mockingbird',     domain: 'hellomockingbird.com',category: 'stroller',          categoryFit: 90, founderAttributes: { women_founded: true } },
  { name: 'BabyBjörn',       domain: 'babybjorn.com',       category: 'baby gear',         categoryFit: 88 },

  // ── Soft-structured carriers + wraps ──────────────────────────────────────
  { name: 'Solly Baby',      domain: 'sollybaby.com',       category: 'baby wrap',         categoryFit: 92, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Artipoppe',       domain: 'artipoppe.com',       category: 'baby carrier',      categoryFit: 88 },
  { name: 'Wildbird',        domain: 'wildbirdslings.com',  category: 'ring sling',        categoryFit: 90, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Tula',            domain: 'babytula.com',        category: 'baby carrier',      categoryFit: 92 },
  { name: 'Ergobaby',        domain: 'ergobaby.com',        category: 'baby carrier',      categoryFit: 90 },
  { name: 'Boba',            domain: 'boba.com',            category: 'baby carrier',      categoryFit: 90 },
  { name: 'LÍLLÉbaby',       domain: 'lillebaby.com',       category: 'baby carrier',      categoryFit: 90 },
  { name: 'Moby Wrap',       domain: 'mobywrap.com',        category: 'baby wrap',         categoryFit: 88 },
]
