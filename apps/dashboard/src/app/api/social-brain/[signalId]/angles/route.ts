/**
 * POST /api/social-brain/[signalId]/angles
 *
 * Generates Instagram content angles for a given content radar signal.
 * Uses Claude Sonnet via generateContentAngles().
 *
 * Returns: { ok, recap, angles[] }
 */

import { NextResponse } from 'next/server'
import { serverClient } from '@taylor-reach/db'
import { generateContentAngles } from '@taylor-reach/pitch'
import { getTenantId } from '@/lib/tenant'

export const maxDuration = 60

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ signalId: string }> },
) {
  const { signalId } = await params
  const tenantId = await getTenantId()
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant.' }, { status: 400 })
  }

  // Fetch the signal from DB
  const { data: signal, error } = await serverClient
    .from('signals')
    .select('id, headline, raw_excerpt, source, source_url, tenant_id')
    .eq('id', signalId)
    .eq('tenant_id', tenantId)
    .eq('funnel', 'content_radar')
    .single()

  if (error || !signal) {
    return NextResponse.json(
      { error: 'Signal not found or not a content radar signal.' },
      { status: 404 },
    )
  }

  const result = await generateContentAngles({
    headline: signal.headline,
    excerpt: signal.raw_excerpt ?? '',
    url: signal.source_url ?? '',
    source: signal.source,
  })

  return NextResponse.json({ ok: true, ...result })
}
