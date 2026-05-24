import { serverClient } from '@taylor-reach/db'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await serverClient
    .from('signals')
    .update({ needs_review: false, metadata: { manually_flagged: true, flagged_at: new Date().toISOString() } })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
