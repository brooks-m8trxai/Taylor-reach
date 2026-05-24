import { serverClient } from '@taylor-reach/db'
import { getTenantId } from '@/lib/tenant'
import { Calendar as CalIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

const SEASONAL_WINDOWS = [
  { name: "Mother's Day",         pitch_start: 'Feb 1',  pitch_end: 'Mar 15', categories: 'All parent brands, gift-friendly products' },
  { name: "Father's Day",         pitch_start: 'Mar 15', pitch_end: 'May 1',  categories: 'Dad-focused brands, family lifestyle' },
  { name: 'Baby shower season',   pitch_start: 'Mar 1',  pitch_end: 'May 31', categories: 'Registry-friendly brands' },
  { name: 'Back to school',       pitch_start: 'Jun 1',  pitch_end: 'Aug 1',  categories: 'Older-kid brands, family planning' },
  { name: 'Holiday gift guide',   pitch_start: 'Jul 15', pitch_end: 'Sep 30', categories: 'Major retailers, all parent categories' },
  { name: 'Black Friday / BFCM',  pitch_start: 'Sep 15', pitch_end: 'Oct 31', categories: 'DTC brands with sale events' },
  { name: 'New Year parenting',   pitch_start: 'Nov 15', pitch_end: 'Dec 31', categories: 'Parenting apps, wellness, sleep' },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isWindowActive(w: typeof SEASONAL_WINDOWS[0]) {
  const now = new Date()
  const [sm, sd] = w.pitch_start.split(' ')
  const [em, ed] = w.pitch_end.split(' ')
  const start = new Date(`${sm} ${sd} ${now.getFullYear()}`)
  const end = new Date(`${em} ${ed} ${now.getFullYear()}`)
  return now >= start && now <= end
}

function relDate(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function CalendarPage() {
  const tenantId = await getTenantId()

  const { data: deals } = !tenantId ? { data: [] } : await serverClient
    .from('deals')
    .select('id, deal_type, go_live_date, status, brands(brand_name)')
    .eq('tenant_id', tenantId)
    .not('go_live_date', 'is', null)
    .order('go_live_date')

  const now = new Date()
  const activeWindows = SEASONAL_WINDOWS.filter(isWindowActive)

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-medium">Calendar</h1>
        <p className="mt-1 text-sm text-zinc-400">Seasonal pitch windows + deal go-live dates</p>
      </div>

      {activeWindows.length > 0 && (
        <div className="rounded-md border border-blue-900 bg-blue-950/20 p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-blue-400">Active pitch windows right now</div>
          {activeWindows.map(w => (
            <div key={w.name} className="mt-1 text-sm text-zinc-200">
              <span className="font-medium">{w.name}</span>
              <span className="ml-2 text-zinc-400">— {w.pitch_start} to {w.pitch_end}</span>
              <p className="text-xs text-zinc-500">{w.categories}</p>
            </div>
          ))}
        </div>
      )}

      <section>
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-zinc-400">Seasonal pitch calendar</h2>
        <div className="space-y-3">
          {SEASONAL_WINDOWS.map(w => {
            const active = isWindowActive(w)
            return (
              <div
                key={w.name}
                className={`rounded-md border p-4 ${active ? 'border-blue-700 bg-blue-950/20' : 'border-zinc-800 bg-zinc-900'}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CalIcon className={`h-4 w-4 ${active ? 'text-blue-400' : 'text-zinc-600'}`} />
                      <span className="text-sm font-medium">{w.name}</span>
                      {active && <span className="rounded bg-blue-900 px-1.5 py-0.5 text-xs text-blue-300">Active now</span>}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{w.categories}</p>
                  </div>
                  <div className="text-right text-xs text-zinc-400">
                    <div>Pitch: {w.pitch_start} – {w.pitch_end}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Deal go-live dates ({deals?.length ?? 0})</h2>
        {deals?.length ? (
          <div className="space-y-2">
            {deals.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 p-3">
                <div>
                  <span className="text-sm font-medium">{d.brands?.brand_name ?? 'Unknown'}</span>
                  <span className="ml-2 text-xs text-zinc-500">{d.deal_type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{relDate(d.go_live_date)}</span>
                  <span className="text-xs text-zinc-600">{d.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">
            No deals scheduled yet. Dates appear here once a deal is agreed and a go-live date is set.
          </div>
        )}
      </section>
    </div>
  )
}
