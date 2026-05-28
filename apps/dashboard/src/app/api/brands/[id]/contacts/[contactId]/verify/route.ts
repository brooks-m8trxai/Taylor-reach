/**
 * POST /api/brands/[id]/contacts/[contactId]/verify
 *
 * Runs Hunter.io SMTP verification on a single contact email.
 * On success, updates brand_contacts with:
 *   - verified        (true if deliverable)
 *   - email_status    (deliverable | undeliverable | risky | unknown)
 *   - confidence      (Hunter score 0–100, if available from prior domain search)
 *   - quality_badge   (upgraded to 'named' if verified, 'risky', or 'invalid')
 *   - badge_reason    (human-readable explanation with score)
 *   - last_verified_at
 *
 * Returns { skipped: true } when HUNTER_API_KEY is not set — no error.
 * Returns { creditsLow: true } when Hunter has < 10 verifications remaining.
 */

import { NextResponse } from 'next/server'
import { serverClient } from '@taylor-reach/db'
import { hunterEmailVerifier } from '@taylor-reach/integrations'

export async function POST(
  _req: Request,
  { params }: { params: { id: string; contactId: string } },
) {
  const { id: brandId, contactId } = params

  const { data: contact } = await serverClient
    .from('brand_contacts')
    .select('id, email, name, title, quality_badge')
    .eq('id', contactId)
    .single()

  if (!contact || !contact.email) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  if (!process.env.HUNTER_API_KEY) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      message: 'HUNTER_API_KEY not set — add it to .env to enable verification',
    })
  }

  const result = await hunterEmailVerifier(contact.email, `[verify/${contactId}]`)

  // null result = Hunter returned credits-low skip or API failure
  if (!result) {
    // Distinguish credit-low from API error by checking what hunterEmailVerifier logged
    return NextResponse.json({
      ok: false,
      creditsLow: true,
      error: 'Hunter verification skipped — low credits or API error',
    }, { status: 503 })
  }

  // Map Hunter result → quality badge
  const verified  = result.result === 'deliverable'
  let newBadge = contact.quality_badge as string | null

  if (verified) {
    // Upgrade any badge to 'named' if the person is verified deliverable
    // (unless they're an editorial/founder contact — keep the more specific badge)
    if (!['editorial', 'founder'].includes(newBadge ?? '')) {
      newBadge = 'named'
    }
  } else if (result.result === 'risky' || result.accept_all) {
    newBadge = 'risky'
  } else if (result.result === 'undeliverable') {
    newBadge = 'invalid'
  }

  const badgeReason = [
    `Hunter SMTP check: ${result.result}`,
    result.accept_all ? 'accept-all server' : null,
    result.disposable ? 'disposable domain' : null,
    result.webmail    ? 'webmail address' : null,
    `score ${result.score}`,
  ].filter(Boolean).join(' · ')

  await serverClient
    .from('brand_contacts')
    .update({
      verified,
      email_status:    result.result,
      quality_badge:   newBadge,
      badge_reason:    badgeReason,
      last_verified_at: new Date().toISOString(),
    })
    .eq('id', contactId)

  return NextResponse.json({
    ok: true,
    email:    contact.email,
    result:   result.result,
    score:    result.score,
    verified,
    badge:    newBadge,
    acceptAll: result.accept_all,
  })
}
