/**
 * Apollo.io integration — full production client.
 *
 * Four exported functions:
 *
 *   apolloHealthCheck()
 *     Validates the API key and returns plan tier + credit balance.
 *     Uses 0 credits. Safe to call at startup.
 *
 *   apolloSearchOrganization(domain)
 *     POST /v1/mixed_companies/search → returns Apollo org record + id.
 *     Results are cached in memory — repeat calls cost 0 credits.
 *
 *   apolloPeopleSearch(orgId, options?)
 *     POST /v1/mixed_people/search by org_id (not domain).
 *     Searching by org_id is more accurate: Apollo's org graph deduplicates
 *     subsidiaries, acquired brands, and alternate domains.
 *
 *   apolloRevealEmail(personId)
 *     POST /v1/people/match — forces email reveal.
 *     Costs ~1 credit per call. Use only for high-priority contacts.
 *
 * apolloFindContacts(domain, options?) — backward-compatible wrapper.
 *   Internally runs the two-step flow (org lookup → people by orgId)
 *   then falls back to domain-only search if org lookup misses.
 *   Called by enricher.ts; signature unchanged.
 *
 * Security:
 *   - API key is ALWAYS sent as the X-Api-Key request header.
 *     Apollo deprecated URL query-parameter auth — never use ?api_key=.
 *   - The key is NEVER written to logs or error messages.
 *     All text that passes through console or return values is scrubbed
 *     through redactKey() before leaving this module.
 *
 * Rate limit: 200 ms minimum between any two API calls (module-level).
 * Cache: up to 500 org lookups stored in memory per process.
 *
 * No-op when APOLLO_API_KEY is not set.
 *
 * Get a key: https://app.apollo.io/#/settings/integrations/api
 * Docs: https://apolloio.github.io/apollo-api-docs/
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

export interface ApolloOrganization {
  id: string
  name: string
  website_url: string | null
  linkedin_url: string | null
  estimated_num_employees: number | null
  industry: string | null
  keywords: string[]
  short_description: string | null
  founded_year: number | null
  primary_domain: string | null
}

export interface ApolloSearchResult {
  people: ApolloPerson[]
  total_entries: number
}

export interface ApolloHealthResult {
  ok: boolean
  planTier: string | null
  creditsUsed: number | null
  creditsRemaining: number | null
  message?: string
}

// ─── Title tiers for partnership outreach ─────────────────────────────────────
//
// Listed in priority order. apolloPeopleSearch filters for all of these;
// results are ranked by tier in enricher.ts when inserting contacts.

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

// ─── Key redaction ────────────────────────────────────────────────────────────
// Apollo's error responses sometimes echo authentication tokens back in the
// body (e.g. "Invalid API key: sk_xxx"). This helper scrubs the live key from
// any string before it touches console output or is returned to callers.
// Applied to: all response body text, all caught error messages.

function redactKey(text: string): string {
  const key = process.env.APOLLO_API_KEY
  if (!key || key.length < 8) return text   // key too short to redact safely
  // replaceAll available in Node 15+; use split/join for wider compat
  return text.split(key).join('[APOLLO_KEY_REDACTED]')
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────
// Enforces 200 ms minimum gap between all Apollo API calls (module-level).
// Apollo's free/basic tiers enforce per-minute limits; 200 ms → 5 req/s keeps
// us well inside those limits even under parallel enrichment jobs.

let lastRequestAt = 0
const MIN_REQUEST_GAP_MS = 200

async function rateLimit(): Promise<void> {
  const now = Date.now()
  const wait = MIN_REQUEST_GAP_MS - (now - lastRequestAt)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

// ─── In-memory org cache ──────────────────────────────────────────────────────
// Keyed by domain. null means we already looked and got nothing (so we don't
// keep hammering Apollo for domains it doesn't know about).

const orgCache = new Map<string, ApolloOrganization | null>()
const MAX_CACHE_ENTRIES = 500

function cacheOrg(domain: string, org: ApolloOrganization | null): void {
  if (orgCache.size >= MAX_CACHE_ENTRIES) {
    // Simple FIFO eviction — delete the oldest inserted key
    const oldest = orgCache.keys().next().value
    if (oldest !== undefined) orgCache.delete(oldest)
  }
  orgCache.set(domain, org)
}

// ─── Core POST helper ─────────────────────────────────────────────────────────

async function apolloPost<T>(
  path: string,
  body: Record<string, unknown>,
  logPrefix: string,
): Promise<T | null> {
  const key = process.env.APOLLO_API_KEY
  if (!key) return null

  await rateLimit()

  try {
    const resp = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })

    if (!resp.ok) {
      const raw = await resp.text().catch(() => '')
      const text = redactKey(raw)
      // 422 = Apollo couldn't find anything — not an error worth alarming on
      if (resp.status === 422) {
        console.log(`${logPrefix} Apollo 422 (no match) for ${path}`)
      } else {
        console.error(`${logPrefix} Apollo HTTP ${resp.status} (${path}): ${text.slice(0, 200)}`)
      }
      return null
    }

    const data = await resp.json() as T & { error?: string }
    if ((data as Record<string, unknown>).error) {
      const apiErr = redactKey(String((data as Record<string, unknown>).error))
      console.error(`${logPrefix} Apollo API error (${path}): ${apiErr}`)
      return null
    }
    return data
  } catch (err) {
    const msg = redactKey(err instanceof Error ? err.message : String(err))
    console.error(`${logPrefix} Apollo request failed (${path}): ${msg}`)
    return null
  }
}

// ─── 1. Health check ─────────────────────────────────────────────────────────

/**
 * Validates the API key and returns plan tier + credit balance.
 * Uses 0 credits. Call this from /api/admin/apollo-health to verify the key.
 */
