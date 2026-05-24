import { serverClient } from '@taylor-reach/db'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await serverClient
    .from('pitch_drafts')
    .update({ status: 'rejected' })
    .eq('id', params.id)
    .eq('status', 'awaiting_approval')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
