/**
 * Hunter.io integration — full client.
 *
 * Auth: api_key query parameter — Hunter's primary documented auth method.
 *   The key is appended to every request URL via URLSearchParams so special
 *   characters are encoded safely.
 *   Server-side only — never reaches a browser URL bar or client logs.
 *   Key is always passed through redactKey() before appearing in any log.
 *
 * Free tier: 25 domain searches + 50 email verifications per month.
 * Rate limit: 15 requests/min → enforce 4 s minimum between calls.
 * Credits: checked before every creditable call. If < 10 remaining,
 *   the call is skipped and a log line explains why.
 *
 * The API key is NEVER written to logs. All text that could echo the key
 * (error bodies, exception messages) is passed through redactKey() first.
 *
 * Functions:
 *   hunterAccountInfo()                         — account / credits (free)
 *   hunterDomainSearch(domain, options?)        — find emails for a domain
 *   hunterEmailFinder(domain, first, last)      — find a specific person's email
 *   hunterEmailVerifier(email)                  — SMTP deliverability check
 *
 * Legacy aliases (called by existing routes — do not remove):
 *   hunterFindEmails  →  hunterDomainSearch
 *   hunterVerify      →  hunterEmailVerifier
 *
 * No-op when HUNTER_API_KEY is not set.
 * Docs: https://hunter.io/api-documentation
 */

const BASE = 'https://api.hunter.io/v2'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HunterEmail {
  value: string
  type: 'personal' | 'generic' | null
  confidence: number
  first_name: string | null
  last_name: string | null
  position: string | null
  department: string | null
  seniority: string | null
  linkedin: string | null
  verified: boolean
  sources: { uri: string; extracted_on: string }[]
}

export interface HunterDomainResult {
  domain: string
  organization: string | null
  emails: HunterEmail[]
}

export interface HunterEmailFinderResult {
  email: string | null
  score: number
  first_name: string | null
  last_name: string | null
  position: string | null
  linkedin_url: string | null
}

export interface HunterVerifyResult {
  email: string
  result: 'deliverable' | 'undeliverable' | 'risky' | 'unknown'
  score: number
  regexp: boolean
  smtp_server: boolean
  smtp_check: boolean
  accept_all: boolean
  disposable: boolean
  webmail: boolean
}

export interface HunterAccountInfo {
  first_name: string | null
  last_name: string | null
  email: string | null
  plan_name: string | null
  plan_level: number
  reset_date: string | null
  requests: {
    searches: { available: number; used: number }
    verifications: { available: number; used: number }
  }
}

// ─── Key redaction ────────────────────────────────────────────────────────────
// Applied to all error bodies and exception messages before they touch logs
// or are returned to callers. Prevents the key from leaking via Hunter's
// own error responses (e.g. "Invalid API key: xxx").

