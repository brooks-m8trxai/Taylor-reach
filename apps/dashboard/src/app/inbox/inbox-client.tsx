'use client'

import { useState } from 'react'
import { ChevronRight, CheckCircle2 } from 'lucide-react'

const INTENT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'warm', label: 'Warm' },
  { key: 'not_now', label: 'Not now' },
  { key: 'not_a_fit', label: 'Not a fit' },
  { key: 'unclear', label: 'Unclear' },
]

const WARM = new Set(['warm_interested', 'warm_send_more', 'request_intro_call'])

const INTENT_BADGE: Record<string, string> = {
  warm_interested: 'bg-green-900 text-green-300',
  warm_send_more: 'bg-green-900 text-green-300',
  request_intro_call: 'bg-blue-900 text-blue-300',
  not_now: 'bg-zinc-800 text-zinc-400',
  not_a_fit: 'bg-red-950 text-red-400',
  wrong_person: 'bg-zinc-800 text-zinc-400',
  unclear: 'bg-amber-950 text-amber-400',
  auto_reply: 'bg-zinc-800 text-zinc-500',
  unsubscribe: 'bg-red-950 text-red-500',
}

function intentLabel(i: string | null) {
  const m: Record<string, string> = {
    warm_interested: 'Interested',
    warm_send_more: 'Wants more info',
    request_intro_call: 'Wants a call',
    not_now: 'Not now',
    not_a_fit: 'Not a fit',
    wrong_person: 'Wrong person',
    unclear: 'Unclear',
    auto_reply: 'Auto-reply',
    unsubscribe: 'Unsubscribe',
  }
  return m[i ?? ''] ?? i ?? 'No intent'
}

function relTime(ts: string) {
  const h = Math.floor((Date.now() - new Date(ts).getTime()) / 3_600_000)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

type Reply = {
  id: string
  intent: string | null
  intent_confidence: number | null
  received_at: string
  from_email: string | null
  raw_content: string
  resolved: boolean
  draft_response: any
  brands: { id: string; brand_name: string } | null
  outreach_events: { subject: string | null; body_text: string | null; sent_at: string | null } | null
}

export function InboxClient({ replies: initial }: { replies: Reply[] }) {
  const [replies, setReplies] = useState(initial)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = replies.filter(r => {
    if (filter === 'all') return true
    if (filter === 'warm') return WARM.has(r.intent ?? '')
    return r.intent === filter
  })

  const current = filtered.find(r => r.id === selected)

  async function resolve(id: string) {
    await fetch(`/api/replies/${id}/resolve`, { method: 'POST' })
    setReplies(replies.filter(r => r.id !== id))
    setSelected(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">Replies inbox</h1>
        <p className="mt-1 text-sm text-zinc-400">{replies.length} unresolved</p>
      </div>

      <div className="flex gap-2">
        {INTENT_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              filter === f.key
                ? 'border-blue-500 bg-blue-950 text-blue-300'
                : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[340px_1fr] gap-4">
        <div className="space-y-2">
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              className={`flex w-full items-start justify-between rounded-md border p-3 text-left transition ${
                selected === r.id ? 'border-blue-500 bg-zinc-900' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{r.brands?.brand_name ?? r.from_email ?? 'Unknown'}</span>
                  {r.intent && (
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${INTENT_BADGE[r.intent] ?? 'bg-zinc-800 text-zinc-400'}`}>
                      {intentLabel(r.intent)}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-xs text-zinc-500">
                  {r.raw_content.slice(0, 80)}…
                </div>
                <div className="mt-1 text-xs text-zinc-600">{relTime(r.received_at)}</div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">
              No replies in this filter.
            </div>
          )}
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-6">
          {!current ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-zinc-500">
              Select a reply to review
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-medium">{current.brands?.brand_name ?? current.from_email}</h2>
                  <div className="mt-1 flex items-center gap-2">
                    {current.intent && (
                      <span className={`rounded px-1.5 py-0.5 text-xs ${INTENT_BADGE[current.intent] ?? ''}`}>
                        {intentLabel(current.intent)}
                      </span>
                    )}
                    {current.intent_confidence && (
                      <span className="text-xs text-zinc-500">
                        {(current.intent_confidence * 100).toFixed(0)}% confidence
                      </span>
                    )}
                    <span className="text-xs text-zinc-500">{relTime(current.received_at)}</span>
                  </div>
                </div>
                <button
                  onClick={() => resolve(current.id)}
                  className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                </button>
              </div>

              {current.outreach_events && (
                <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                  <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Original pitch</div>
                  <div className="text-xs text-zinc-400">{current.outreach_events.subject}</div>
                  <div className="mt-1 text-xs text-zinc-600">{relTime(current.outreach_events.sent_at ?? current.received_at)} · sent by Taylor</div>
                </div>
              )}

              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Their reply</div>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{current.raw_content}</pre>
              </div>

              {current.draft_response && (
                <div className="rounded-md border border-blue-900 bg-blue-950/20 p-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-blue-400">AI draft response</div>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">
                    {typeof current.draft_response === 'string'
                      ? current.draft_response
                      : JSON.stringify(current.draft_response, null, 2)}
                  </pre>
                  <p className="mt-2 text-xs text-zinc-500">Review, edit, and send from your Gmail — do not auto-send.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
