import { serverClient } from '@taylor-reach/db'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { data: draft, error } = await serverClient
    .from('pitch_drafts')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('status', 'awaiting_approval')
    .select('tenant_id, brand_id, subject, body_text')
    .single()

  if (error || !draft) return NextResponse.json({ error: 'Draft not found or already actioned' }, { status: 404 })

  await Promise.all([
    serverClient.from('outreach_events').insert({
      tenant_id: draft.tenant_id,
      brand_id: draft.brand_id,
      pitch_draft_id: params.id,
      channel: 'email',
      direction: 'outbound',
      subject: draft.subject,
      body_text: draft.body_text,
      status: 'sent',
      sent_at: new Date().toISOString(),
      audit_token: crypto.randomUUID(),
    }),
    serverClient
      .from('brands')
      .update({ status: 'pitched', last_contacted_at: new Date().toISOString() })
      .eq('id', draft.brand_id),
  ])

  return NextResponse.json({ ok: true })
}
