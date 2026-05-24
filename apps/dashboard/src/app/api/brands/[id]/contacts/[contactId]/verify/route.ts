/**
 * POST /api/brands/[id]/contacts/[contactId]/verify
 *
 * Runs Hunter.io SMTP verification on a single contact email.
 * If HUNTER_API_KEY is not set, returns { skipped: true } — no error.
 */

import { NextResponse } from 'next/server'
import { serverClient } from '@taylor-reach/db'
import { hunterVerify } from '@taylor-reach/integrations'

export async function POST(
  _req: Request,
  { params }: { params: { id: string; contactId: string } },
) {
  const { contactId } = params

  const { data: contact } = await serverClient
    .from('brand_contacts')
    .select('id, email')
    .eq('id', contactId)
    .single()

  if (!contact || !contact.email) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // No Hunter key — surface that clearly but don't error
  if (!process.env.HUNTER_API_KEY) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      message: 'HUNTER_API_KEY not set — add it to .env to enable verification',
    })
  }

  const result = await hunterVerify(contact.email)
  if (!result) {
    return NextResponse.json({ ok: false, error: 'Hunter API call failed' }, { status: 500 })
  }

  // Update the contact record
  const verified = result.result === 'deliverable'
  await serverClient
    .from('brand_contacts')
    .update({
      verified,
      last_verified_at: new Date().toISOString(),
      badge_reason: `${verified ? 'Verified' : 'Undeliverable'} via Hunter (score ${result.score})`,
    })
    .eq('id', contactId)

  return NextResponse.json({
    ok: true,
    email: contact.email,
    result: result.result,
    score: result.score,
    verified,
  })
}
