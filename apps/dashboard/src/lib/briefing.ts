import { serverClient } from '@taylor-reach/db'
import { getTenantId } from './tenant'

export interface AwaitingReply {
  id: string
  brand_name: string
  hours_ago: number
  intent_label: string
}

export interface Priority {
  id: string
  title: string
  subtitle: string
  href: string
  cta_label: string
  ev_usd: number
}

export interface HighSignalBrand {
  id: string
  brand_name: string
  fit_score: number
  signal_summary: string
}

export interface StalledDeal {
  id: string
  brand_name: string
  stall_reason: string
}

export interface Briefing {
  sent_yesterday: number
  sent_target: number
  replies_yesterday: number
  warm_replies_yesterday: number
  pipeline_value_usd: number
  new_high_signal_count: number
  awaiting_reply: AwaitingReply[]
  priorities: Priority[]
  pitches_awaiting_approval: number
  new_high_signal_brands: HighSignalBrand[]
  stalled: StalledDeal[]
}

const WARM = ['warm_interested', 'warm_send_more', 'request_intro_call']

function relativeHours(ts: string | null): number {
  if (!ts) return 0
  return Math.floor((Date.now() - new Date(ts).getTime()) / 3_600_000)
}

function relativeLabel(ts: string | null): string {
  if (!ts) return 'unknown'
  const h = relativeHours(ts)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

function intentLabel(intent: string | null): string {
  const map: Record<string, string> = {
    warm_interested: 'Interested',
    warm_send_more: 'Wants more info',
    request_intro_call: 'Requested call',
  }
  return map[intent ?? ''] ?? 'Replied'
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ')
}

const empty: Briefing = {
  sent_yesterday: 0,
  sent_target: 10,
  replies_yesterday: 0,
  warm_replies_yesterday: 0,
  pipeline_value_usd: 0,
  new_high_signal_count: 0,
  awaiting_reply: [],
  priorities: [],
  pitches_awaiting_approval: 0,
  new_high_signal_brands: [],
  stalled: [],
}

export async function getBriefing(): Promise<Briefing> {
  const tenantId = await getTenantId()
  if (!tenantId) return empty

  const now = new Date()
  const yStart = new Date(now)
  yStart.setDate(yStart.getDate() - 1)
  yStart.setHours(0, 0, 0, 0)
  const yEnd = new Date(yStart)
  yEnd.setHours(23, 59, 59, 999)
  const ago48h = new Date(Date.now() - 48 * 3_600_000).toISOString()
  const ago7d = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString()

  const [
    { count: sentYesterday },
    { data: repliesYday },
    { data: deals },
    { data: hsBrands },
    { data: awaiting },
    { count: pitchCount },
    { data: stalled },
    { data: tasks },
  ] = await Promise.all([
    serverClient
      .from('outreach_events')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('direction', 'outbound')
      .gte('sent_at', yStart.toISOString())
      .lte('sent_at', yEnd.toISOString()),
    serverClient
      .from('replies')
      .select('intent')
      .eq('tenant_id', tenantId)
      .gte('received_at', yStart.toISOString())
      .lte('received_at', yEnd.toISOString()),
    serverClient
      .from('deals')
      .select('estimated_value_usd')
      .eq('tenant_id', tenantId)
      .in('status', ['discussion', 'negotiation', 'agreed', 'live']),
    serverClient
      .from('brands')
      .select('id, brand_name, fit_score, last_signal_at')
      .eq('tenant_id', tenantId)
      .gte('fit_score', 75)
      .gte('last_signal_at', ago48h)
      .order('fit_score', { ascending: false })
      .limit(5),
    serverClient
      .from('replies')
      .select('id, brand_id, intent, received_at, brands(brand_name)')
      .eq('tenant_id', tenantId)
      .eq('resolved', false)
      .in('intent', WARM)
      .order('received_at', { ascending: false })
      .limit(10),
    serverClient
      .from('pitch_drafts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'awaiting_approval'),
    serverClient
      .from('brands')
      .select('id, brand_name, status, last_contacted_at')
      .eq('tenant_id', tenantId)
      .in('status', ['pitched', 'replied_warm', 'call_booked', 'negotiating'])
      .lt('last_contacted_at', ago7d)
      .limit(5),
    serverClient
      .from('tasks')
      .select('id, title, description, recommended_action, estimated_value_usd')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .limit(3),
  ])

  const warm = (repliesYday ?? []).filter(r => WARM.includes(r.intent ?? ''))

  return {
    sent_yesterday: sentYesterday ?? 0,
    sent_target: 10,
    replies_yesterday: repliesYday?.length ?? 0,
    warm_replies_yesterday: warm.length,
    pipeline_value_usd: (deals ?? []).reduce((s, d) => s + (d.estimated_value_usd ?? 0), 0),
    new_high_signal_count: hsBrands?.length ?? 0,
    awaiting_reply: (awaiting ?? []).map(r => ({
      id: r.id,
      brand_name: (r.brands as any)?.brand_name ?? 'Unknown',
      hours_ago: relativeHours(r.received_at),
      intent_label: intentLabel(r.intent),
    })),
    priorities: (tasks ?? []).map(t => ({
      id: t.id,
      title: t.title,
      subtitle: t.description ?? t.recommended_action ?? '',
      href: '/queue',
      cta_label: 'Review',
      ev_usd: t.estimated_value_usd ?? 0,
    })),
    pitches_awaiting_approval: pitchCount ?? 0,
    new_high_signal_brands: (hsBrands ?? []).map(b => ({
      id: b.id,
      brand_name: b.brand_name,
      fit_score: b.fit_score ?? 0,
      signal_summary: `Last signal ${relativeLabel(b.last_signal_at)}`,
    })),
    stalled: (stalled ?? []).map(s => ({
      id: s.id,
      brand_name: s.brand_name,
      stall_reason: `${statusLabel(s.status)} — ${relativeLabel(s.last_contacted_at)} since last touch`,
    })),
  }
}