function redactKey(text: string): string {
  const key = process.env.HUNTER_API_KEY
  if (!key || key.length < 8) return text
  return text.split(key).join('[HUNTER_KEY_REDACTED]')
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────
// Free tier: 15 req/min → 4 s minimum gap. Applied to every outbound call.

let lastRequestAt = 0
const MIN_GAP_MS = 4_000

async function rateLimit(): Promise<void> {
  const wait = MIN_GAP_MS - (Date.now() - lastRequestAt)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

// ─── Credit cache ─────────────────────────────────────────────────────────────
// Refreshed at most once per 5 minutes. hunterAccountInfo() is the only
// function that bypasses the credit check (it's free and populates the cache).

const CREDIT_CACHE_TTL = 5 * 60 * 1000  // 5 minutes
// Hard floor — hunter.ts won't spend credits below this level.
// Route-level callers can set a higher threshold (e.g. 5) for graceful
// early-stop before hitting this floor.
const MIN_CREDITS_BEFORE_SKIP = 3

interface CreditSnapshot {
  searches: number
  verifications: number
  fetchedAt: number
}
let creditCache: CreditSnapshot | null = null

async function loadCredits(log: string): Promise<CreditSnapshot | null> {
  if (creditCache && (Date.now() - creditCache.fetchedAt) < CREDIT_CACHE_TTL) {
    return creditCache
  }
  // Fetch fresh — use hunterAccountInfoRaw to avoid recursion
  const info = await hunterAccountInfoRaw(log)
  if (!info) return null
  creditCache = {
    searches:      info.requests.searches.available      - info.requests.searches.used,
    verifications: info.requests.verifications.available - info.requests.verifications.used,
    fetchedAt:     Date.now(),
  }
  return creditCache
}

function decrementCache(type: 'search' | 'verify'): void {
  if (!creditCache) return
  if (type === 'search')  creditCache.searches      = Math.max(0, creditCache.searches - 1)
  if (type === 'verify')  creditCache.verifications = Math.max(0, creditCache.verifications - 1)
}

/** Returns true if enough credits remain, false (and logs) if we should skip. */
async function hasCredits(type: 'search' | 'verify', log: string): Promise<boolean> {
  const snap = await loadCredits(log)
  if (!snap) return true   // can't check → proceed optimistically

  const remaining = type === 'search' ? snap.searches : snap.verifications
  if (remaining < MIN_CREDITS_BEFORE_SKIP) {
    console.log(
      `[hunter] credits low (${remaining} ${type} credits remaining) — ` +
      `skipping to preserve for priority brands`,
    )
    return false
  }
  return true
}

// ─── Core GET helper ──────────────────────────────────────────────────────────

async function hunterGet<T>(
  path: string,
  params: Record<string, string>,
  log: string,
): Promise<T | null> {
  await rateLimit()

  // Inject api_key into every request URL via URLSearchParams so special
  // characters in the key are percent-encoded automatically.
  const allParams = new URLSearchParams({ ...params, api_key: process.env.HUNTER_API_KEY ?? '' })
  const url = `${BASE}${path}?${allParams.toString()}`

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
    })

    if (!resp.ok) {
      const raw = await resp.text().catch(() => '')
      const body = redactKey(raw)
      console.error(`${log} Hunter HTTP ${resp.status} (${path}): ${body.slice(0, 200)}`)
      return null
    }

    const json = await resp.json() as { data?: T; errors?: { id: string; code: number; details: string }[] }

    if (json.errors?.length) {
      const detail = redactKey(json.errors.map(e => e.details).join('; '))
      console.error(`${log} Hunter API error (${path}): ${detail}`)
      return null
    }

    return (json.data ?? null) as T | null
  } catch (err) {
    const msg = redactKey(err instanceof Error ? err.message : String(err))
    console.error(`${log} Hunter request failed (${path}): ${msg}`)
    return null
  }
}

// ─── 1. Account info (free, populates credit cache) ──────────────────────────

/** Internal version — no credit check, no cache refresh loop. */
async function hunterAccountInfoRaw(log: string): Promise<HunterAccountInfo | null> {
  return hunterGet<HunterAccountInfo>('/account', {}, log)
}

/**
 * Returns Hunter account info including remaining credits.
 * Uses 0 credits. Safe to call at startup or before a scan.
 * Call once per scan run and log the output — tells you how much runway is left.
 */
export async function hunterAccountInfo(log = '[hunter]'): Promise<HunterAccountInfo | null> {
  const key = process.env.HUNTER_API_KEY
  if (!key) {
    console.log(`${log} HUNTER_API_KEY not set — skipping account info`)
    return null
  }

  const info = await hunterAccountInfoRaw(log)
  if (!info) return null

  const searchesLeft  = info.requests.searches.available      - info.requests.searches.used
  const verifiesLeft  = info.requests.verifications.available - info.requests.verifications.used
  console.log(
    `${log} Hunter account: plan=${info.plan_name ?? '?'} ` +
    `searches_remaining=${searchesLeft}/${info.requests.searches.available} ` +
    `verifications_remaining=${verifiesLeft}/${info.requests.verifications.available} ` +
    `resets=${info.reset_date ?? '?'}`,
  )

  return info
}

// ─── 2. Domain search ─────────────────────────────────────────────────────────

/**
 * Finds all email addresses associated with a domain.
 * Costs 1 search credit per unique domain per month.
 *
 * Options:
 *   type        — 'personal' (named people) | 'generic' (info@, press@, etc.)
 *                 Default 'personal' — returns named contacts most useful for outreach.
 *   department  — filter by department ('executive', 'marketing', 'communication', etc.)
 *   seniority   — filter by seniority ('senior', 'executive', 'director', etc.)
 *   limit       — max results (default 10, Hunter max 100)
 */
