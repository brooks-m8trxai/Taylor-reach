/**
 * GET /api/admin/hunter-test-five
 *
 * Runs Hunter.io domain search on 5 target DTC baby/parenting brands and
 * returns a side-by-side comparison: how many contacts found, how many are
 * personal vs generic, and how many came back verified deliverable.
 *
 * Use this to validate Hunter's DTC coverage before running enrichment at scale.
 * Takes ~60-90 s due to Hunter's 4s rate-limit gap + SMTP verification per email.
 *
 * Does NOT write anything to the database.
 */

import { NextResponse } from 'next/server'
import { hunterDomainSearch, hunterEmailVerifier, hunterAccountInfo } from '@taylor-reach/integrations'

export const dynamic  = 'force-dynamic'
export const maxDuration = 120

const TEST_BRANDS = [
  { name: 'Bobbie',     domain: 'hibobbie.com' },
  { name: 'Lovevery',   domain: 'lovevery.com' },
  { name: 'Frida Mom',  domain: 'fridababy.com' },
  { name: 'Hatch',      domain: 'hatch.co' },
  { name: 'Tubby Todd', domain: 'tubbytodd.com' },
]

export async function GET() {
  if (!process.env.HUNTER_API_KEY) {
    return NextResponse.json(
      { error: 'HUNTER_API_KEY not set — add it to .env.local' },
      { status: 400 },
    )
  }

  // Log credit balance before the test run
  const account = await hunterAccountInfo('[hunter-test-five]')

  const results = []

  for (const brand of TEST_BRANDS) {
    const emails = await hunterDomainSearch(brand.domain, {
      limit: 5,
      logPrefix: `[hunter-test-five/${brand.name}]`,
    })

    // Verify each email found
    const verified: string[] = []
    const risky:    string[] = []
    const invalid:  string[] = []

    for (const e of emails) {
      const v = await hunterEmailVerifier(e.value, `[hunter-test-five/${brand.name}]`)
      if (!v) continue
      if (v.result === 'deliverable')   verified.push(e.value)
      else if (v.result === 'risky' || v.accept_all) risky.push(e.value)
      else if (v.result === 'undeliverable') invalid.push(e.value)
    }

    results.push({
      brand:    brand.name,
      domain:   brand.domain,
      total:    emails.length,
      personal: emails.filter(e => e.type === 'personal').length,
      generic:  emails.filter(e => e.type === 'generic').length,
      verified: verified.length,
      risky:    risky.length,
      invalid:  invalid.length,
      contacts: emails.map(e => ({
        email:      e.value,
        type:       e.type,
        confidence: e.confidence,
        name:       [e.first_name, e.last_name].filter(Boolean).join(' ') || null,
        position:   e.position,
      })),
    })
  }

  const totalFound    = results.reduce((n, r) => n + r.total, 0)
  const totalVerified = results.reduce((n, r) => n + r.verified, 0)
  const totalPersonal = results.reduce((n, r) => n + r.personal, 0)

  return NextResponse.json({
    ok: true,
    credits_remaining: {
      searches:      account
        ? account.requests.searches.available      - account.requests.searches.used
        : 'unknown',
      verifications: account
        ? account.requests.verifications.available - account.requests.verifications.used
        : 'unknown',
    },
    summary: {
      brands_tested:    TEST_BRANDS.length,
      total_contacts:   totalFound,
      personal_emails:  totalPersonal,
      verified_emails:  totalVerified,
      verify_rate:      totalFound > 0
        ? `${Math.round((totalVerified / totalFound) * 100)}%`
        : '0%',
    },
    brands: results,
  })
}
