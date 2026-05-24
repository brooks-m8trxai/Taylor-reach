/**
 * Known publisher and media partner domains.
 *
 * Used during scanning to recognise known media partners by name,
 * even when the article spells the name slightly differently.
 *
 * NOTE: The enrichment package has its own inline copy of these domains
 * (KNOWN_PUBLISHER_DOMAINS in enricher.ts) to avoid a circular dependency
 * (signals → enrichment already exists; enrichment cannot re-import signals).
 */

export interface KnownPublisher {
  domain: string
  /** Pre-written description Haiku can use when a homepage fetch fails. */
  description: string
  kind: 'publisher'
  category: string
}

export const KNOWN_PUBLISHERS: Record<string, KnownPublisher> = {
  motherly: {
    domain: 'motherly.com',
    description:
      'Motherly is a digital media and wellness brand for modern mothers covering pregnancy, parenting, and maternal health. Their audience is millennial and Gen-Z moms seeking expert-backed guidance on every stage of the parenting journey.',
    kind: 'publisher',
    category: 'parenting media',
  },
  'mother.ly': {
    domain: 'motherly.com',
    description:
      'Motherly is a digital media and wellness brand for modern mothers covering pregnancy, parenting, and maternal health. Their audience is millennial and Gen-Z moms seeking expert-backed guidance on every stage of the parenting journey.',
    kind: 'publisher',
    category: 'parenting media',
  },
  'cool mom picks': {
    domain: 'coolmompicks.com',
    description:
      'Cool Mom Picks is an independent media brand that recommends the coolest, most innovative products for modern parents. Their audience is trend-forward, design-savvy moms who value curation and independent editorial over corporate lists.',
    kind: 'publisher',
    category: 'parenting media',
  },
  coolmompicks: {
    domain: 'coolmompicks.com',
    description:
      'Cool Mom Picks is an independent media brand that recommends the coolest, most innovative products for modern parents. Their audience is trend-forward, design-savvy moms who value curation and independent editorial over corporate lists.',
    kind: 'publisher',
    category: 'parenting media',
  },
  'scary mommy': {
    domain: 'scarymommy.com',
    description:
      'Scary Mommy is a parenting media brand known for raw, honest coverage of the messy realities of motherhood. With tens of millions of monthly readers, their audience skews millennial moms who appreciate humor, authenticity, and community.',
    kind: 'publisher',
    category: 'parenting media',
  },
  scarymommy: {
    domain: 'scarymommy.com',
    description:
      'Scary Mommy is a parenting media brand known for raw, honest coverage of the messy realities of motherhood. With tens of millions of monthly readers, their audience skews millennial moms who appreciate humor, authenticity, and community.',
    kind: 'publisher',
    category: 'parenting media',
  },
  romper: {
    domain: 'romper.com',
    description:
      'Romper is a digital media brand for millennial and Gen-Z parents covering pregnancy, newborn care, and early parenting life with a culturally savvy, inclusive voice. Their audience is predominantly first-time parents in the newborn-to-toddler window.',
    kind: 'publisher',
    category: 'parenting media',
  },
  babylist: {
    domain: 'babylist.com',
    description:
      'Babylist is the leading baby registry platform trusted by millions of expectant parents for curating and purchasing newborn essentials. Their audience is actively preparing for a new baby arrival and is highly receptive to product recommendations.',
    kind: 'publisher',
    category: 'baby registry / commerce',
  },
  parents: {
    domain: 'parents.com',
    description:
      'Parents is one of the largest parenting media brands in the US, covering child development, health, and family life for a broad mainstream parent audience across all stages from pregnancy through teen years.',
    kind: 'publisher',
    category: 'parenting media',
  },
  'parents magazine': {
    domain: 'parents.com',
    description:
      'Parents is one of the largest parenting media brands in the US, covering child development, health, and family life for a broad mainstream parent audience across all stages from pregnancy through teen years.',
    kind: 'publisher',
    category: 'parenting media',
  },
  'the bump': {
    domain: 'thebump.com',
    description:
      'The Bump is a pregnancy and new parent digital media brand owned by The Knot Worldwide. It serves expectant and new parents with week-by-week pregnancy tracking, baby name tools, and expert advice.',
    kind: 'publisher',
    category: 'pregnancy / parenting media',
  },
  thebump: {
    domain: 'thebump.com',
    description:
      'The Bump is a pregnancy and new parent digital media brand owned by The Knot Worldwide. It serves expectant and new parents with week-by-week pregnancy tracking, baby name tools, and expert advice.',
    kind: 'publisher',
    category: 'pregnancy / parenting media',
  },
  babycenter: {
    domain: 'babycenter.com',
    description:
      'BabyCenter is one of the world\'s largest pregnancy and parenting digital media brands, reaching over 100 million parents globally with expert content, community forums, and week-by-week development tracking.',
    kind: 'publisher',
    category: 'parenting media',
  },
}

/**
 * Returns the known publisher entry for a given brand name (case-insensitive),
 * or null if not recognised.
 */
export function findKnownPublisher(brandName: string): KnownPublisher | null {
  const key = brandName.toLowerCase().trim()
  return KNOWN_PUBLISHERS[key] ?? null
}
