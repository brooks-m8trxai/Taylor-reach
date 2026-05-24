import { serverClient } from '@taylor-reach/db'
import { getTenantId } from '@/lib/tenant'
import Link from 'next/link'
import type { BrandStatus } from '@taylor-reach/db'

export const dynamic = 'force-dynamic'

const STAGES: { key: BrandStatus; label: string; color: string }[] = [
  { key: 'queued',          label: 'Queued',       color: 'border-zinc-700' },
  { key: 'pitched',         label: 'Pitched',      color: 'border-blue-800' },
  { key: 'replied_warm',    label: 'Warm reply',   color: 'border-green-800' },
  { key: 'call_booked',     label: 'Call booked',  color: 'border-teal-800' },
  { key: 'negotiating',     label: 'Negotiating',  color: 'border-amber-700' },
  { key: 'deal_won',        label: 'Deal won',     color: 'border-emerald-700' },
  { key: 'deal_live',       label: 'Live',         color: 'border-emerald-600' },
]

function relTime(ts: string | null) {
  if (!ts) return null
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000)
  return d === 0 ? 'today' : `${d}d ago`
}

export default async function PipelinePage() {
  const tenantId = await getTenantId()

  const { data: brands } = !tenantId ? { data: [] } : await serverClient
    .from('brands')
    .select('id, brand_name, fit_score, status, last_contacted_at, categories')
    .eq('tenant_id', tenantId)
    .in('status', STAGES.map(s => s.key))
    .order('fit_score', { ascending: false })

  type PipelineBrand = NonNullable<typeof brands>[number]
  const byStage: Record<string, PipelineBrand[]> = Object.fromEntries(STAGES.map(s => [s.key, []]))
  for (const b of brands ?? []) {
    byStage[b.status]?.push(b)
  }

  const total = brands?.length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">Pipeline</h1>
        <p className="mt-1 text-sm text-zinc-400">{total} brand{total !== 1 ? 's' : ''} in active stages</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map(stage => {
          const cards = byStage[stage.key] ?? []
          return (
            <div key={stage.key} className="flex w-60 shrink-0 flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{stage.label}</span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">{cards.length}</span>
              </div>
              <div className={`min-h-24 rounded-md border-t-2 bg-zinc-900/50 p-2 space-y-2 ${stage.color}`}>
                {cards.map(b => (
                  <Link
                    key={b.id}
                    href={`/brands/${b.id}`}
                    className="block rounded-md border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-700"
                  >
                    <div className="truncate text-sm font-medium">{b.brand_name}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>Fit {b.fit_score ?? '—'}</span>
                      {b.last_contacted_at && <span>{relTime(b.last_contacted_at)}</span>}
                    </div>
                    {b.categories?.length > 0 && (
                      <div className="mt-1 truncate text-xs text-zinc-600">{b.categories[0]}</div>
                    )}
                  </Link>
                ))}
                {cards.length === 0 && (
                  <div className="p-2 text-center text-xs text-zinc-700">Empty</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
