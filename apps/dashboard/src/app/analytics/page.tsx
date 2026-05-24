import { serverClient } from '@taylor-reach/db'
import { getTenantId } from '@/lib/tenant'
import { AnalyticsClient } from './analytics-client'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const tenantId = await getTenantId()

  if (!tenantId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-medium">Analytics</h1>
        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-500">
          No tenant configured. Run the seed migration.
        </div>
      </div>
    )
  }

  const ago30d = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString()

  const [
    { data: sends },
    { data: replies },
    { data: brandsByStatus },
    { data: deals },
  ] = await Promise.all([
    serverClient
      .from('outreach_events')
      .select('sent_at')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .gte('sent_at', ago30d)
      .order('sent_at'),
    serverClient
      .from('replies')
      .select('intent, received_at')
      .eq('tenant_id', tenantId)
      .gte('received_at', ago30d),
    serverClient
      .from('brands')
      .select('status')
      .eq('tenant_id', tenantId),
    serverClient
      .from('deals')
      .select('estimated_value_usd, actual_value_usd, status, deal_type')
      .eq('tenant_id', tenantId),
  ])

  // Group sends by day
  const sendsByDay: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000)
    sendsByDay[d.toISOString().slice(0, 10)] = 0
  }
  for (const s of sends ?? []) {
    const day = (s.sent_at as string).slice(0, 10)
    if (day in sendsByDay) sendsByDay[day]++
  }
  const sendsChart = Object.entries(sendsByDay).map(([date, count]) => ({ date: date.slice(5), count }))

  // Group replies by intent
  const replyByIntent: Record<string, number> = {}
  for (const r of replies ?? []) {
    const k = r.intent ?? 'unknown'
    replyByIntent[k] = (replyByIntent[k] ?? 0) + 1
  }
  const replyChart = Object.entries(replyByIntent).map(([intent, count]) => ({
    intent: intent.replace(/_/g, ' '),
    count,
  }))

  // Pipeline funnel
  const statusCounts: Record<string, number> = {}
  for (const b of brandsByStatus ?? []) {
    statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1
  }

  const totalSends = sends?.length ?? 0
  const totalReplies = replies?.length ?? 0
  const replyRate = totalSends > 0 ? (totalReplies / totalSends) * 100 : 0
  const warmReplies = (replies ?? []).filter(r =>
    ['warm_interested', 'warm_send_more', 'request_intro_call'].includes(r.intent ?? '')
  ).length
  const pipelineValue = (deals ?? [])
    .filter(d => ['discussion', 'negotiation', 'agreed', 'live'].includes(d.status))
    .reduce((s, d) => s + (d.estimated_value_usd ?? 0), 0)

  return (
    <AnalyticsClient
      sendsChart={sendsChart}
      replyChart={replyChart}
      statusCounts={statusCounts}
      stats={{ totalSends, totalReplies, replyRate, warmReplies, pipelineValue }}
    />
  )
}
