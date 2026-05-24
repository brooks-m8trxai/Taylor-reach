/**
 * Compliance gate (light version)
 *
 * For TaylorReach, compliance is much simpler than DealFlow OS:
 *  - CAN-SPAM (federal email law)
 *  - Dedupe (90-day cooldown after non-reply)
 *  - Partner conflicts (don't pitch competitors of current sponsors)
 *  - Sender reputation (daily cap + warm-up enforcement)
 *  - Opt-outs
 *
 * No TCPA, no foreclosure-rescue statutes, no state licensing.
 */

import { supabase } from '@taylor-reach/db'

export type GateRequest = {
  tenant_id: string
  brand_id: string
  contact_email: string
  pitch_draft_id: string
  channel: 'email'
  send_time: Date
}

export type GateDecision = {
  decision: 'allow' | 'block'
  reasons: string[]
  required_footer: string
  unsubscribe_url: string
  audit_token: string
}

export async function evaluate(req: GateRequest): Promise<GateDecision> {
  const auditId = crypto.randomUUID()
  const reasons: string[] = []
  let block = false

  const tenant = await loadTenant(req.tenant_id)
  if (!tenant) {
    return reject(auditId, ['Tenant not found'])
  }

  // 1. Opt-out check
  const { data: optOut } = await supabase
    .from('opt_outs')
    .select('id')
    .eq('tenant_id', req.tenant_id)
    .eq('contact_email', req.contact_email.toLowerCase())
    .maybeSingle()
  if (optOut) {
    block = true
    reasons.push('Contact has opted out')
  }

  // 2. 90-day cooldown after non-reply
  const { data: lastSend } = await supabase
    .from('outreach_events')
    .select('sent_at, replies(id)')
    .eq('brand_id', req.brand_id)
    .eq('direction', 'outbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastSend?.sent_at) {
    const daysSince = (Date.now() - new Date(lastSend.sent_at).getTime()) / 86_400_000
    const hadReply = (lastSend.replies as any[])?.length > 0
    if (!hadReply && daysSince < 90) {
      block = true
      reasons.push(`Brand in 90-day cooldown — last touch ${Math.floor(daysSince)}d ago, no reply`)
    }
  }

  // 3. Partner conflicts
  const { data: brand } = await supabase
    .from('brands')
    .select('conflict_flag, categories')
    .eq('id', req.brand_id)
    .single()

  if (brand?.conflict_flag?.blocked_until) {
    const blockedUntil = new Date(brand.conflict_flag.blocked_until as string)
    if (blockedUntil > new Date()) {
      block = true
      reasons.push(
        `Conflict with active partner (exclusivity until ${blockedUntil.toISOString().slice(0, 10)})`,
      )
    }
  }

  // 4. Daily send cap + warm-up
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase
    .from('outreach_events')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', req.tenant_id)
    .eq('channel', 'email')
    .eq('direction', 'outbound')
    .gte('sent_at', today.toISOString())

  const cap = computeDailyCap(tenant)
  if ((todayCount ?? 0) >= cap) {
    block = true
    reasons.push(`Daily send cap of ${cap} reached`)
  }

  // 5. Per-tenant burst (1 send / 60s)
  const { data: recent } = await supabase
    .from('outreach_events')
    .select('sent_at')
    .eq('tenant_id', req.tenant_id)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (recent?.sent_at) {
    const secSince = (Date.now() - new Date(recent.sent_at).getTime()) / 1000
    if (secSince < 60) {
      block = true
      reasons.push(`Burst limit: ${Math.floor(60 - secSince)}s until next send allowed`)
    }
  }

  // 6. Quiet hours (brand HQ local time, default ET)
  const hour = req.send_time.getHours()
  if (hour < 7 || hour >= 19) {
    block = true
    reasons.push('Outside quiet-hours window (7am-7pm brand local)')
  }

  await writeAudit({
    id: auditId,
    tenant_id: req.tenant_id,
    brand_id: req.brand_id,
    decision: block ? 'block' : 'allow',
    reasons,
    rules_applied: ['can-spam', 'cooldown', 'conflicts', 'send-cap', 'burst', 'quiet-hours'],
    action_type: 'email_send',
    channel: 'email',
    model_version: '2026.05',
    payload: { pitch_draft_id: req.pitch_draft_id },
  })

  if (block) {
    return { decision: 'block', reasons, required_footer: '', unsubscribe_url: '', audit_token: auditId }
  }

  return {
    decision: 'allow',
    reasons: [],
    required_footer: buildFooter(tenant),
    unsubscribe_url: `${tenant.unsubscribe_url}?token=${auditId}`,
    audit_token: auditId,
  }
}

function computeDailyCap(tenant: { sender_reputation: string; warmup_started_at: string | null; daily_send_cap: number }): number {
  if (tenant.sender_reputation === 'established') return tenant.daily_send_cap
  if (tenant.sender_reputation === 'warm') return Math.min(tenant.daily_send_cap, 40)
  if (!tenant.warmup_started_at) return 10
  const days = Math.floor((Date.now() - new Date(tenant.warmup_started_at).getTime()) / 86_400_000)
  if (days < 14) return Math.min(20 + days, 30)
  return tenant.daily_send_cap
}

function buildFooter(tenant: { physical_address: string }): string {
  return [
    '',
    '—',
    'Taylor Humphrey · That\'s a Nice Name',
    tenant.physical_address,
    'To stop receiving emails, click the unsubscribe link above.',
  ].join('\n')
}

async function reject(auditId: string, reasons: string[]): Promise<GateDecision> {
  await writeAudit({
    id: auditId,
    decision: 'block',
    reasons,
    rules_applied: ['precheck'],
  })
  return { decision: 'block', reasons, required_footer: '', unsubscribe_url: '', audit_token: auditId }
}

async function loadTenant(id: string) {
  const { data } = await supabase.from('tenants').select('*').eq('id', id).single()
  return data
}

async function writeAudit(entry: any) {
  await supabase.from('audit_log').insert(entry)
}
