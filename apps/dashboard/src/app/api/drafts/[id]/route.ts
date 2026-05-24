import { serverClient } from '@taylor-reach/db'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json() as Record<string, unknown>
  const allowed = ['body_text', 'subject', 'angle_used', 'status']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const { error } = await serverClient.from('pitch_drafts').update(update).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