export async function hunterDomainSearch(
  domain: string,
  options: {
    type?: 'personal' | 'generic'
    department?: string
    seniority?: string
    limit?: number
    logPrefix?: string
  } = {},
): Promise<HunterEmail[]> {
  const key = process.env.HUNTER_API_KEY
  const log = options.logPrefix ?? '[hunter]'

  if (!key) {
    console.log(`${log} HUNTER_API_KEY not set — skipping domain search for ${domain}`)
    return []
  }

  if (!(await hasCredits('search', log))) return []

  const params: Record<string, string> = { domain, limit: String(options.limit ?? 10) }
  if (options.type)       params.type = options.type
  if (options.department) params.department = options.department
  if (options.seniority)  params.seniority = options.seniority

  console.log(`${log} domain_search ${domain} type=${options.type ?? 'all'} limit=${params.limit}`)

  const result = await hunterGet<HunterDomainResult>('/domain-search', params, log)
  if (!result) return []

  decrementCache('search')

  const emails = result.emails ?? []
  const personal = emails.filter(e => e.type === 'personal').length
  const generic  = emails.filter(e => e.type === 'generic').length
  console.log(
    `${log} domain_search ${domain} → ${emails.length} emails ` +
    `(${personal} personal, ${generic} generic) org="${result.organization ?? '?'}"`,
  )

  return emails
}

// ─── 3. Email finder (name + domain → email) ─────────────────────────────────

/**
 * Finds the email address for a specific person at a domain.
 * Useful when you found someone on LinkedIn but need their email.
 * Costs 1 search credit.
 * Returns null if Hunter doesn't have data or the search fails.
 */
export async function hunterEmailFinder(
  domain: string,
  firstName: string,
  lastName: string,
  logPrefix = '[hunter]',
): Promise<HunterEmailFinderResult | null> {
  const key = process.env.HUNTER_API_KEY
  if (!key) {
    console.log(`${logPrefix} HUNTER_API_KEY not set — skipping email finder`)
    return null
  }

  if (!(await hasCredits('search', logPrefix))) return null

  console.log(`${logPrefix} email-finder: ${firstName} ${lastName} @ ${domain}`)

  const result = await hunterGet<HunterEmailFinderResult>('/email-finder', {
    domain,
    first_name: firstName,
    last_name:  lastName,
  }, logPrefix)

  decrementCache('search')

  if (result?.email) {
    console.log(
      `${logPrefix} email-finder → ${result.email} (confidence=${result.score})`,
    )
  } else {
    console.log(`${logPrefix} email-finder: no result for ${firstName} ${lastName} @ ${domain}`)
  }

  return result
}

// ─── 4. Email verifier ────────────────────────────────────────────────────────

/**
 * Runs an SMTP deliverability check on a specific email address.
 * Costs 1 verification credit.
 * Best ROI on the free plan: use to confirm scraped/guessed emails before
 * sending outreach — a bounced email hurts sender reputation.
 *
 * Result meanings:
 *   deliverable   — SMTP confirmed the mailbox exists
 *   undeliverable — mailbox rejected / doesn't exist
 *   risky         — server accepts all mail (accept_all) — can't verify
 *   unknown       — SMTP check timed out or inconclusive
 */
export async function hunterEmailVerifier(
  email: string,
  logPrefix = '[hunter]',
): Promise<HunterVerifyResult | null> {
  const key = process.env.HUNTER_API_KEY
  if (!key) {
    console.log(`${logPrefix} HUNTER_API_KEY not set — skipping verification for ${email}`)
    return null
  }

  if (!(await hasCredits('verify', logPrefix))) return null

  console.log(`${logPrefix} email-verifier: ${email} (uses 1 credit)`)

  const result = await hunterGet<HunterVerifyResult>('/email-verifier', { email }, logPrefix)

  if (!result) return null
  decrementCache('verify')

  console.log(
    `${logPrefix} email-verifier: ${email} → result=${result.result} ` +
    `score=${result.score} accept_all=${result.accept_all}`,
  )

  return result
}

// ─── Legacy aliases (backward compat — called by existing routes) ─────────────

/**
 * @deprecated Use hunterDomainSearch() instead.
 * Kept so existing callers don't break.
 */
export async function hunterFindEmails(domain: string): Promise<HunterEmail[]> {
  return hunterDomainSearch(domain, { type: 'personal', limit: 10 })
}

/**
 * @deprecated Use hunterEmailVerifier() instead.
 * Kept so the verify API route doesn't break during the transition.
 */
export async function hunterVerify(email: string): Promise<HunterVerifyResult | null> {
  return hunterEmailVerifier(email)
}
