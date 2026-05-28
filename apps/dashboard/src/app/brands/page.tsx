import { serverClient } from '@taylor-reach/db'
import { getTenantId } from '@/lib/tenant'
import { BrandsClient } from './brands-client'

export const dynamic = 'force-dynamic'

export default async function BrandsPage() {
  const tenantId = await getTenantId()

  // ── Brands ─────────────────────────────────────────────────────────────────
  const { data: brands } = !tenantId ? { data: [] } : await serverClient
    .from('brands')
    .select('id, brand_name, domain, categories, fit_score, status, last_contacted_at, last_signal_at, budget_signal_score, brand_kind, size_band')
    .eq('tenant_id', tenantId)
    .order('fit_score', { ascending: false })
    .limit(500)

  // ── Contact summary — one query for all brands, merged server-side ─────────
  // We fetch contact rows (not counts) so we can extract the top contact's
  // name + email for the hover tooltip without a second round-trip.
  const brandIds = (brands ?? []).map(b => b.id)

  const { data: contacts } = !tenantId || brandIds.length === 0
    ? { data: [] }
    : await serverClient
        .from('brand_contacts')
        .select('brand_id, email_status, quality_badge, name, email')
        .in('brand_id', brandIds)

  // Build per-brand summary map
  const summaryMap = new Map<string, {
    verified_count: number
    named_count:    number
    has_contacts:   boolean
    best_verified:  { name: string | null; email: string } | null
    best_named:     { name: string | null; email: string } | null
  }>()

  for (const c of (contacts ?? [])) {
    if (!summaryMap.has(c.brand_id)) {
      summaryMap.set(c.brand_id, {
        verified_count: 0, named_count: 0, has_contacts: false,
        best_verified:  null, best_named: null,
      })
    }
    const s = summaryMap.get(c.brand_id)!
    s.has_contacts = true

    if (c.email_status === 'deliverable') {
      s.verified_count++
      // Keep first verified contact as the tooltip subject
      if (!s.best_verified) s.best_verified = { name: c.name ?? null, email: c.email }
    }
    if (c.quality_badge === 'named') {
      s.named_count++
      if (!s.best_named) s.best_named = { name: c.name ?? null, email: c.email }
    }
  }

  // Merge contact summary into each brand row
  const brandsWithContacts = (brands ?? []).map(b => {
    const s = summaryMap.get(b.id)
    return {
      ...b,
      verified_count: s?.verified_count ?? 0,
      named_count:    s?.named_count    ?? 0,
      has_contacts:   s?.has_contacts   ?? false,
      // Prefer verified contact for tooltip; fall back to named; else null
      top_contact:    s ? (s.best_verified ?? s.best_named ?? null) : null,
    }
  })

  return <BrandsClient brands={brandsWithContacts as any} />
}