export async function apolloHealthCheck(logPrefix = '[apollo]'): Promise<ApolloHealthResult> {
  const key = process.env.APOLLO_API_KEY
  if (!key) {
    return {
      ok: false,
      planTier: null,
      creditsUsed: null,
      creditsRemaining: null,
      message: 'APOLLO_API_KEY not set',
    }
  }

  await rateLimit()

  try {
    const resp = await fetch(`${BASE}/auth/health`, {
      method: 'GET',
      headers: { 'X-Api-Key': key },
      signal: AbortSignal.timeout(10_000),
    })

    if (!resp.ok) {
      const raw = await resp.text().catch(() => '')
      const text = redactKey(raw)
      return {
        ok: false,
        planTier: null,
        creditsUsed: null,
        creditsRemaining: null,
        message: `HTTP ${resp.status}: ${text.slice(0, 100)}`,
      }
    }

    const data = await resp.json() as {
      is_logged_in?: boolean
      user?: {
        email?: string
        plan_tier?: string
        credits_used?: number
        credits_remaining?: number
      }
    }

    const ok = data.is_logged_in === true
    const planTier = data.user?.plan_tier ?? null
    const creditsUsed = data.user?.credits_used ?? null
    const creditsRemaining = data.user?.credits_remaining ?? null

    if (ok) {
      console.log(
        `${logPrefix} Apollo health OK — plan=${planTier} credits_used=${creditsUsed ?? '?'} credits_remaining=${creditsRemaining ?? '?'}`,
      )
    } else {
      console.warn(`${logPrefix} Apollo health: not authenticated — check APOLLO_API_KEY`)
    }

    return { ok, planTier, creditsUsed, creditsRemaining }
  } catch (err) {
    const message = redactKey(err instanceof Error ? err.message : String(err))
    console.error(`${logPrefix} Apollo health check failed: ${message}`)
    return { ok: false, planTier: null, creditsUsed: null, creditsRemaining: null, message }
  }
}

// ─── 2. Organization lookup ───────────────────────────────────────────────────

/**
 * Looks up a company on Apollo by domain.
 * Returns Apollo's org record (id, name, employee count, industry, etc.)
 * Cache: results are stored in memory — repeat calls for the same domain
 * cost 0 API credits and complete instantly.
 */
export async function apolloSearchOrganization(
  domain: string,
  logPrefix = '[apollo]',
): Promise<ApolloOrganization | null> {
  const key = process.env.APOLLO_API_KEY
  if (!key) {
    console.log(`${logPrefix} APOLLO_API_KEY not set — skipping org lookup for ${domain}`)
    return null
  }

  // Cache hit (including negative cache — null means already tried and missed)
  if (orgCache.has(domain)) {
    const cached = orgCache.get(domain) ?? null
    if (cached) {
      console.log(`${logPrefix} Org cache hit: ${domain} → "${cached.name}" (${cached.id})`)
    }
    return cached
  }

  console.log(`${logPrefix} Looking up org on Apollo: ${domain}`)

  const data = await apolloPost<{
    organizations?: ApolloOrganization[]
    pagination?: { total_entries?: number }
  }>('/mixed_companies/search', {
    q_organization_domains: domain,
    page: 1,
    per_page: 1,
  }, logPrefix)

  const org = data?.organizations?.[0] ?? null
  cacheOrg(domain, org)

  if (org) {
    console.log(
      `${logPrefix} Org found: "${org.name}" id=${org.id}` +
      ` employees=${org.estimated_num_employees ?? '?'} industry="${org.industry ?? '?'}"`,
    )
  } else {
    console.log(`${logPrefix} Org not found on Apollo for domain: ${domain}`)
  }

  return org
}

// ─── 3. People search by org ID ───────────────────────────────────────────────

