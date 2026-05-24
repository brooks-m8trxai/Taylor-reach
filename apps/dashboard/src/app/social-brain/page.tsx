/**
 * Social Media Brain — server component.
 *
 * Loads the last 80 content radar signals from the DB and passes them to the
 * interactive client component.
 */

import { serverClient } from '@taylor-reach/db'
import { getTenantId } from '@/lib/tenant'
import { SocialBrainClient } from './social-brain-client'

export const dynamic = 'force-dynamic'

export interface ContentSignal {
  id: string
  headline: string
  raw_excerpt: string | null
  source: string
  source_url: string | null
  detected_at: string
  source_published_at: string | null
}

export default async function SocialBrainPage() {
  const tenantId = await getTenantId()

  let signals: ContentSignal[] = []

  if (tenantId) {
    const { data } = await serverClient
      .from('signals')
      .select('id, headline, raw_excerpt, source, source_url, detected_at, source_published_at')
      .eq('tenant_id', tenantId)
      .eq('funnel', 'content_radar')
      .order('detected_at', { ascending: false })
      .limit(80)

    signals = (data ?? []) as ContentSignal[]
  }

  return <SocialBrainClient signals={signals} />
}
