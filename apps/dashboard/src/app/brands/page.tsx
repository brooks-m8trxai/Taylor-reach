import { serverClient } from '@taylor-reach/db'
import { getTenantId } from '@/lib/tenant'
import { BrandsClient } from './brands-client'

export const dynamic = 'force-dynamic'

export default async function BrandsPage() {
  const tenantId = await getTenantId()

  const { data: brands } = !tenantId ? { data: [] } : await serverClient
    .from('brands')
    .select('id, brand_name, domain, categories, fit_score, status, last_contacted_at, last_signal_at, budget_signal_score, brand_kind, size_band')
    .eq('tenant_id', tenantId)
    .order('fit_score', { ascending: false })
    .limit(500)

  return <BrandsClient brands={(brands ?? []) as any} />
}
