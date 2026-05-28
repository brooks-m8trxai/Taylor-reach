'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2, Shield, ShieldCheck, Plus, X } from 'lucide-react'

// ─── Badge display ────────────────────────────────────────────────────────────

const BADGE_CONFIG: Record<string, { label: string; classes: string }> = {
  named:       { label: 'Named',       classes: 'bg-emerald-950 text-emerald-300' },
  editorial:   { label: 'Editorial',   classes: 'bg-blue-950 text-blue-300' },
  founder:     { label: 'Founder',     classes: 'bg-violet-950 text-violet-300' },
  role_based:  { label: 'Role-based',  classes: 'bg-amber-950 text-amber-300' },
  generic:     { label: 'Generic',     classes: 'bg-zinc-800 text-zinc-500' },
  unverified:  { label: 'Unverified',  classes: 'bg-zinc-900 text-zinc-600' },
  risky:       { label: 'Risky',       classes: 'bg-orange-950 text-orange-400' },
  invalid:     { label: 'Invalid',     classes: 'bg-red-950 text-red-500 line-through' },
}

type Contact = {
  id: string
  name: string | null
  title: string | null
  email: string | null
  source: string | null
  verified: boolean
  quality_badge: string | null
  badge_reason: string | null
  last_verified_at: string | null
  email_status: string | null
  confidence: number | null
}

// ─── Verify button ────────────────────────────────────────────────────────────

function VerifyButton({ contactId, brandId, onVerified }: {
  contactId: string
  brandId: string
  onVerified: (verified: boolean) => void
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error' | 'skipped'>('idle')
  const [msg, setMsg] = useState('')

  async function handleVerify() {
    setState('loading')
    try {
      const resp = await fetch(`/api/brands/${brandId}/contacts/${contactId}/verify`, { method: 'POST' })
      const data = await resp.json()
      if (data.skipped) {
        setState('skipped')
        setMsg('Add HUNTER_API_KEY to enable')
      } else if (data.ok) {
        setState('done')
        setMsg(data.result === 'deliverable' ? 'Deliverable' : data.result)
        onVerified(data.verified)
      } else {
        setState('error')
        setMsg(data.error ?? 'Failed')
      }
    } catch {
      setState('error')
      setMsg('Request failed')
    }
  }

  if (state === 'done') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-400">
        <ShieldCheck className="h-3 w-3" /> {msg}
      </span>
    )
  }
  if (state === 'error') {
    return <span className="text-xs text-red-400">{msg}</span>
  }
  if (state === 'skipped') {
    return <span className="text-xs text-zinc-600" title={msg}>No key</span>
  }

  return (
    <button
      onClick={handleVerify}
      disabled={state === 'loading'}
      className="flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-50"
      title="Verify email via Hunter.io"
    >
      {state === 'loading'
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <Shield className="h-3 w-3" />}
      Verify
    </button>
  )
}

// ─── Contacts list ────────────────────────────────────────────────────────────

function ContactCard({ contact, brandId }: { contact: Contact; brandId: string }) {
  const [verified, setVerified] = useState(contact.verified)
  const badge = BADGE_CONFIG[contact.quality_badge ?? 'unverified'] ?? BADGE_CONFIG.unverified

  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{contact.name ?? 'Unknown'}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.classes}`}>
            {badge.label}
          </span>
          {verified && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-500">
              <CheckCircle2 className="h-2.5 w-2.5" /> Verified
            </span>
          )}
        </div>
        {contact.title && (
          <div className="text-xs text-zinc-500">{contact.title}</div>
        )}
        {contact.badge_reason && (
          <div className="mt-0.5 text-[10px] text-zinc-600">{contact.badge_reason}</div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="text-xs text-zinc-400">{contact.email}</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-700">{contact.source ?? 'unknown'}</span>
          {contact.confidence != null && (
            <span className="text-[10px] text-zinc-600" title="Hunter confidence score">
              {contact.confidence}%
            </span>
          )}
          {!verified && contact.email && (
            <VerifyButton contactId={contact.id} brandId={brandId} onVerified={setVerified} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Manual add form ──────────────────────────────────────────────────────────

function AddContactForm({ brandId, onAdded }: { brandId: string; onAdded: (c: Contact) => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', title: '', email: '', notes: '' })

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email.includes('@')) { setError('Valid email required'); return }
    setLoading(true)
    setError('')
    try {
      const resp = await fetch(`/api/brands/${brandId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'manual' }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.ok) {
        setError(data.error ?? 'Save failed')
      } else {
        onAdded(data.contact)
        setForm({ name: '', title: '', email: '', notes: '' })
        setOpen(false)
      }
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
      >
        <Plus className="h-3.5 w-3.5" /> Add contact manually
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-zinc-700 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">Add contact</span>
        <button type="button" onClick={() => setOpen(false)} className="text-zinc-600 hover:text-zinc-400">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={form.name}
          onChange={set('name')}
          placeholder="Name"
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <input
          value={form.title}
          onChange={set('title')}
          placeholder="Title"
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
      </div>
      <input
        value={form.email}
        onChange={set('email')}
        placeholder="Email *"
        type="email"
        required
        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
      />
      <input
        value={form.notes}
        onChange={set('notes')}
        placeholder="Notes (optional — e.g. 'met at SXSW')"
        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
      />
      {error && <div className="text-xs text-red-400">{error}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-1.5 rounded bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          Save contact
        </button>
      </div>
    </form>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ContactsClient({
  brandId,
  initialContacts,
}: {
  brandId: string
  initialContacts: Contact[]
}) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)

  function handleAdded(c: Contact) {
    setContacts(prev => [c, ...prev])
  }

  return (
    <div className="space-y-2">
      {contacts.length > 0 ? (
        contacts.map(c => (
          <ContactCard key={c.id} contact={c} brandId={brandId} />
        ))
      ) : (
        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
          No contacts yet. Re-enrich to scrape for emails, or add one manually below.
        </div>
      )}
      <AddContactForm brandId={brandId} onAdded={handleAdded} />
    </div>
  )
}
