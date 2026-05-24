'use client'

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const INTENT_COLORS: Record<string, string> = {
  'warm interested': '#4ade80',
  'warm send more': '#86efac',
  'request intro call': '#60a5fa',
  'not now': '#71717a',
  'not a fit': '#f87171',
  'unclear': '#fbbf24',
}

type Props = {
  sendsChart: { date: string; count: number }[]
  replyChart: { intent: string; count: number }[]
  statusCounts: Record<string, number>
  stats: { totalSends: number; totalReplies: number; replyRate: number; warmReplies: number; pipelineValue: number }
}

export function AnalyticsClient({ sendsChart, replyChart, statusCounts, stats }: Props) {
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-medium">Analytics</h1>
        <p className="mt-1 text-sm text-zinc-400">Last 30 days</p>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <Stat label="Sends" value={String(stats.totalSends)} />
        <Stat label="Replies" value={String(stats.totalReplies)} />
        <Stat label="Reply rate" value={`${stats.replyRate.toFixed(1)}%`} />
        <Stat label="Warm replies" value={String(stats.warmReplies)} />
        <Stat label="Pipeline" value={fmt.format(stats.pipelineValue)} />
      </div>

      <section>
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-zinc-400">Sends per day (last 30 days)</h2>
        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
          {stats.totalSends === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-zinc-600">No sends yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={sendsChart}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} interval={6} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} width={24} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-zinc-400">Reply intent breakdown</h2>
        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
          {replyChart.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-zinc-600">No replies yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={replyChart} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="intent" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} width={120} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {replyChart.map((entry, i) => (
                    <Cell key={i} fill={INTENT_COLORS[entry.intent] ?? '#3f3f46'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Pipeline stage counts</h2>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(statusCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([status, count]) => (
              <div key={status} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                <div className="text-lg font-medium">{count}</div>
                <div className="text-xs text-zinc-500 capitalize">{status.replace(/_/g, ' ')}</div>
              </div>
            ))}
          {Object.keys(statusCounts).length === 0 && (
            <div className="col-span-4 rounded-md border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">
              No brands yet. Run the scanner.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-medium">{value}</div>
    </div>
  )
}
