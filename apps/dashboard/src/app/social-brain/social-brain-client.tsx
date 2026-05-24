'use client'

import { useState } from 'react'
import {
  Brain, RefreshCw, Loader2, ExternalLink, ChevronDown, ChevronUp,
  Copy, CheckCheck, Sparkles,
} from 'lucide-react'
import type { ContentSignal } from './page'

// ─── Types ────────────────────────────────────────────────────────────────────

type ContentFormat = 'Reel' | 'Carousel' | 'Single' | 'Story'

interface ContentAngle {
  format: ContentFormat
  hook: string
  concept: string
  caption_starter: string
}

interface AnglesResult {
  recap: string
  angles: ContentAngle[]
}

// ─── Format chips ─────────────────────────────────────────────────────────────

const FORMAT_CHIP: Record<ContentFormat, string> = {
  Reel:     'bg-pink-950 text-pink-300',
  Carousel: 'bg-purple-950 text-purple-300',
  Single:   'bg-blue-950 text-blue-300',
  Story:    'bg-amber-950 text-amber-300',
}

// ─── Source chips ─────────────────────────────────────────────────────────────

const SOURCE_CHIP: Record<string, string> = {
  'People':               'bg-rose-950 text-rose-300',
  'Just Jared':           'bg-orange-950 text-orange-300',
  'E! Online':            'bg-purple-950 text-purple-300',
  'ET Online':            'bg-indigo-950 text-indigo-300',
  'Us Weekly':            'bg-pink-950 text-pink-300',
  'Nameberry':            'bg-teal-950 text-teal-300',
  'The Bump':             'bg-green-950 text-green-300',
  'BabyCenter':           'bg-cyan-950 text-cyan-300',
  'Romper':               'bg-violet-950 text-violet-300',
  'Scary Mommy':          'bg-red-950 text-red-300',
  'Motherly':             'bg-emerald-950 text-emerald-300',
  'Fatherly':             'bg-sky-950 text-sky-300',
  'What to Expect':       'bg-lime-950 text-lime-300',
  'TODAY Parenting':      'bg-yellow-950 text-yellow-300',
  'Parents Magazine':     'bg-fuchsia-950 text-fuchsia-300',
  'Reddit r/BabyNames':   'bg-orange-950 text-orange-200',
  'Verywell Family':      'bg-blue-950 text-blue-200',
}

