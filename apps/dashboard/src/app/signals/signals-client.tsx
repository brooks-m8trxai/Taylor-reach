'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ExternalLink, Flag, RefreshCw, CheckCircle2 } from 'lucide-react'

// ─── Channel (funnel) tabs ────────────────────────────────────────────────────
// Top-level split: which acquisition channel the signal belongs to.

const FUNNEL_TABS: { value: string; label: string; color: string }[] = [
  { value: 'all',               label: 'All signals',       color: 'border-zinc-600 bg-zinc-800 text-zinc-200' },
  { value: 'brand_deal',        label: 'Brand deals',        color: 'border-blue-500 bg-blue-950 text-blue-300' },
  { value: 'media_opportunity', label: 'Media opps',         color: 'border-rose-500 bg-rose-950 text-rose-300' },
]

const FUNNEL_COLOR: Record<string, string> = {
  brand_deal:        'bg-blue-950 text-blue-400',
  media_opportunity: 'bg-rose-950 text-rose-400',
  content_radar:     'bg-violet-950 text-violet-400',
}

// ─── Signal type filter ───────────────────────────────────────────────────────

const TYPE_OPTS = [
  'all', 'product_launch', 'campaign_launch', 'funding_round',
  'creator_partnership', 'celebrity_moment', 'editorial_mention', 'hiring_signal',
]

const TYPE_LABEL: Record<string, string> = {
  product_launch: 'Launch',
  campaign_launch: 'Campaign',
  funding_round: 'Funding',
  creator_partnership: 'Creator deal',
  celebrity_moment: 'Celebrity',
  editorial_mention: 'Editorial',
  hiring_signal: 'Hiring',
  podcast_episode: 'Podcast',
  seasonal_window: 'Seasonal',
  taylor_press_hit: 'Taylor press',
  monetizable_brand_deal: 'Brand deal',
  content_idea: 'Content idea',
}

const TYPE_COLOR: Record<string, string> = {
  product_launch: 'bg-blue-950 text-blue-300',
  campaign_launch: 'bg-indigo-950 text-indigo-300',
  funding_round: 'bg-green-950 text-green-300',
  creator_partnership: 'bg-teal-950 text-teal-300',
  celebrity_moment: 'bg-amber-950 text-amber-300',
  editorial_mention: 'bg-zinc-800 text-zinc-300',
  hiring_signal: 'bg-purple-950 text-purple-300',
}

