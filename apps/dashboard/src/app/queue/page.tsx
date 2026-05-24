'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Check, X, Edit3, ChevronRight, Loader2 } from 'lucide-react'

type Draft = {
  id: string
  brand_name: string
  fit_score: number
  deal_type: string
  angle_used: string
  signal_summary: string
  subject: string
  body_text: string
  alternate_angles: { angle: string; hook_sentence: string }[]
  draft_quality_score: number
  reasoning: string
}

export default function QueuePage() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editedBody, setEditedBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/drafts')
      .then(r => r.json())
      .then(data => {
        setDrafts(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const current = drafts.find(d => d.id === selected)

  function startEdit(body: string) {
    setEditedBody(body)
    setEditing(true)
  }

  async function approve(id: string) {
    const draft = drafts.find(d => d.id === id)
    if (!draft) return
    setActing(true)

    if (editing && editedBody !== draft.body_text) {
      await fetch(`/api/drafts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body_text: editedBody, status: 'edited' }),
      })
    }

    await fetch(`/api/drafts/${id}/approve`, { method: 'POST' })
    const remaining = drafts.filter(d => d.id !== id)
    setDrafts(remaining)
    setSelected(remaining[0]?.id ?? null)
    setEditing(false)
    setActing(false)
  }

  async function reject(id: string) {
    setActing(true)
    await fetch(`/api/drafts/${id}/reject`, { method: 'POST' })
    const remaining = drafts.filter(d => d.id !== id)
    setDrafts(remaining)
    setSelected(remaining[0]?.id ?? null)
    setEditing(false)
    setActing(false)
  }

  async function swapAngle(id: string, angle: { angle: string; hook_sentence: string }) {
    await fetch(`/api/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ angle_used: angle.angle }),
    })
    const refreshed = await fetch('/api/drafts').then(r => r.json())
    setDrafts(Array.isArray(refreshed) ? refreshed : [])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">Approval queue</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {loading ? 'Loading…' : `${drafts.length} draft${drafts.length !== 1 ? 's' : ''} awaiting review`}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading drafts…
        </div>
      ) : (
        <div className="grid grid-cols-[360px_1fr] gap-4">
          <div className="space-y-2">
            {drafts.map(d => (
              <button
                key={d.id}
                onClick={() => { setSelected(d.id); setEditing(false) }}
                className={`flex w-full items-start justify-between rounded-md border p-3 text-left transition ${
                  selected === d.id ? 'border-blue-500 bg-zinc-900' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{d.brand_name}</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Fit {d.fit_score} · {d.deal_type} · {d.angle_used}
                  </div>
                  {d.signal_summary && (
                    <div className="mt-1 truncate text-xs text-zinc-500">{d.signal_summary}</div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
              </button>
            ))}
            {drafts.length === 0 && (
              <div className="rounded-md border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">
                No drafts yet.{' '}
                <Link href="/brands" className="underline hover:text-zinc-300">
                  Go to Brand library
                </Link>{' '}
                and click Generate pitch on a brand to create your first draft.
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-6">
            {!current ? (
              <div className="flex h-full min-h-48 items-center justify-center text-sm text-zinc-500">
                Select a draft to review
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-medium">{current.brand_name}</h2>
                    <span className="text-xs text-zinc-500">Quality {current.draft_quality_score}</span>
                  </div>
                  {current.reasoning && (
                    <p className="mt-1 text-xs text-zinc-500">{current.reasoning}</p>
                  )}
                </div>

                <div className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950 p-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-zinc-500">Subject</div>
                    <div className="mt-1 text-sm">{current.subject}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-zinc-500">Body</div>
                    {editing ? (
                      <textarea
                        ref={bodyRef}
                        value={editedBody}
                        onChange={e => setEditedBody(e.currentTarget.value)}
                        className="mt-1 h-64 w-full rounded-md border border-zinc-700 bg-zinc-900 p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <pre className="mt-1 whitespace-pre-wrap font-sans text-sm leading-relaxed">{current.body_text}</pre>
                    )}
                  </div>
                </div>

                {current.alternate_angles.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-wide text-zinc-500">Other angles</div>
                    {current.alternate_angles.map(a => (
                      <button
                        key={a.angle}
                        onClick={() => swapAngle(current.id, a)}
                        className="block w-full rounded-md border border-zinc-800 bg-zinc-950 p-3 text-left text-sm hover:border-zinc-700 hover:bg-zinc-900"
                      >
                        <span className="text-xs text-zinc-500">{a.angle}: </span>
                        {a.hook_sentence}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => approve(current.id)}
                    disabled={acting}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
                  >
                    {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Approve and send
                  </button>
                  <button
                    onClick={() => editing ? setEditing(false) : startEdit(current.body_text)}
                    className="flex items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
                  >
                    <Edit3 className="h-4 w-4" /> {editing ? 'Done' : 'Edit'}
                  </button>
                  <button
                    onClick={() => reject(current.id)}
                    disabled={acting}
                    className="flex items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" /> Skip
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
