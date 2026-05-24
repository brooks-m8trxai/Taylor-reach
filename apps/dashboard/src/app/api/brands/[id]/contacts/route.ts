/**
 * POST /api/brands/[id]/contacts
 *
 * Manually add a contact to a brand. Taylor uses this when she knows the right
 * person from press hits, LinkedIn, or networking.
 */

import { NextResponse } from 'next/server'
import { serverClient } from '@taylor-reach/db'

type QualityBadge = 'named' | 'editorial' | 'founder' | 'role_based' | 'generic' | 'unverified'

function computeBadge(
  email: string,
  name: string | null,
  title: string | null,
  brandKind: string,
  sizeBand: string | null,
): { badge: QualityBadge; reason: string } {
  const prefix = (email.split('@')[0] ?? '').toLowerCase()
  const titleLower = (title ?? '').toLowerCase()

  if (name && /^[a-z]+\.[a-z]+$/.test(prefix)
    && (titleLower.includes('partner') || titleLower.includes('influencer')
      || titleLower.includes('marketing') || titleLower.includes('creator'))) {
    return { badge: 'named', reason: `named contact (${prefix}) with relevant title` }
  }
  if (brandKind === 'publisher' && ['pitches', 'editorial', 'tips', 'story', 'press'].includes(prefix)) {
    return { badge: 'editorial', reason: `editorial inbox at publisher: ${prefix}@` }
  }
  if (['startup', 'small'].includes(sizeBand ?? '')
    && (titleLower.includes('founder') || titleLower.includes('ceo'))) {
    return { badge: 'founder', reason: `founder contact at early-stage brand` }
  }
  const ROLE = ['partnerships', 'marketing', 'creators', 'influencer', 'collab', 'pr', 'media', 'sponsorship']
  if (ROLE.some(p => prefix.includes(p))) return { badge: 'role_based', reason: `role-based inbox: ${prefix}@` }
  const GENERIC = ['info', 'hello', 'contact', 'support', 'hi', 'team', 'help']
  if (GENERIC.some(p => prefix === p)) return { badge: 'generic', reason: `generic inbox: ${prefix}@` }
  return { badge: 'unverified', reason: `manually added, not classified` }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const brandId = params.id
  const body = await req.json()
  const { name, title, email, source = 'manual', notes } = body

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  // Get brand meta for quality badge computation
  const { data: brand } = await serverClient
    .from('brands')
    .select('brand_kind, size_band')
    .eq('id', brandId)
    .single()

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const { badge, reason } = computeBadge(
    email.toLowerCase(), name ?? null, title ?? null,
    (brand as any).brand_kind ?? 'brand',
    (brand as any).size_band ?? null,
  )

  const { data, error } = await serverClient
    .from('brand_contacts')
    .insert({
      brand_id: brandId,
      name: name ?? null,
      title: title ?? null,
      email: email.toLowerCase().trim(),
      source,
      verified: false,
      quality_badge: badge,
      badge_reason: reason,
      role_priority: badge === 'named' ? 1
        : badge === 'founder' ? 1
        : badge === 'role_based' ? 2
        : badge === 'generic' ? 5
        : 3,
    })
    .select()
    .single()

  if (error) {
    console.error('[contacts/manual] Insert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, contact: data })
}
