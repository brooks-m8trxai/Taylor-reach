import type { WatchlistBrand } from './types'

/** Infant formula, breast pumps, lactation support, baby food (purees to solids). */
export const FEEDING: WatchlistBrand[] = [
  // ── Formula ─────────────────────────────────────────────────────────────────
  { name: 'Bobbie',            domain: 'hibobbie.com',              category: 'infant formula',      categoryFit: 95, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Kendamil',          domain: 'kendamil.com',              category: 'infant formula',      categoryFit: 93 },
  { name: 'ByHeart',           domain: 'byheart.com',               category: 'infant formula',      categoryFit: 93, founderAttributes: { women_founded: true } },
  { name: 'Aussie Bubs',       domain: 'aussiebubs.com',            category: 'infant formula',      categoryFit: 90 },
  { name: 'Holle',             domain: 'holleorganic.com',          category: 'organic formula',     categoryFit: 90 },
  { name: 'HiPP',              domain: 'hipp.de',                   category: 'organic formula',     categoryFit: 90 },

  // ── Breast pumps + lactation ──────────────────────────────────────────────
  { name: 'Elvie',             domain: 'elvie.com',                 category: 'breast pump',         categoryFit: 95 },
  { name: 'Willow',            domain: 'willowpump.com',            category: 'breast pump',         categoryFit: 95, founderAttributes: { women_founded: true } },
  { name: 'Lansinoh',          domain: 'lansinoh.com',              category: 'breastfeeding',       categoryFit: 92 },
  { name: 'Medela',            domain: 'medela.com',                category: 'breast pump',         categoryFit: 90 },
  { name: 'Spectra',           domain: 'spectra-baby.com',          category: 'breast pump',         categoryFit: 90 },
  { name: 'Boobie Bar',        domain: 'theboobiebar.com',          category: 'lactation support',   categoryFit: 93, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Pumpspotting',      domain: 'pumpspotting.com',          category: 'lactation support',   categoryFit: 90, founderAttributes: { mom_founded: true } },
  { name: 'Milkful',           domain: 'milkful.com',               category: 'lactation nutrition', categoryFit: 90, founderAttributes: { mom_founded: true } },

  // ── Baby food + nutrition ─────────────────────────────────────────────────
  { name: 'Yumi',              domain: 'helloyumi.com',             category: 'baby food',           categoryFit: 90, founderAttributes: { women_founded: true } },
  { name: 'Cerebelly',         domain: 'cerebelly.com',             category: 'baby food',           categoryFit: 90, founderAttributes: { women_founded: true } },
  { name: 'Once Upon a Farm',  domain: 'onceuponafarm.com',         category: 'baby food',           categoryFit: 88 },
  { name: 'Square Baby',       domain: 'squarebaby.com',            category: 'baby food',           categoryFit: 88, founderAttributes: { mom_founded: true } },
  { name: 'Little Spoon',      domain: 'littlespoon.com',           category: 'baby food',           categoryFit: 90, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Serenity Kids',     domain: 'serenitykids.com',          category: 'baby food',           categoryFit: 88, founderAttributes: { women_founded: true } },
  { name: 'Nurture Life',      domain: 'nurturelife.com',           category: 'baby food',           categoryFit: 85 },

  // ── Frida (covers nursing + postpartum feeding side) ─────────────────────
  { name: 'Frida Mom',         domain: 'fridababy.com',             category: 'postpartum care',     categoryFit: 93, founderAttributes: { mom_founded: true, women_founded: true } },
]
