import { Suspense } from 'react'
import { getBriefing } from '@/lib/briefing'
import { TrendingUp, Mail, MessageSquare, AlertCircle, Sparkles, Clock } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-10 max-w-4xl">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="animate-fade-slide-up stagger-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          Daily briefing
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">{today}</p>
      </div>

      <Suspense fallback={
        <div className="text-sm text-ink-muted animate-fade-in">Loading briefing…</div>
      }>
        <BriefingContent />
      </Suspense>
    </div>
  )
}

// ─── Briefing (server data) ───────────────────────────────────────────────────

async function BriefingContent() {
  const briefing = await getBriefing()

  return (
    <div className="space-y-10">

      {/* ══ HERO KPIs — the two numbers Taylor actually cares about ════════ */}
      <div className="grid grid-cols-2 gap-4 animate-fade-slide-up stagger-2">
        <HeroStat
          label="Warm replies"
          value={String(briefing.warm_replies_yesterday)}
          sublabel={`${briefing.replies_yesterday} total replies yesterday`}
          icon={MessageSquare}
        />
        <HeroStat
          label="Pipeline value"
          value={formatUsd(briefing.pipeline_value_usd)}
          sublabel="active deals"
          icon={TrendingUp}
        />
      </div>

      {/* ── Secondary stats — supporting context ─────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 animate-fade-slide-up stagger-3">
        <SubStat
          label="Sent yesterday"
          value={String(briefing.sent_yesterday)}
          sublabel={`of ${briefing.sent_target} target`}
          icon={Mail}
        />
        <SubStat
          label="High-signal brands"
          value={String(briefing.new_high_signal_count)}
          sublabel="fit ≥ 75 · last 48h"
          icon={Sparkles}
        />
      </div>

      {/* ── Awaiting reply — urgent, topmost action section ──────────────── */}
      <Section
        title="Awaiting your reply"
        icon={AlertCircle}
        accent="amber"
        className="animate-fade-slide-up stagger-3"
      >
        {briefing.awaiting_reply.length === 0
          ? <Empty>All inbound handled.</Empty>
          : briefing.awaiting_reply.map((r, i) => (
              <Row
                key={r.id}
                title={r.brand_name}
                meta={`Replied ${r.hours_ago}h ago · ${r.intent_label}`}
                cta={{ href: `/inbox/${r.id}`, label: 'Review draft' }}
                urgency="high"
                delay={i * 50}
              />
            ))
        }
      </Section>

      {/* ── Pitch queue ──────────────────────────────────────────────────── */}
      <Section
        title="Pitch queue"
        icon={Mail}
        className="animate-fade-slide-up stagger-4"
      >
        <Row
          title={`${briefing.pitches_awaiting_approval} draft${briefing.pitches_awaiting_approval === 1 ? '' : 's'} ready for review`}
          meta="Review, edit, or approve before sending"
          cta={{ href: '/queue', label: 'Open queue' }}
          badge={briefing.pitches_awaiting_approval > 0 ? String(briefing.pitches_awaiting_approval) : undefined}
          delay={0}
        />
      </Section>

      {/* ── Today's priorities ───────────────────────────────────────────── */}
      {briefing.priorities.length > 0 && (
        <Section
          title="Today's priorities"
          icon={TrendingUp}
          className="animate-fade-slide-up stagger-4"
        >
          {briefing.priorities.map((p, i) => (
            <Row
              key={p.id}
              number={i + 1}
              title={p.title}
              meta={p.subtitle}
              cta={{ href: p.href, label: p.cta_label }}
              ev={p.ev_usd}
              delay={i * 50}
            />
          ))}
        </Section>
      )}

      {/* ── New high-signal brands ───────────────────────────────────────── */}
      <Section
        title="New high-signal brands"
        icon={Sparkles}
        className="animate-fade-slide-up stagger-5"
      >
        {briefing.new_high_signal_brands.length === 0
          ? <Empty>No new high-signal brands in the last 48h.</Empty>
          : briefing.new_high_signal_brands.map((b, i) => (
              <Row
                key={b.id}
                title={b.brand_name}
                meta={`Fit ${b.fit_score} · ${b.signal_summary}`}
                cta={{ href: `/brands/${b.id}`, label: 'View' }}
                delay={i * 50}
              />
            ))
        }
      </Section>

      {/* ── Stalled deals ────────────────────────────────────────────────── */}
      <Section
        title="Stalled deals"
        icon={Clock}
        accent="muted"
        className="animate-fade-slide-up stagger-6"
      >
        {briefing.stalled.length === 0
          ? <Empty>Nothing stalled. Pipeline is healthy.</Empty>
          : briefing.stalled.map((s, i) => (
              <Row
                key={s.id}
                title={s.brand_name}
                meta={s.stall_reason}
                cta={{ href: `/pipeline/${s.id}`, label: 'Decide' }}
                delay={i * 50}
              />
            ))
        }
      </Section>

    </div>
  )
}