function sourceChip(source: string): string {
  return SOURCE_CHIP[source] ?? 'bg-zinc-800 text-zinc-400'
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relTime(ts: string): string {
  const hours = Math.floor((Date.now() - new Date(ts).getTime()) / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
      title="Copy to clipboard"
    >
      {copied
        ? <><CheckCheck className="h-2.5 w-2.5 text-green-400" /> Copied</>
        : <><Copy className="h-2.5 w-2.5" /> {label ?? 'Copy'}</>
      }
    </button>
  )
}

// ─── Angle card ───────────────────────────────────────────────────────────────

function AngleCard({ angle }: { angle: ContentAngle }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${FORMAT_CHIP[angle.format] ?? 'bg-zinc-800 text-zinc-400'}`}>
          {angle.format}
        </span>
        <CopyButton text={`${angle.hook}\n\n${angle.caption_starter}`} label="Copy hook + caption" />
      </div>
      <p className="text-sm font-medium text-zinc-100">{angle.hook}</p>
      <p className="text-xs text-zinc-400">{angle.concept}</p>
      <div className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2">
        <p className="text-xs text-zinc-300 italic">{angle.caption_starter}</p>
      </div>
    </div>
  )
}

// ─── Signal row ───────────────────────────────────────────────────────────────

function SignalRow({ signal }: { signal: ContentSignal }) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnglesResult | null>(null)
  const [err, setErr] = useState('')

  async function loadAngles() {
    if (result) {
      setExpanded(e => !e)
      return
    }
    setExpanded(true)
    setLoading(true)
    setErr('')
    try {
      const resp = await fetch(`/api/social-brain/${signal.id}/angles`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.ok) {
        setErr(data.error ?? 'Failed to generate angles')
      } else {
        setResult(data)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const pub = signal.source_published_at ?? signal.detected_at

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Row header */}
      <button
        onClick={loadAngles}
        className="w-full flex items-start justify-between gap-3 p-3 text-left hover:bg-zinc-800/50 transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${sourceChip(signal.source)}`}>
              {signal.source}
            </span>
            <span className="text-xs text-zinc-500">{relTime(pub)}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-200 leading-snug">{signal.headline}</p>
          {signal.raw_excerpt && (
            <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">{signal.raw_excerpt}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {signal.source_url && (
            <a
              href={signal.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-zinc-600 hover:text-zinc-400"
              title="Open original article"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
            : expanded
              ? <ChevronUp className="h-4 w-4 text-zinc-500" />
              : <ChevronDown className="h-4 w-4 text-zinc-500" />
          }
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-zinc-800 p-3 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              Generating IG angles…
            </div>
          )}
          {err && (
            <p className="text-xs text-red-400">{err}</p>
          )}
          {result && (
            <>
              {/* Story recap */}
              <div className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2">
                <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wide">Story recap</p>
                <p className="text-sm text-zinc-300">{result.recap}</p>
              </div>
              {/* Angles */}
              {result.angles.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wide">
                    {result.angles.length} Instagram angles
                  </p>
                  <div className="space-y-2">
                    {result.angles.map((angle, i) => (
                      <AngleCard key={i} angle={angle} />
                    ))}
                  </div>
                </div>
              )}
              {result.angles.length === 0 && (
                <p className="text-sm text-zinc-500">No angles generated — try refreshing.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type ScanState = 'idle' | 'scanning' | 'done' | 'error'

export function SocialBrainClient({ signals: initialSignals }: { signals: ContentSignal[] }) {
  const [signals, setSignals] = useState<ContentSignal[]>(initialSignals)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanMsg, setScanMsg] = useState('')
  const [activeSource, setActiveSource] = useState('all')

  // Unique sources for filter tabs
  const sources = ['all', ...Array.from(new Set(signals.map(s => s.source))).sort()]

  const filtered = activeSource === 'all'
    ? signals
    : signals.filter(s => s.source === activeSource)

  async function runScan() {
    if (scanState === 'scanning') return
    setScanState('scanning')
    setScanMsg('')
    try {
      const resp = await fetch('/api/social-brain/scan', { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.ok) {
        setScanState('error')
        setScanMsg(data.error ?? 'Scan failed')
      } else {
        setScanState('done')
        setScanMsg(`${data.new_signals} new ideas found · ${data.elapsed_seconds}s`)
        setTimeout(() => window.location.reload(), 2500)
      }
    } catch (e) {
      setScanState('error')
      setScanMsg(e instanceof Error ? e.message : 'Request failed')
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-400" />
            <h1 className="text-2xl font-medium">Social Media Brain</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            {signals.length} content ideas · click any story to generate Instagram angles
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scanState === 'done' && (
            <span className="text-xs text-green-400">{scanMsg}</span>
          )}
          {scanState === 'error' && (
            <span className="text-xs text-red-400">{scanMsg}</span>
          )}
          {scanState === 'scanning' && (
            <span className="text-xs text-zinc-500">Scanning sources…</span>
          )}
          <button
            onClick={runScan}
            disabled={scanState === 'scanning'}
            className="flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-purple-600 hover:text-purple-400 disabled:opacity-50"
            title="Scan celebrity news, name trends, and parenting culture for content ideas"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanState === 'scanning' ? 'animate-spin' : ''}`} />
            {scanState === 'scanning' ? 'Scanning…' : 'Scan for ideas'}
          </button>
        </div>
      </div>

      {/* ── Source filter tabs ───────────────────────────────────────────────── */}
      {sources.length > 2 && (
        <div className="flex flex-wrap gap-1">
          {sources.map(src => {
            const count = src === 'all' ? signals.length : signals.filter(s => s.source === src).length
            return (
              <button
                key={src}
                onClick={() => setActiveSource(src)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition border ${
                  activeSource === src
                    ? 'border-zinc-600 bg-zinc-800 text-zinc-200'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {src === 'all' ? 'All sources' : src}
                <span className={`rounded px-1 text-[10px] ${
                  activeSource === src ? 'bg-black/30 text-zinc-300' : 'bg-zinc-800 text-zinc-600'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Signal list ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {filtered.map(s => (
          <SignalRow key={s.id} signal={s} />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-8 text-center">
            <Brain className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">
              No content ideas yet. Hit <strong className="text-zinc-400">Scan for ideas</strong> to pull in celebrity baby news, name trends, and parenting culture stories.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
