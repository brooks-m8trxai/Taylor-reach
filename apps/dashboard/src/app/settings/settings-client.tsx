'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

type Tenant = {
  id: string
  name: string
  physical_address: string
  from_address: string
  unsubscribe_url: string
  domain: string
  daily_send_cap: number
  sender_reputation: string
  warmup_started_at: string | null
  cal_links: any
  niche_pillars: string[]
  credibility: any
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${ok ? 'border-green-800 bg-green-950/30 text-green-400' : 'border-zinc-800 bg-zinc-900 text-zinc-500'}`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {label}
    </div>
  )
}

export function SettingsClient({ tenant }: { tenant: Tenant | null }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [address, setAddress] = useState(tenant?.physical_address ?? '')
  const [fromEmail, setFromEmail] = useState(tenant?.from_address ?? '')
  const [unsubUrl, setUnsubUrl] = useState(tenant?.unsubscribe_url ?? '')
  const [dailyCap, setDailyCap] = useState(tenant?.daily_send_cap ?? 20)
  const [calLink, setCalLink] = useState(tenant?.cal_links?.intro_call ?? '')

  async function save() {
    if (!tenant) return
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        physical_address: address,
        from_address: fromEmail,
        unsubscribe_url: unsubUrl,
        daily_send_cap: Number(dailyCap),
        cal_links: { ...tenant.cal_links, intro_call: calLink },
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (!tenant) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-medium">Settings</h1>
        <div className="rounded-md border border-amber-800 bg-amber-950/20 p-6 text-sm text-amber-400">
          No tenant found. Run <code>003_seed_taylor.sql</code> in your Supabase SQL editor, then reload.
        </div>
      </div>
    )
  }

  const addressOk = address.length > 10 && !address.includes('UPDATE BEFORE')
  const gmailOk = false // Phase 3: wire Gmail OAuth
  const spfOk = false   // Phase 3: verify SPF/DKIM/DMARC

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-medium">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">{tenant.name}</p>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">System status</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge ok={addressOk} label="CAN-SPAM address set" />
          <StatusBadge ok={gmailOk} label="Gmail connected" />
          <StatusBadge ok={spfOk} label="SPF / DKIM / DMARC" />
          <StatusBadge ok={tenant.sender_reputation !== 'new'} label={`Reputation: ${tenant.sender_reputation}`} />
        </div>
        {!addressOk && (
          <p className="mt-2 text-xs text-amber-400">
            Set your physical address below before any sends — required by CAN-SPAM.
          </p>
        )}
        {!gmailOk && (
          <p className="mt-1 text-xs text-zinc-500">
            Gmail OAuth and SPF/DKIM/DMARC will be wired in Phase 3. No sends until both are green.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Sending identity</h2>

        <Field label="Physical address (CAN-SPAM required)">
          <textarea
            value={address}
            onChange={e => setAddress(e.currentTarget.value)}
            rows={2}
            className={`w-full rounded-md border bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              !addressOk ? 'border-amber-700 focus:ring-amber-600' : 'border-zinc-700 focus:ring-blue-600'
            }`}
            placeholder="123 Main St, San Francisco, CA 94102"
          />
        </Field>

        <Field label="From address">
          <input
            type="email"
            value={fromEmail}
            onChange={e => setFromEmail(e.currentTarget.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </Field>

        <Field label="Unsubscribe URL">
          <input
            type="url"
            value={unsubUrl}
            onChange={e => setUnsubUrl(e.currentTarget.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Send limits</h2>

        <Field label={`Daily send cap (current: ${dailyCap})`}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={50}
              value={dailyCap}
              onChange={e => setDailyCap(Number(e.currentTarget.value))}
              className="flex-1"
            />
            <span className="w-8 text-right text-sm">{dailyCap}</span>
          </div>
          <p className="text-xs text-zinc-500">
            {tenant.sender_reputation === 'new'
              ? 'New sender: cap is enforced at 20 for the first 14 days regardless of this setting.'
              : 'Cap enforced by the compliance gate on every send.'}
          </p>
        </Field>

        <Field label="Warmup started">
          <p className="text-sm text-zinc-300">
            {tenant.warmup_started_at
              ? new Date(tenant.warmup_started_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : 'Not started — set via API when Gmail is connected'}
          </p>
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Booking</h2>
        <Field label="Cal.com intro call link">
          <input
            type="url"
            value={calLink}
            onChange={e => setCalLink(e.currentTarget.value)}
            placeholder="https://cal.com/taylorhumphrey/intro"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </Field>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Niche pillars</h2>
        <div className="flex flex-wrap gap-2">
          {tenant.niche_pillars.map(p => (
            <span key={p} className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">{p}</span>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-600">Pillars are used by the scanner and fit-scoring engine. Edit in Supabase for now.</p>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Current brand partners</h2>
        {(tenant.credibility?.current_partners?.length ?? 0) === 0 ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
            No active partners. As deals close, add them here to enable conflict detection.
          </div>
        ) : (
          <div className="space-y-2">
            {tenant.credibility.current_partners.map((p: string, i: number) => (
              <div key={i} className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm">{p}</div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save settings
        </button>
        {saved && <span className="text-sm text-green-400">Saved.</span>}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-zinc-400">{label}</label>
      {children}
    </div>
  )
}