// ─── HeroStat ─────────────────────────────────────────────────────────────────
// The 1-2 most important metrics. Playfair Display number, tangerine accent.

function HeroStat({
  label,
  value,
  sublabel,
  icon: Icon,
}: {
  label: string
  value: string
  sublabel?: string
  icon?: React.ElementType
}) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-surface-raised border border-wire shadow-raised p-6 group hover:border-wire-strong hover:shadow-hover transition-all duration-normal">
      {/* Left accent stripe — animates in after the card */}
      <div className="absolute inset-y-0 left-0 w-[2px] bg-accent rounded-r animate-accent-line" />

      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-widest text-ink-muted">
          {label}
        </span>
        {Icon && <Icon className="h-3.5 w-3.5 text-accent opacity-60" />}
      </div>

      {/* Hero number */}
      <div className="mt-4 font-display text-display font-semibold text-accent leading-none tracking-tight">
        {value}
      </div>

      {/* Sublabel */}
      {sublabel && (
        <div className="mt-3 text-xs text-ink-muted">{sublabel}</div>
      )}

      {/* Subtle background glow on hover */}
      <div className="pointer-events-none absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-normal"
           style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(244,157,110,0.04) 0%, transparent 70%)' }} />
    </div>
  )
}

// ─── SubStat ──────────────────────────────────────────────────────────────────
// Supporting context metrics — smaller, no accent, clearly subordinate.

function SubStat({
  label,
  value,
  sublabel,
  icon: Icon,
}: {
  label: string
  value: string
  sublabel?: string
  icon?: React.ElementType
}) {
  return (
    <div className="rounded-md bg-surface border border-wire-subtle shadow-card px-5 py-4 hover:border-wire transition-all duration-fast">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-widest text-ink-muted">
          {label}
        </span>
        {Icon && <Icon className="h-3 w-3 text-ink-muted opacity-50" />}
      </div>
      <div className="mt-2.5 text-xl font-semibold text-ink">{value}</div>
      {sublabel && (
        <div className="mt-0.5 text-xs text-ink-muted">{sublabel}</div>
      )}
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────

const ACCENT_PILL: Record<string, string> = {
  amber: 'bg-accent',
  sage:  'bg-accent-sage',
  muted: 'bg-wire-strong',
  default: 'bg-wire-strong',
}

function Section({
  title,
  icon: Icon,
  accent = 'default',
  className = '',
  children,
}: {
  title: string
  icon: React.ElementType
  accent?: 'amber' | 'sage' | 'muted' | 'default'
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center gap-2.5">
        {/* Accent pill */}
        <div className={`h-3.5 w-[2px] rounded-full ${ACCENT_PILL[accent]}`} />
        <Icon className="h-3.5 w-3.5 text-ink-muted" />
        <h2 className="text-2xs font-bold uppercase tracking-widest text-ink-muted">
          {title}
        </h2>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({
  number,
  title,
  meta,
  cta,
  ev,
  urgency,
  badge,
  delay = 0,
}: {
  number?: number
  title: string
  meta?: string
  cta?: { href: string; label: string }
  ev?: number
  urgency?: 'high'
  badge?: string
  delay?: number
}) {
  return (
    <div
      className={`
        group flex items-center justify-between rounded-md px-4 py-3
        border bg-surface shadow-card
        hover:bg-surface-hover hover:border-wire hover:-translate-y-px hover:shadow-hover
        transition-all duration-fast
        animate-fade-slide-up
        ${urgency === 'high' ? 'border-wire-subtle border-l-2 border-l-accent' : 'border-wire-subtle'}
      `}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-3 min-w-0">
        {number !== undefined && (
          <span className="mt-0.5 shrink-0 text-xs font-semibold text-ink-muted tabular-nums w-4">
            {number}.
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">{title}</div>
          {meta && <div className="mt-0.5 text-xs text-ink-muted">{meta}</div>}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-4">
        {ev !== undefined && ev > 0 && (
          <span className="text-xs text-ink-muted tabular-nums">{formatUsd(ev)}</span>
        )}
        {badge && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-2xs font-bold text-surface-base animate-badge-breathe">
            {badge}
          </span>
        )}
        {cta && (
          <Link
            href={cta.href}
            className="rounded border border-wire px-3 py-1 text-xs text-ink-secondary
                       hover:border-accent hover:text-accent transition-all duration-fast"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Empty ────────────────────────────────────────────────────────────────────

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-wire-subtle bg-surface px-4 py-3 text-sm text-ink-muted">
      {children}
    </div>
  )
}
