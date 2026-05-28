'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Zap, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'

const STATUS_OPTS = ['all', 'new', 'enriched', 'queued', 'pitched', 'replied_warm', 'call_booked', 'negotiating', 'deal_won', 'nurture', 'blocked']

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-zinc-800 text-zinc-400',
  scoring: 'bg-zinc-800 text-zinc-400',
  enriched: 'bg-blue-950 text-blue-400',
  queued: 'bg-blue-950 text-blue-300',
  pitched: 'bg-indigo-950 text-indigo-300',
  replied_warm: 'bg-green-950 text-green-300',
  replied_send_more: 'bg-green-950 text-green-400',
  call_booked: 'bg-teal-950 text-teal-300',
  negotiating: 'bg-amber-950 text-amber-300',
  deal_won: 'bg-emerald-950 text-emerald-300',
  deal_live: 'bg-emerald-900 text-emerald-200',
  closed_lost: 'bg-red-950 text-red-400',
  nurture: 'bg-zinc-800 text-zinc-500',
  opted_out: 'bg-red-950 text-red-500',
  blocked: 'bg-red-950 text-red-600',
}

function relTime(ts: string | null) {
  if (!ts) return null
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000)
  return d === 0 ? 'today' : `${d}d ago`
}

type Brand = {
  id: string
  brand_name: string
  domain: string | null
  categories: string[]
  fit_score: number | null
  status: string
  last_contacted_at: string | null
  last_signal_at: string | null
  budget_signal_score: number | null
  brand_kind: string | null
  size_band: string | null
  // Contact summary — added by page.tsx server query
  verified_count: number
  named_count:    number
  has_contacts:   boolean
  top_contact:    { name: string | null; email: string } | null
}

// ─── Category filter tabs ─────────────────────────────────────────────────────

const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'brand',     label: 'Product brands' },
  { value: 'publisher', label: 'Publishers' },
  { value: 'small',     label: 'Small & emerging' },
  { value: 'highfit',   label: 'High fit (75+)' },
]

// ─── Contact status badge ─────────────────────────────────────────────────────
// Priority order: verified > named > generic > none
// Tooltip shows top contact name + email on hover.

