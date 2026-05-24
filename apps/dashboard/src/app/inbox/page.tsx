import { serverClient } from '@taylor-reach/db'
import { getTenantId } from '@/lib/tenant'
import { InboxClient } from './inbox-client'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const tenantId = await getTenantId()

  if (!tenantId) {
    return <div className="text-sm text-zinc-500">No tenant configured. Run the seed migration.</div>
  }

  const { data: replies } = await serverClient
    .from('replies')
    .select(`
      id, intent, intent_confidence, received_at, from_email, raw_content,
      resolved, draft_response,
      brands(id, brand_name),
      outreach_events(subject, body_text, sent_at)
    `)
    .eq('tenant_id', tenantId)
    .eq('resolved', false)
    .order('received_at', { ascending: false })
    .limit(100)

  return <InboxClient replies={(replies ?? []) as any} />
}
