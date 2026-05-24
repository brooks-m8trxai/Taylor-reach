/**
 * Apollo.io integration.
 *
 * Apollo cross-references LinkedIn profiles with verified work emails.
 * For Taylor's use case: finds partnership/influencer/marketing contacts at
 * a brand's domain and returns them with name, title, and email.
 *
 * Pricing (as of 2025):
 *   Basic  $49/mo — 10K API credits, ~2K email reveals
 *   Professional $79/mo — unlimited email reveals
 *   For 13 brands at 5 contacts each = 65 reveals → Basic is enough.
 *
 * Get a key: https://app.apollo.io/#/settings/integrations/api
 * Docs: https://apolloio.github.io/apollo-api-docs/
 *
 * No-op when APOLLO_API_KEY is not set.
 */

const BASE = 'https://api.apollo.io/v1'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApolloPerson {
  id: string
  name: string
  first_name: string | null
  last_name: string | null
  title: string | null
  email: string | null
  email_status: 'verified' | 'guessed' | 'unavailable' | 'bounced' | null
  linkedin_url: string | null
  organization_name: string | null
}

export interface ApolloSearchResult {
  people: ApolloPerson[]
  total_entries: number
}

// ─── Title tiers for partnership outreach ─────────────────────────────────────
//
// Listed in priority order. Apollo searches for all of these and we rank
// results by tier when inserting contacts.

export const PARTNERSHIP_TITLES = [
  // Tier 1 — influencer/creator-specific
  'Head of Influencer Marketing',
  'Director of Influencer Marketing',
  'VP of Influencer Marketing',
  'Influencer Marketing Manager',
  'Senior Influencer Marketing Manager',
  'Creator Partnerships Manager',
  'Head of Creator Partnerships',
  'Director of Creator Marketing',
  // Tier 2 — brand partnerships
  'Brand Partnerships Manager',
  'Director of Brand Partnerships',
  'Head of Brand Partnerships',
  'VP of Partnerships',
  'Partnership Manager',
  // Tier 3 — social / content
  'Head of Social Media',
  'Social Media Director',
  'Head of Content',
  'Content Marketing Manager',
  // Tier 4 — broad marketing (fallback)
  'VP Marketing',
  'CMO',
  'Chief Marketing Officer',
  'Marketing Director',
  'Head of Marketing',
]

/** Rough tier scoring for role_priority (1 = best) */
export function apolloTitlePriority(title: string | null): number {
  if (!title) return 5
  const t = title.toLowerCase()
  if (t.includes('influencer') || t.includes('creator')) return 1
  if (t.includes('partnership') || t.includes('partnerships')) return 1
  if (t.includes('social') || t.includes('content')) return 2
  if (t.includes('marketing') && (t.includes('head') || t.includes('director') || t.includes('vp'))) return 2
  if (t.includes('cmo') || t.includes('chief marketing')) return 3
  return 4
}

// ─── Domain search ────────────────────────────────────────────────────────────

/**
 * Searches Apollo for people at a given domain with partnership-relevant titles.
 * Returns [] when APOLLO_API_KEY is not set.
 */
export async function apolloFindContacts(
  domain: string,
  options: { perPage?: number; logPrefix?: string } = {},
): Promise<ApolloPerson[]> {
  const key = process.env.APOLLO_API_KEY
  const log = options.logPrefix ?? '[apollo]'

  if (!key) {
    console.log(`${log} APOLLO_API_KEY not set — skipping contact lookup for ${domain}`)
    return []
  }

  const perPage = options.perPage ?? 5

  console.log(`${log} Searching Apollo for contacts at ${domain} (up to ${perPage})…`)

  try {
    const resp = await fetch(`${BASE}/mixed_people/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': key,
      },
      body: JSON.stringify({
        q_organization_domains: domain,
        person_titles: PARTNERSHIP_TITLES,
        page: 1,
        per_page: perPage,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    // Log the HTTP status so failures are visible
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      console.error(`${log} Apollo HTTP ${resp.status} for ${domain}: ${body.slice(0, 200)}`)
      return []
    }

    const data = await resp.json() as {
      people?: ApolloPerson[]
      pagination?: { total_entries?: number }
      error?: string
    }

    // Apollo sometimes returns 200 with an error body
    if (data.error) {
      console.error(`${log} Apollo API error for ${domain}: ${data.error}`)
      return []
    }

    const people = (data.people ?? []).filter(p => p.email)
    console.log(
      `${log} Apollo found ${people.length} contact(s) with email at ${domain}` +
      ` (total_entries=${data.pagination?.total_entries ?? '?'})`,
    )
    for (const p of people) {
      console.log(`${log}   ${p.email}  title="${p.title}"  status=${p.email_status}`)
    }

    return people.slice(0, perPage)
  } catch (err) {
    console.error(`${log} Apollo request failed for ${domain}:`, err)
    return []
  }
}
