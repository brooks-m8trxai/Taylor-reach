import { serverClient } from '@taylor-reach/db'
import { NextResponse } from 'next/server'
import { getTenantId } from '@/lib/tenant'

export async function PATCH(req: Request) {
  const tenantId = await getTenantId()
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 404 })

  const body = await req.json() as Record<string, unknown>
  const allowed = ['physical_address', 'from_address', 'unsubscribe_url', 'daily_send_cap', 'cal_links']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const { error } = await serverClient.from('tenants').update(update).eq('id', tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
