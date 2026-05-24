'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Loader2, RefreshCw, Zap, CheckCircle2, AlertCircle, ChevronRight, Database } from 'lucide-react'
import Link from 'next/link'

// ─── Types (mirroring PitchAngle from @taylor-reach/pitch) ───────────────────

type PitchAngle = {
  angle: string
  hook_sentence: string
  subject: string
  score: number
  deal_type: 'sponsorship' | 'podcast_guest'
}

type Angles = {
  angles: PitchAngle[]
  best: PitchAngle
  reasoning: string
  isMediaOpportunity: boolean
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type Toast = { ok: boolean; msg: string; draftId?: string }

function ToastBanner({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg transition-all ${
      toast.ok
        ? 'border-green-700 bg-green-950 text-green-300'
        : 'border-red-800 bg-red-950 text-red-300'
    }`}>
      {toast.ok
        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      }
      <div className="flex-1 text-sm">
        <p>{toast.msg}</p>
        {toast.ok && toast.draftId && (
          <Link
            href="/queue"
            className="mt-1 inline-flex items-center gap-1 text-xs text-green-400 underline hover:text-green-300"
          >
            Open approval queue <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <button onClick={onDismiss} className="text-current opacity-60 hover:opacity-100">✕</button>
    </div>
  )
}

// ─── Angle card ───────────────────────────────────────────────────────────────

function AngleCard({ angle, brandId, onToast }: {
  angle: PitchAngle
  brandId: string
  onToast: (t: Toast) => void
}) {
  const [drafting, setDrafting] = useState(false)

  const ANGLE_COLOR: Record<string, string> = {
    launch:         'bg-blue-950 text-blue-400',
    campaign_echo:  'bg-indigo-950 text-indigo-400',
    competitor:     'bg-amber-950 text-amber-400',
    seasonal:       'bg-emerald-950 text-emerald-400',
    cultural:       'bg-purple-950 text-purple-400',
    earned:         'bg-teal-950 text-teal-400',
    podcast:        'bg-rose-950 text-rose-400',
  }

  async function draftThisAngle() {
    setDrafting(true)
    try {
      const resp = await fetch(`/api/brands/${brandId}/generate-pitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ angle }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.ok) {
        onToast({ ok: false, msg: data.error ?? 'Draft generation failed' })
      } else {
        onToast({
          ok: true,
          msg: `Draft ready: "${data.subject}"`,
          draftId: data.draftId,
        })
      }
    } catch (err) {
      onToast({ ok: false, msg: err instanceof Error ? err.message : 'Request failed' })
    } finally {
      setDrafting(false)
    }
  }

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${ANGLE_COLOR[angle.angle] ?? 'bg-zinc-800 text-zinc-400'}`}>
              {angle.angle.replace(/_/g, ' ')}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-xs ${angle.deal_type === 'podcast_guest' ? 'bg-rose-950 text-rose-400' : 'bg-zinc-800 text-zinc-500'}`}>
              {angle.deal_type === 'podcast_guest' ? 'media opp' : 'sponsorship'}
            </span>
            <span className="text-xs text-zinc-600">score {angle.score}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-200">{angle.hook_sentence}</p>
          <p className="mt-1 text-xs text-zinc-500">Subject: {angle.subject}</p>
        </div>
        <button
          onClick={draftThisAngle}
          disabled={drafting}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
        >
          {drafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {drafting ? 'Drafting…' : 'Draft this angle'}
        </button>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip markdown bold/italic markers so cached text renders cleanly. */
function stripMd(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').trim()
}

/** Detect AI "I don't have enough info" placeholder responses. */
function isPlaceholder(text: string | null): boolean {
  if (!text || text.length < 40) return true
  const lower = text.toLowerCase()
  return (
    lower.includes("don't have sufficient")
    || lower.includes("i don't have")
    || lower.includes('not available')
    || lower.includes('no information available')
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  brandId: string
  cachedAbout: string | null
  cachedOpportunity: string | null
  cachedAnglesJson: unknown | null
  isStale: boolean
  /** True when the brand has no description or enrichment is older than 7 days */
  needsEnrichment: boolean
}

export function BrandIntelligenceClient({
  brandId,
  cachedAbout,
  cachedOpportunity,
  cachedAnglesJson,
  isStale,
  needsEnrichment,
}: Props) {
  const [about, setAbout] = useState(cachedAbout)
  const [opportunity, setOpportunity] = useState(cachedOpportunity)
  const [angles, setAngles] = useState<Angles | null>(
    cachedAnglesJson ? (cachedAnglesJson as Angles) : null,
  )

  // Intelligence loading
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Enrichment loading (shown separately so the label is clearer)
  const [enriching, setEnriching] = useState(false)
  const [enrichError, setEnrichError] = useState<string | null>(null)

  const [toast, setToast] = useState<Toast | null>(null)
  const [generatingPitch, setGeneratingPitch] = useState(false)

  const aboutMissing = isPlaceholder(cachedAbout)
  const needsGeneration = isStale || !cachedAbout || !cachedOpportunity || !cachedAnglesJson

  useEffect(() => {
    // If about is missing AND enrichment is stale → enrich first, then generate intelligence
    if (needsEnrichment && aboutMissing) {
      runEnrichThenIntelligence()
    } else if (needsGeneration) {
      fetchIntelligence()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Enrichment → intelligence pipeline ───────────────────────────────────

  async function runEnrichThenIntelligence() {
    setEnrichError(null)
    setEnriching(true)
    try {
      const resp = await fetch(`/api/brands/${brandId}/enrich`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok) {
        setEnrichError(data.error ?? 'Enrichment failed')
        setEnriching(false)
        return
      }
      // Surface about_summary immediately if the enricher wrote one
      if (data.aboutSummary && !isPlaceholder(data.aboutSummary)) {
        setAbout(data.aboutSummary)
      }
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : 'Enrichment failed')
      setEnriching(false)
      return
    }
    setEnriching(false)
    // Now run intelligence with the fresh enriched data
    await fetchIntelligence()
  }

  async function fetchIntelligence() {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/brands/${brandId}/intelligence`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error ?? 'Intelligence generation failed')
      setAbout(data.about)
      setOpportunity(data.opportunity)
      setAngles(data.angles)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate intelligence')
    } finally {
      setLoading(false)
    }
  }

  async function generatePitch() {
    setGeneratingPitch(true)
    try {
      const resp = await fetch(`/api/brands/${brandId}/generate-pitch`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.ok) {
        setToast({ ok: false, msg: data.error ?? 'Draft generation failed' })
      } else {
        setToast({
          ok: true,
          msg: `Draft ready: "${data.subject}" (score ${data.qualityScore})`,
          draftId: data.draftId,
        })
      }
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Request failed' })
    } finally {
      setGeneratingPitch(false)
    }
  }

  const busyEnriching    = enriching
  const busyIntelligence = loading && !about

  return (
    <>
      {toast && <ToastBanner toast={toast} onDismiss={() => setToast(null)} />}

      {/* ── A: About the brand ────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">About the brand</h2>
          {!enriching && !loading && (
            <>
              {/* Enrich now — re-fetches homepage and regenerates everything */}
              <button
                onClick={runEnrichThenIntelligence}
                title="Re-fetch homepage and regenerate analysis"
                className="text-zinc-700 hover:text-zinc-400"
              >
                <Database className="h-3 w-3" />
              </button>
              {/* Refresh — re-runs intelligence only (no homepage fetch) */}
              <button
                onClick={fetchIntelligence}
                title="Refresh analysis only (no re-enrichment)"
                className="text-zinc-700 hover:text-zinc-400"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </>
          )}
        </div>

        {busyEnriching ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Fetching homepage and enriching brand data… (10–15 s)
            </div>
            {enrichError && <p className="text-xs text-red-400">{enrichError}</p>}
          </div>
        ) : busyIntelligence ? (
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analyzing brand…
          </div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : about && !isPlaceholder(about) ? (
          <p className="text-sm leading-relaxed text-zinc-300">{stripMd(about)}</p>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-zinc-500">
            No summary yet.
            <button
              onClick={runEnrichThenIntelligence}
              className="underline hover:text-zinc-300"
            >
              Enrich now
            </button>
          </div>
        )}
      </section>

      {/* ── B: Why this is an opportunity ────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Why this is an opportunity for Taylor
        </h2>
        {busyEnriching || (loading && !opportunity) ? (
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {busyEnriching ? 'Enriching first…' : 'Analyzing fit…'}
          </div>
        ) : opportunity ? (
          <p className="text-sm leading-relaxed text-zinc-300">{stripMd(opportunity)}</p>
        ) : null}
      </section>

      {/* ── C: Suggested angles ──────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Suggested angles</h2>
          <button
            onClick={generatePitch}
            disabled={generatingPitch}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {generatingPitch
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
              : <><Sparkles className="h-3 w-3" /> Generate pitch</>
            }
          </button>
        </div>
        {busyEnriching || (loading && !angles) ? (
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {busyEnriching ? 'Enriching first…' : 'Generating pitch angles…'}
          </div>
        ) : angles?.angles?.length ? (
          <div className="space-y-3">
            {angles.reasoning && (
              <p className="text-xs italic text-zinc-500">{angles.reasoning}</p>
            )}
            {angles.angles.map((a, i) => (
              <AngleCard key={i} angle={a} brandId={brandId} onToast={setToast} />
            ))}
          </div>
        ) : !loading && !enriching ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
            No signals attached yet — run the scanner to generate angles.
          </div>
        ) : null}
      </section>
    </>
  )
}