function relTime(ts: string | null) {
  if (!ts) return '—'
  const h = Math.floor((Date.now() - new Date(ts).getTime()) / 3_600_000)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

type Signal = {
  id: string
  signal_type: string
  funnel: string | null
  brand_name: string
  brand_domain: string | null
  headline: string
  source: string
  source_url: string | null
  niche_fit_score: number | null
  needs_review: boolean
  detected_at: string
  source_published_at: string | null
  brand_id: string | null
  brands: { brand_name: string; status: string; fit_score: number | null } | null
}

type ScanResult = {
  ok: boolean
  new_signals?: number
  brands_created?: number
  drafts_created?: number
  elapsed_seconds?: number
  error?: string
}

export function SignalsClient({ signals }: { signals: Signal[] }) {
  const [funnelFilter, setFunnelFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  const filtered = useMemo(() => signals.filter(s => {
    if (funnelFilter !== 'all' && s.funnel !== funnelFilter) return false
    if (typeFilter !== 'all' && s.signal_type !== typeFilter) return false
    if (reviewOnly && !s.needs_review) return false
    return true
  }), [signals, funnelFilter, typeFilter, reviewOnly])

  // Counts per funnel for tab badges
  const funnelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: signals.length, brand_deal: 0, media_opportunity: 0 }
    for (const s of signals) {
      if (s.funnel) counts[s.funnel] = (counts[s.funnel] ?? 0) + 1
    }
    return counts
  }, [signals])

  async function flag(id: string) {
    setFlagged(prev => new Set([...prev, id]))
    await fetch(`/api/signals/${id}/flag`, { method: 'POST' })
  }

  async function runScan() {
    setScanning(true)
    setScanResult(null)
    try {
      const resp = await fetch('/api/scan', { method: 'POST' })
      const data = await resp.json() as ScanResult
      setScanResult(data)
      // Reload page after 2s to show new signals
      if (data.ok) setTimeout(() => window.location.reload(), 2000)
    } catch {
      setScanResult({ ok: false, error: 'Request failed' })
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-medium">Signal feed</h1>
          <p className="mt-1 text-sm text-zinc-400">{signals.length} signals · {filtered.length} shown</p>
        </div>
        <div className="flex items-center gap-3">
          {scanResult && (
            <div className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs ${
              scanResult.ok
                ? 'border-green-800 bg-green-950/30 text-green-400'
                : 'border-red-800 bg-red-950/30 text-red-400'
            }`}>
              {scanResult.ok
                ? <><CheckCircle2 className="h-3.5 w-3.5" />
                    {scanResult.new_signals ?? 0} new · {scanResult.brands_created ?? 0} brands · {scanResult.drafts_created ?? 0} drafts</>
                : scanResult.error?.slice(0, 60)
              }
            </div>
          )}
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning…' : 'Run scanner'}
          </button>
        </div>
      </div>

      {scanning && (
        <div className="rounded-md border border-blue-800 bg-blue-950/20 px-4 py-3 text-sm text-blue-400">
          Scanning RSS feeds and enriching brands. This takes 60-120 seconds…
        </div>
      )}


      {/* ── Channel (funnel) tabs ─────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
        {FUNNEL_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFunnelFilter(tab.value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              funnelFilter === tab.value
                ? tab.color
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            <span className={`rounded px-1 text-[10px] ${
              funnelFilter === tab.value ? 'bg-black/30' : 'bg-zinc-800 text-zinc-500'
            }`}>
              {funnelCounts[tab.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── Signal type filter chips ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {TYPE_OPTS.map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              typeFilter === t ? 'border-blue-500 bg-blue-950 text-blue-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            {t === 'all' ? 'All types' : TYPE_LABEL[t] ?? t}
          </button>
        ))}
        <button
          onClick={() => setReviewOnly(!reviewOnly)}
          className={`rounded-md border px-3 py-1.5 text-xs transition ${
            reviewOnly ? 'border-amber-500 bg-amber-950 text-amber-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
          }`}
        >
          Needs review
        </button>
      </div>

      <div className="space-y-2">
        {filtered.map(s => (
          <div key={s.id} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {s.funnel && (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${FUNNEL_COLOR[s.funnel] ?? 'bg-zinc-800 text-zinc-500'}`}>
                      {s.funnel === 'brand_deal' ? 'Brand deal' : s.funnel === 'media_opportunity' ? 'Media opp' : s.funnel}
                    </span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-xs ${TYPE_COLOR[s.signal_type] ?? 'bg-zinc-800 text-zinc-400'}`}>
                    {TYPE_LABEL[s.signal_type] ?? s.signal_type}
                  </span>
                  {s.needs_review && (
                    <span className="rounded bg-amber-950 px-1.5 py-0.5 text-xs text-amber-400">Needs review</span>
                  )}
                  <span className="text-xs text-zinc-500">{relTime(s.detected_at)}</span>
                  <span className="text-xs text-zinc-600">{s.source}</span>
                </div>
                <p className="mt-1.5 text-sm">{s.headline}</p>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-xs font-medium text-zinc-300">{s.brand_name}</span>
                  {s.brand_domain && <span className="text-xs text-zinc-500">{s.brand_domain}</span>}
                  {s.niche_fit_score != null && (
                    <span className="text-xs text-zinc-500">niche fit {s.niche_fit_score}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {s.brand_id && (
                  <Link href={`/brands/${s.brand_id}`} className="text-xs text-zinc-500 hover:text-zinc-300">
                    View brand
                  </Link>
                )}
                {s.source_url && (
                  <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-400">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <button
                  onClick={() => flag(s.id)}
                  className={`rounded p-1 transition ${flagged.has(s.id) ? 'text-amber-400' : 'text-zinc-700 hover:text-zinc-400'}`}
                  title="Flag as opportunity"
                >
                  <Flag className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">
            No signals yet. Run the scanner from the briefing page.
          </div>
        )}
      </div>
    </div>
  )
}