function ContactBadge({
  verified_count,
  named_count,
  has_contacts,
  top_contact,
}: {
  verified_count: number
  named_count:    number
  has_contacts:   boolean
  top_contact:    { name: string | null; email: string } | null
}) {
  let label: string
  let cls: string
  let tooltipText: string | null = null

  if (verified_count > 0) {
    label = `✓ ${verified_count} verified`
    cls = 'border-green-800 bg-green-950 text-green-400'
    if (top_contact) {
      tooltipText = top_contact.name
        ? `${top_contact.name} · ${top_contact.email}`
        : top_contact.email
    } else {
      tooltipText = `${verified_count} verified contact${verified_count !== 1 ? 's' : ''}`
    }
  } else if (named_count > 0) {
    label = `● ${named_count} named`
    cls = 'border-blue-900 bg-blue-950 text-blue-400'
    if (top_contact) {
      tooltipText = top_contact.name
        ? `${top_contact.name} · ${top_contact.email}`
        : top_contact.email
    } else {
      tooltipText = `${named_count} named contact${named_count !== 1 ? 's' : ''}`
    }
  } else if (has_contacts) {
    label = '○ generic only'
    cls = 'border-zinc-700 bg-zinc-900 text-zinc-500'
    tooltipText = 'Only generic emails found (info@, hello@, etc.)'
  } else {
    label = '—'
    cls = 'border-transparent text-zinc-700'
    tooltipText = null
  }

  return (
    <span className="group/badge relative">
      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${cls}`}>
        {label}
      </span>
      {tooltipText && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover/badge:opacity-100">
          {tooltipText}
          {/* Downward arrow */}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-800" />
        </span>
      )}
    </span>
  )
}

// ─── Per-card pitch state ─────────────────────────────────────────────────────

type PitchState = 'idle' | 'loading' | 'done' | 'error'

function PitchButton({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [state, setState] = useState<PitchState>('idle')
  const [msg, setMsg] = useState('')

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()   // prevent Link navigation
    e.stopPropagation()
    if (state === 'loading') return
    setState('loading')
    try {
      const resp = await fetch(`/api/brands/${brandId}/generate-pitch`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.ok) {
        setMsg(data.error ?? 'Generation failed')
        setState('error')
      } else {
        setMsg(`Draft ready: "${data.subject}"`)
        setState('done')
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Request failed')
      setState('error')
    }
    // Reset to idle after 5 seconds so the button is usable again
    setTimeout(() => { setState('idle'); setMsg('') }, 5000)
  }

  if (state === 'done') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        <Link href="/queue" className="underline hover:text-green-300">See in queue</Link>
      </span>
    )
  }

  if (state === 'error') {
    return (
      <span className="flex items-center gap-1 text-xs text-red-400" title={msg}>
        <AlertCircle className="h-3 w-3" /> Failed
      </span>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-blue-600 hover:text-blue-400 disabled:opacity-50"
      title={`Generate pitch for ${brandName}`}
    >
      {state === 'loading'
        ? <><Loader2 className="h-3 w-3 animate-spin" /> Pitching…</>
        : <><Zap className="h-3 w-3" /> Pitch</>
      }
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type ReEnrichState = 'idle' | 'running' | 'done' | 'error'

export function BrandsClient({ brands }: { brands: Brand[] }) {
  const [category, setCategory]         = useState('all')
  const [q, setQ]                       = useState('')
  const [status, setStatus]             = useState('all')
  const [minFit, setMinFit]             = useState(0)
  const [onlyVerified, setOnlyVerified] = useState(false)
  const [reEnrichState, setReEnrichState] = useState<ReEnrichState>('idle')
  const [reEnrichMsg, setReEnrichMsg]     = useState('')

  async function runReEnrich() {
    if (reEnrichState === 'running') return
    setReEnrichState('running')
    setReEnrichMsg('')
    try {
      const resp = await fetch('/api/admin/re-enrich-all', { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.ok) {
        setReEnrichState('error')
        setReEnrichMsg(data.error ?? 'Failed')
      } else {
        const total = data.report?.length ?? 0
        const newContacts = data.report?.reduce((sum: number, r: any) => sum + (r.new_contacts ?? 0), 0) ?? 0
        setReEnrichState('done')
        setReEnrichMsg(`${total} brands enriched · ${newContacts} new contacts · ${data.elapsed_seconds}s`)
        // Reload after 3s so contact counts refresh
        setTimeout(() => window.location.reload(), 3000)
      }
    } catch {
      setReEnrichState('error')
      setReEnrichMsg('Request failed')
    }
  }

  const filtered = useMemo(() => {
    const base = brands.filter(b => {
      // Category tab filter
      if (category === 'brand'     && b.brand_kind === 'publisher') return false
      if (category === 'publisher' && b.brand_kind !== 'publisher') return false
      if (category === 'small'     && !['startup', 'small'].includes(b.size_band ?? '')) return false
      if (category === 'highfit'   && (b.fit_score ?? 0) < 75) return false
      // Verified-only toggle — Taylor's "ready to pitch right now" view
      if (onlyVerified && b.verified_count === 0) return false
      // Search
      if (q && !b.brand_name.toLowerCase().includes(q.toLowerCase()) && !b.domain?.includes(q.toLowerCase())) return false
      // Status filter
      if (status !== 'all' && b.status !== status) return false
      // Fit score filter
      if (minFit > 0 && (b.fit_score ?? 0) < minFit) return false
      return true
    })

    // High-fit tab: secondary sort by verified_count DESC so ready-to-pitch
    // brands surface above equally-scored but un-enriched brands.
    if (category === 'highfit') {
      return [...base].sort((a, b) => {
        const fitDiff = (b.fit_score ?? 0) - (a.fit_score ?? 0)
        if (fitDiff !== 0) return fitDiff
        return b.verified_count - a.verified_count
      })
    }

    return base
  }, [brands, category, q, status, minFit, onlyVerified])

  // Counts for category tabs
  const categoryCounts = useMemo(() => ({
    all:       brands.length,
    brand:     brands.filter(b => b.brand_kind !== 'publisher').length,
    publisher: brands.filter(b => b.brand_kind === 'publisher').length,
    small:     brands.filter(b => ['startup', 'small'].includes(b.size_band ?? '')).length,
    highfit:   brands.filter(b => (b.fit_score ?? 0) >= 75).length,
  }), [brands])

  // Count of brands with verified contacts — shown next to the toggle
  const verifiedCount = useMemo(
    () => brands.filter(b => b.verified_count > 0).length,
    [brands],
  )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-medium">Brand library</h1>
          <p className="mt-1 text-sm text-zinc-400">{brands.length} brands · {filtered.length} shown</p>
        </div>
        <div className="flex items-center gap-3">
          {reEnrichState === 'done' && (
            <span className="text-xs text-green-400">{reEnrichMsg}</span>
          )}
          {reEnrichState === 'error' && (
            <span className="text-xs text-red-400">{reEnrichMsg}</span>
          )}
          {reEnrichState === 'running' && (
            <span className="text-xs text-zinc-500">Enriching brands — this takes ~2 min…</span>
          )}
          <button
            onClick={runReEnrich}
            disabled={reEnrichState === 'running'}
            className="flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
            title="Scrape all brands for contacts and refresh enrichment data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reEnrichState === 'running' ? 'animate-spin' : ''}`} />
            {reEnrichState === 'running' ? 'Re-enriching…' : 'Re-enrich all'}
          </button>
        </div>
      </div>

      {/* ── Category tabs ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setCategory(tab.value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              category === tab.value
                ? 'border border-zinc-600 bg-zinc-800 text-zinc-200'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            <span className={`rounded px-1 text-[10px] ${
              category === tab.value ? 'bg-black/30 text-zinc-300' : 'bg-zinc-800 text-zinc-600'
            }`}>
              {categoryCounts[tab.value as keyof typeof categoryCounts] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── Search + status + fit + verified-only filters ─────────────────── */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={e => setQ(e.currentTarget.value)}
            placeholder="Search brands…"
            className="rounded-md border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-sm focus:border-zinc-600 focus:outline-none"
          />
        </div>
        <select
          value={status}
          onChange={e => setStatus(e.currentTarget.value)}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none"
        >
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace(/_/g, ' ')}</option>)}
        </select>
        <select
          value={minFit}
          onChange={e => setMinFit(Number(e.currentTarget.value))}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value={0}>Any fit score</option>
          <option value={60}>60+</option>
          <option value={75}>75+ (auto-draft)</option>
          <option value={90}>90+ (priority)</option>
        </select>
        {/* "Ready to pitch" toggle — filters to brands with verified contacts only */}
        <button
          onClick={() => setOnlyVerified(v => !v)}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
            onlyVerified
              ? 'border-green-700 bg-green-950 text-green-400'
              : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
          }`}
          title="Show only brands with a verified, deliverable email on file"
        >
          ✓ Has verified contacts
          <span className={`rounded px-1 text-[10px] ${
            onlyVerified ? 'bg-green-900/60 text-green-300' : 'bg-zinc-800 text-zinc-600'
          }`}>
            {verifiedCount}
          </span>
        </button>
      </div>

      <div className="space-y-2">
        {filtered.map(b => (
          // Wrapper div so the Pitch button doesn't trigger Link navigation
          <div key={b.id} className="group relative">
            <Link
              href={`/brands/${b.id}`}
              className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-700"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{b.brand_name}</span>
                  {b.domain && <span className="text-xs text-zinc-500">{b.domain}</span>}
                </div>
                {b.categories?.length > 0 && (
                  <div className="mt-1 text-xs text-zinc-500">{b.categories.slice(0, 3).join(' · ')}</div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {b.last_contacted_at && (
                  <span className="text-xs text-zinc-600">contacted {relTime(b.last_contacted_at)}</span>
                )}
                {b.fit_score != null && (
                  <span className="w-16 text-right text-xs text-zinc-400">Fit {b.fit_score}</span>
                )}
                {/* Contact status badge — verified > named > generic > none */}
                <ContactBadge
                  verified_count={b.verified_count}
                  named_count={b.named_count}
                  has_contacts={b.has_contacts}
                  top_contact={b.top_contact}
                />
                <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[b.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                  {b.status.replace(/_/g, ' ')}
                </span>
                {/* Spacer so the absolute-positioned pitch button doesn't overlap the badge */}
                <span className="w-20" />
              </div>
            </Link>
            {/* Pitch button sits on top of the right edge, outside the Link */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <PitchButton brandId={b.id} brandName={b.brand_name} />
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">
            {onlyVerified
              ? 'No brands with verified contacts yet. Run the Hunter enrichment batch to add contacts.'
              : 'No brands match your filters. Run the scanner to populate the library.'}
          </div>
        )}
      </div>
    </div>
  )
}
