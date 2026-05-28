/**
 * GET /api/admin/apollo-health
 *
 * Quick diagnostic: validates the Apollo API key and returns plan tier +
 * credit balance. Uses 0 credits. Safe to call any time.
 *
 * Returns:
 *   { ok: true, planTier, creditsUsed, creditsRemaining }
 *   { ok: false, message: "APOLLO_API_KEY not set" }
 */

import { NextResponse } from 'next/server'
import { apolloHealthCheck } from '@taylor-reach/integrations'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await apolloHealthCheck('[api/admin/apollo-health]')

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
