/**
 * Hunter.io integration stub.
 *
 * All functions are no-ops when HUNTER_API_KEY is not set, so the rest of the
 * codebase can import and call them without guarding every call site.
 *
 * Pricing: ~$34/mo for 500 verifications. Set the key when you decide Hunter
 * coverage is worth it over pure scraping.
 *
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
  linkedin: string | null
  verified: boolean
}

export interface HunterDomainResult {
  domain: string
  organization: string | null
  emails: HunterEmail[]
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

// ─── Domain search ────────────────────────────────────────────────────────────

/**
 * Finds emails associated with a domain via Hunter's domain-search endpoint.
 * Returns [] when HUNTER_API_KEY is not set (no-op mode).
 */
export async function hunterFindEmails(domain: string): Promise<HunterEmail[]> {
  const key = process.env.HUNTER_API_KEY
  if (!key) {
    console.log(`[hunter] HUNTER_API_KEY not set — skipping domain search for ${domain}`)
    return []
  }

  try {
    const params = new URLSearchParams({
      domain,
      api_key: key,
      limit: '10',
      type: 'personal',    // prefer named contacts over generic inboxes
    })
    const resp = await fetch(`${BASE}/domain-search?${params}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) {
      console.error(`[hunter] domain-search failed for ${domain}: HTTP ${resp.status}`)
      return []
    }
    const json = await resp.json() as { data?: { emails?: HunterEmail[] } }
    return json?.data?.emails ?? []
  } catch (err) {
    console.error(`[hunter] domain-search error for ${domain}:`, err)
    return []
  }
}

// ─── Email verifier ───────────────────────────────────────────────────────────

/**
 * Verifies whether a specific email address is deliverable via Hunter's
 * email-verifier endpoint.
 * Returns null when HUNTER_API_KEY is not set (no-op mode).
 */
export async function hunterVerify(email: string): Promise<HunterVerifyResult | null> {
  const key = process.env.HUNTER_API_KEY
  if (!key) {
    console.log(`[hunter] HUNTER_API_KEY not set — skipping verification for ${email}`)
    return null
  }

  try {
    const params = new URLSearchParams({ email, api_key: key })
    const resp = await fetch(`${BASE}/email-verifier?${params}`, {
      signal: AbortSignal.timeout(15_000),   // SMTP checks can be slow
    })
    if (!resp.ok) {
      console.error(`[hunter] email-verifier failed for ${email}: HTTP ${resp.status}`)
      return null
    }
    const json = await resp.json() as { data?: HunterVerifyResult }
    return json?.data ?? null
  } catch (err) {
    console.error(`[hunter] email-verifier error for ${email}:`, err)
    return null
  }
}
