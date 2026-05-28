import type { WatchlistBrand } from './types'

/** Baby + toddler (0-3) clothing, sleepwear, and accessories. */
export const CLOTHING: WatchlistBrand[] = [
  // ── Elevated / indie brands ───────────────────────────────────────────────
  { name: 'Pehr',            domain: 'pehr.com',               category: 'baby clothing',     categoryFit: 92 },
  { name: 'Quincy Mae',      domain: 'quincymae.com',          category: 'baby clothing',     categoryFit: 93, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'MORI',            domain: 'babymori.com',           category: 'baby clothing',     categoryFit: 90, founderAttributes: { women_founded: true } },
  { name: 'Kyte Baby',       domain: 'kytebaby.com',           category: 'baby sleepwear',    categoryFit: 93, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Little Sleepies', domain: 'littlesleepies.com',     category: 'baby sleepwear',    categoryFit: 92, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Goumi',           domain: 'goumikids.com',          category: 'baby essentials',   categoryFit: 90, founderAttributes: { women_founded: true } },
  { name: 'Magnetic Me',     domain: 'magnetic-me.com',        category: 'baby clothing',     categoryFit: 90, founderAttributes: { mom_founded: true } },
  { name: 'Monica + Andy',   domain: 'monicaandandy.com',      category: 'baby clothing',     categoryFit: 90, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Finn & Emma',     domain: 'finnandemma.com',        category: 'organic baby clothing', categoryFit: 90, founderAttributes: { women_founded: true } },
  { name: "L'ovedbaby",      domain: 'lovedbaby.com',          category: 'organic baby clothing', categoryFit: 88 },
  { name: 'Posh Peanut',     domain: 'poshpeanut.com',         category: 'baby sleepwear',    categoryFit: 88 },
  { name: 'Caden Lane',      domain: 'cadenlane.com',          category: 'baby bedding/wear', categoryFit: 87 },

  // ── Broader retail brands with strong baby lines ───────────────────────────
  { name: 'Tea Collection',     domain: 'teacollection.com',   category: 'kids clothing',     categoryFit: 85, founderAttributes: { women_founded: true } },
  { name: 'Hanna Andersson',    domain: 'hannaandersson.com',  category: 'kids clothing',     categoryFit: 85 },
  { name: 'Mini Boden',         domain: 'miniboden.com',       category: 'kids clothing',     categoryFit: 83 },
  { name: "Carter's",           domain: 'carters.com',         category: 'baby clothing',     categoryFit: 82 },
  { name: "Burt's Bees Baby",   domain: 'burtsbeesbaby.com',   category: 'baby clothing',     categoryFit: 85 },
  { name: 'Janie and Jack',     domain: 'janieandjack.com',    category: 'premium kids clothing', categoryFit: 82 },
]