/**
 * Searches Apollo for people at an organization by org_id.
 * Searching by org_id (not domain) is more accurate: Apollo's org graph
 * handles subsidiaries, acquired brands, and alternate domain spellings.
 *
 * Returns only people who have an email address in Apollo's database.
 */
export async function apolloPeopleSearch(
  orgId: string,
  options: {
    titles?: string[]
    limit?: number
    logPrefix?: string
  } = {},
): Promise<ApolloPerson[]> {
  const key = process.env.APOLLO_API_KEY
  if (!key) return []

  const titles = options.titles ?? PARTNERSHIP_TITLES
  const limit  = options.limit   ?? 10
  const log    = options.logPrefix ?? '[apollo]'

  console.log(`${log} People search: org_id=${orgId} limit=${limit} title_filters=${titles.length}`)

  const data = await apolloPost<{
    people?: ApolloPerson[]
    pagination?: { total_entries?: number }
  }>('/mixed_people/search', {
    organization_ids: [orgId],
    person_titles: titles,
    page: 1,
    per_page: limit,
  }, log)

  const people = (data?.people ?? []).filter(p => p.email)
  console.log(
    `${log} People at org ${orgId}: ${people.length} with email` +
    ` (total_entries=${data?.pagination?.total_entries ?? '?'})`,
  )

  return people
}

// ─── 4. Email reveal ─────────────────────────────────────────────────────────

/**
 * Forces an email reveal for a person Apollo has on record.
 * Costs ~1 email reveal credit per call on the Basic plan.
 * Use only when apolloPeopleSearch returns a person without an email
 * AND you're confident the contact is worth the credit burn.
 *
 * Returns null if no email found, person not in Apollo, or key not set.
 */
export async function apolloRevealEmail(
  personId: string,
  logPrefix = '[apollo]',
): Promise<string | null> {
  const key = process.env.APOLLO_API_KEY
  if (!key) return null

  console.log(`${logPrefix} Requesting email reveal for person ${personId} (burns 1 credit)`)

  const data = await apolloPost<{
    person?: ApolloPerson
  }>('/people/match', {
    id: personId,
    reveal_personal_emails: false,   // work emails only — personal = more credits
    reveal_phone_number: false,
  }, logPrefix)

  const email = data?.person?.email ?? null
  if (email) {
    console.log(`${logPrefix} Revealed: ${email} (status=${data?.person?.email_status ?? '?'})`)
  } else {
    console.log(`${logPrefix} No email revealed for person ${personId}`)
  }

  return email
}

// ─── 5. High-level domain → contacts (backward-compatible) ───────────────────

/**
 * Two-step contact lookup:
 *   1. apolloSearchOrganization(domain) → org_id (cached after first call)
 *   2. apolloPeopleSearch(org_id, { titles: PARTNERSHIP_TITLES, limit })
 *
 * Falls back to direct domain-only people search if org lookup misses.
 *
 * This is the function called by enricher.ts — signature unchanged.
 */
export async function apolloFindContacts(
  domain: string,
  options: { perPage?: number; logPrefix?: string } = {},
): Promise<ApolloPerson[]> {
  const key = process.env.APOLLO_API_KEY
  const log    = options.logPrefix ?? '[apollo]'
  const perPage = options.perPage ?? 5

  if (!key) {
    console.log(`${log} APOLLO_API_KEY not set — skipping contact lookup for ${domain}`)
    return []
  }

  console.log(`${log} Finding contacts at ${domain} (two-step: org lookup → people by orgId)`)

  // Step 1: org lookup (returns immediately from cache on repeat calls)
  const org = await apolloSearchOrganization(domain, log)

  let people: ApolloPerson[]

  if (org?.id) {
    // Step 2a: people by org_id (preferred path — most accurate)
    people = await apolloPeopleSearch(org.id, {
      titles: PARTNERSHIP_TITLES,
      limit: perPage,
      logPrefix: log,
    })
  } else {
    // Step 2b: domain-only fallback (original behavior)
    console.log(`${log} Org lookup missed — falling back to domain search for ${domain}`)

    const data = await apolloPost<{
      people?: ApolloPerson[]
      pagination?: { total_entries?: number }
    }>('/mixed_people/search', {
      q_organization_domains: domain,
      person_titles: PARTNERSHIP_TITLES,
      page: 1,
      per_page: perPage,
    }, log)

    people = (data?.people ?? []).filter(p => p.email)
    console.log(`${log} Domain fallback: ${people.length} contact(s) with email at ${domain}`)
  }

  const result = people.slice(0, perPage)

  // Log each contact so enrichment runs are easy to audit
  for (const p of result) {
    console.log(`${log}   ${p.email}  title="${p.title ?? '—'}"  status=${p.email_status ?? '?'}`)
  }

  console.log(`${log} apolloFindContacts(${domain}) → ${result.length} contact(s) returned`)
  return result
}
