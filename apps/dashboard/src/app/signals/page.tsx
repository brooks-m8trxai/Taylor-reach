import { serverClient } from '@taylor-reach/db'
import { getTenantId } from '@/lib/tenant'
import { SignalsClient } from './signals-client'

export const dynamic = 'force-dynamic'

export default async function SignalsPage() {
  const tenantId = await getTenantId()

  const { data: signals } = !tenantId ? { data: [] } : await serverClient
    .from('signals')
    .select(`
      id, signal_type, funnel, brand_name, brand_domain, headline,
      source, source_url, niche_fit_score, needs_review,
      detected_at, source_published_at,
      brand_id, brands(brand_name, status, fit_score)
    `)
    .eq('tenant_id', tenantId)
    .or('funnel.is.null,funnel.neq.content_radar')   // content radar lives in Social Brain only; include legacy null-funnel signals
    .order('detected_at', { ascending: false })
    .limit(200)

  return <SignalsClient signals={(signals ?? []) as any} />
}
