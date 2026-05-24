import { serverClient } from '@taylor-reach/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { BrandIntelligenceClient } from '../brand-intelligence-client'
import { ContactsClient } from './contacts-client'

function relTime(ts: string | null) {
  if (!ts) return '—'
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000)
  if (d === 0) return 'today'
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const SIGNAL_TYPE_LABEL: Record<string, string> = {
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
}

export const dynamic = 'force-dynamic'

export default async function BrandDetailPage({ params }: { params: { id: string } }) {
  const [{ data: brand }, { data: signals }, { data: contacts }, { data: outreach }] = await Promise.all([
    serverClient
      .from('brands')
      .select('*')
      .eq('id', params.id)
      .single(),
    serverClient
      .from('signals')
      .select('id, signal_type, headline, source, source_url, detected_at, niche_fit_score')
      .eq('brand_id', params.id)
      .order('detected_at', { ascending: false })
      .limit(20),
    serverClient
      .from('brand_contacts')
      .select('id, name, title, email, source, verified, quality_badge, badge_reason, last_verified_at')
      .eq('brand_id', params.id)
      .order('role_priority'),
    serverClient
      .from('outreach_events')
      .select('id, subject, direction, status, sent_at')
      .eq('brand_id', params.id)
      .order('sent_at', { ascending: false })
      .limit(10),
  ])

  if (!brand) notFound()

  const conflict = brand.conflict_flag as { is_competitor_of: string[]; blocked_until: string | null }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <Link href="/brands" className="mb-4 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Brand library
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-medium">{brand.brand_name}</h1>
            {brand.domain && (
              <a
                href={`https://${brand.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
              >
                {brand.domain} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-medium">{brand.fit_score ?? '—'}</div>
            <div className="text-xs text-zinc-500">fit score</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card label="Status">{brand.status.replace(/_/g, ' ')}</Card>
        <Card label="Category">{brand.categories?.join(', ') || '—'}</Card>
        <Card label="Size">{brand.size_band ?? '—'}</Card>
        <Card label="Last signal">{relTime(brand.last_signal_at)}</Card>
        <Card label="Last contact">{relTime(brand.last_contacted_at)}</Card>
        <Card label="Last enriched">{relTime(brand.last_enriched_at)}</Card>
      </div>

      {/* ── Intelligence panel: About · Why Taylor · Suggested angles ── */}
      {(() => {
        const b = brand as any
        const isStale =
          !b.intelligence_generated_at ||
          (brand.last_signal_at && new Date(b.intelligence_generated_at) < new Date(brand.last_signal_at!))

        // Enrichment is stale if never run or older than 7 days
        const enrichedAt = b.last_enriched_at ? new Date(b.last_enriched_at) : null
        const enrichIsStale =
          !enrichedAt ||
          Date.now() - enrichedAt.getTime() > 7 * 24 * 60 * 60 * 1000
        // Needs enrichment when: no description AND (stale enrichment OR no domain yet resolved)
        const needsEnrichment = enrichIsStale || !b.description

        return (
          <div className="space-y-6 rounded-md border border-zinc-800 bg-zinc-950/50 p-5">
            <BrandIntelligenceClient
              brandId={brand.id}
              cachedAbout={b.about_summary ?? null}
              cachedOpportunity={b.opportunity_summary ?? null}
              cachedAnglesJson={b.suggested_angles_json ?? null}
              isStale={isStale}
              needsEnrichment={needsEnrichment}
            />
          </div>
        )
      })()}

      {conflict.blocked_until && new Date(conflict.blocked_until) > new Date() && (
        <div className="rounded-md border border-red-900 bg-red-950/30 p-3 text-sm text-red-400">
          Blocked until {new Date(conflict.blocked_until).toLocaleDateString()} — partner conflict
        </div>
      )}

      <section>
        <SectionTitle>Contacts ({contacts?.length ?? 0})</SectionTitle>
        <ContactsClient
          brandId={brand.id}
          initialContacts={(contacts ?? []) as any}
        />
      </section>

      <section>
        <SectionTitle>Signals ({signals?.length ?? 0})</SectionTitle>
        {signals?.length ? (
          <div className="space-y-2">
            {signals.map(s => (
              <div key={s.id} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                        {SIGNAL_TYPE_LABEL[s.signal_type] ?? s.signal_type}
                      </span>
                      <span className="text-xs text-zinc-500">{relTime(s.detected_at)}</span>
                    </div>
                    <p className="mt-1 text-sm">{s.headline}</p>
                  </div>
                  {s.source_url && (
                    <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-zinc-600 hover:text-zinc-400">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No signals yet. Run the scanner.</Empty>
        )}
      </section>

      <section>
        <SectionTitle>Outreach history ({outreach?.length ?? 0})</SectionTitle>
        {outreach?.length ? (
          <div className="space-y-2">
            {outreach.map(o => (
              <div key={o.id} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 p-3">
                <div>
                  <div className="text-sm">{o.subject ?? 'No subject'}</div>
                  <div className="text-xs text-zinc-500">{o.direction} · {relTime(o.sent_at)}</div>
                </div>
                <span className="text-xs text-zinc-500">{o.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No outreach sent yet.</Empty>
        )}
      </section>

      {brand.notes && (
        <section>
          <SectionTitle>Notes</SectionTitle>
          <p className="text-sm text-zinc-300">{brand.notes}</p>
        </section>
      )}
    </div>
  )
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-sm capitalize">{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">{children}</h2>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">{children}</div>
}
