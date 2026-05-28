import type { WatchlistBrand } from './types'

/** Apps, platforms, and services for pregnancy, parenting, and fertility. */
export const SERVICES_APPS: WatchlistBrand[] = [
  // ── Pregnancy + parenting platforms ──────────────────────────────────────
  { name: 'Babylist',         domain: 'babylist.com',         category: 'baby registry/platform', categoryFit: 90 },
  { name: 'The Bump',         domain: 'thebump.com',          category: 'pregnancy/parenting media', categoryFit: 85 },
  { name: 'Peanut',           domain: 'peanut-app.io',        category: 'mom social app',        categoryFit: 88, founderAttributes: { women_founded: true } },
  { name: 'Wonder Weeks',     domain: 'wonderweeks.com',      category: 'baby development app',  categoryFit: 87 },
  { name: 'Huckleberry',      domain: 'huckleberrycare.com',  category: 'sleep tracking app',    categoryFit: 85 },
  { name: 'Tinybeans',        domain: 'tinybeans.com',        category: 'baby milestone app',    categoryFit: 85, founderAttributes: { women_founded: true } },

  // ── Fertility + cycle tracking ────────────────────────────────────────────
  { name: 'Flo Health',       domain: 'flo.health',           category: 'period/fertility app',  categoryFit: 82 },
  { name: 'Ovia Health',      domain: 'oviahealth.com',       category: 'fertility app',         categoryFit: 85 },
  { name: 'Ava Women',        domain: 'avawomen.com',         category: 'fertility tracker',     categoryFit: 85, founderAttributes: { women_founded: true } },
  { name: 'Modern Fertility',  domain: 'modernfertility.com',  category: 'fertility testing',    categoryFit: 90, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Mira Fertility',   domain: 'miracare.com',         category: 'fertility monitor',     categoryFit: 88 },
  { name: 'Inito',            domain: 'inito.com',            category: 'hormone monitor',       categoryFit: 85 },
  { name: 'Embie',            domain: 'embie.app',            category: 'IVF tracking app',      categoryFit: 88 },

  // ── Glow parenting suite ──────────────────────────────────────────────────
  { name: 'Glow',             domain: 'glowing.com',          category: 'fertility/parenting app', categoryFit: 82 },
]
