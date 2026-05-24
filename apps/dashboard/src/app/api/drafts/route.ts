import { serverClient } from '@taylor-reach/db'
import { NextResponse } from 'next/server'
import { getTenantId } from '@/lib/tenant'

export async function GET() {
  const tenantId = await getTenantId()
  if (!tenantId) return NextResponse.json([])

  const { data, error } = await serverClient
    .from('pitch_drafts')
    .select(`
      id, deal_type, angle_used, alternate_angles,
      subject, body_text, draft_quality_score, reasoning,
      brands(id, brand_name, fit_score),
      signals(headline)
    `)
    .eq('tenant_id', tenantId)
    .eq('status', 'awaiting_approval')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const drafts = (data ?? []).map(d => ({
    id: d.id,
    brand_name: (d.brands as any)?.brand_name ?? 'Unknown',
    fit_score: (d.brands as any)?.fit_score ?? 0,
    deal_type: d.deal_type,
    angle_used: d.angle_used,
    signal_summary: (d.signals as any)?.headline ?? '',
    subject: d.subject,
    body_text: d.body_text,
    alternate_angles: (d.alternate_angles as any) ?? [],
    draft_quality_score: d.draft_quality_score ?? 0,
    reasoning: d.reasoning ?? '',
  }))

  return NextResponse.json(drafts)
}
