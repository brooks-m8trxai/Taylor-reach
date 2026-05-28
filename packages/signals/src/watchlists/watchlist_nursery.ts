import type { WatchlistBrand } from './types'

/** Nursery furniture, décor, bedding, and home setup for new families. */
export const NURSERY: WatchlistBrand[] = [
  // ── Furniture ────────────────────────────────────────────────────────────
  { name: 'Babyletto',         domain: 'babyletto.com',        category: 'nursery furniture',  categoryFit: 90 },
  { name: 'Million Dollar Baby', domain: 'milliondollarbaby.com', category: 'nursery furniture', categoryFit: 87 },
  { name: 'Stokke',            domain: 'stokke.com',           category: 'nursery/high chair', categoryFit: 90 },
  { name: 'Nestig',            domain: 'nestig.com',           category: 'nursery furniture',  categoryFit: 88, founderAttributes: { women_founded: true } },

  // ── Décor + textiles ─────────────────────────────────────────────────────
  { name: 'Olli Ella',         domain: 'olliella.com',         category: 'nursery décor',      categoryFit: 88, founderAttributes: { women_founded: true } },
  { name: 'Crane Baby',        domain: 'cranebaby.com',        category: 'nursery décor',      categoryFit: 87 },
  { name: 'Spearmint Love',    domain: 'spearmintlove.com',    category: 'nursery décor',      categoryFit: 88, founderAttributes: { mom_founded: true, women_founded: true } },

  // ── Retail / curators ─────────────────────────────────────────────────────
  { name: 'Pottery Barn Kids', domain: 'potterybarnkids.com',  category: 'nursery furniture',  categoryFit: 85 },
  { name: 'Maisonette',        domain: 'maisonette.com',       category: 'baby/kids retailer', categoryFit: 83, founderAttributes: { women_founded: true } },
  { name: 'Project Nursery',   domain: 'projectnursery.com',   category: 'nursery tech/décor', categoryFit: 85 },

  // ── Tech + monitoring ─────────────────────────────────────────────────────
  { name: 'Nanit',             domain: 'nanit.com',            category: 'baby monitor',       categoryFit: 90 },
  { name: 'Sundays Company',   domain: null,                   category: 'nursery furniture',  categoryFit: 82 },
]
