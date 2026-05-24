import { readFileSync } from 'fs'
import { join } from 'path'
import { ExternalLink } from 'lucide-react'

function loadCred() {
  try {
    const p = join(process.cwd(), '..', '..', 'docs', 'taylor_credibility.json')
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

export default function MediaKitPage() {
  const cred = loadCred()

  if (!cred) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-medium">Media kit</h1>
        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-500">
          Could not load <code>docs/taylor_credibility.json</code>. Make sure the file exists in the repo root.
        </div>
      </div>
    )
  }

  const { person, business: biz, audience, press_verified: press = [],
    tv_and_video_appearances_verified: tv = [],
    what_makes_her_a_strong_brand_partner: whatMakes = [],
    voice_signature_phrases: phrases = [] } = cred

  const tiers = biz?.service_tiers_public ?? []

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-medium">Media kit</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Auto-generated from <code className="text-xs">docs/taylor_credibility.json</code> — the only source of truth for pitch claims.
        </p>
      </div>

      <section className="rounded-md border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-zinc-400">About Taylor</h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Row label="Full name">{person?.full_name}</Row>
            <Row label="Profession">{person?.profession}</Row>
            <Row label="Based in">{person?.based_in}</Row>
            <Row label="Founded">{biz?.business_founded}</Row>
            <Row label="Babies named">{biz?.babies_named_to_date?.approximate_count}+ (approximate)</Row>
          </div>
          <div className="space-y-2">
            <Row label="Website">
              <a href={biz?.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-zinc-200">
                {biz?.website} <ExternalLink className="h-3 w-3" />
              </a>
            </Row>
            <Row label="Instagram">
              {audience?.instagram?.handle} · {audience?.instagram?.follower_count_last_known?.toLocaleString()} followers
            </Row>
            <Row label="TikTok">
              <span>{audience?.tiktok?.handle} · {audience?.tiktok?.follower_count_last_known?.toLocaleString()} followers</span>
              <span className="ml-2 rounded bg-amber-950 px-1.5 py-0.5 text-xs text-amber-400">Stale — verify before pitching</span>
            </Row>
          </div>
        </div>
        {phrases[0] && (
          <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-sm italic text-zinc-300">"{phrases[0]}"</p>
          </div>
        )}
      </section>

      {whatMakes.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Why she's a strong brand partner</h2>
          <div className="space-y-2">
            {whatMakes.map((point: string, i: number) => (
              <div key={i} className="flex gap-3 rounded-md border border-zinc-800 bg-zinc-900 p-3">
                <span className="mt-0.5 shrink-0 text-xs text-zinc-600">{i + 1}.</span>
                <p className="text-sm text-zinc-300">{point}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {tiers.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Service tiers</h2>
          <div className="grid grid-cols-3 gap-3">
            {tiers.map((t: any) => (
              <div key={t.name} className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
                <div className="text-sm font-medium">{t.name}</div>
                <div className="mt-1 text-lg font-medium">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(t.approx_price_usd)}
                </div>
                <p className="mt-1 text-xs text-zinc-500">{t.description}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-600">Pricing from public press. Confirm with Taylor before quoting in any pitch.</p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Verified press ({press.length})</h2>
        <div className="space-y-2">
          {press.map((p: any, i: number) => (
            <div key={i} className="flex items-start justify-between rounded-md border border-zinc-800 bg-zinc-900 p-3">
              <div>
                <span className="text-sm font-medium">{p.outlet}</span>
                {p.title && <p className="mt-0.5 text-xs text-zinc-400">"{p.title}"</p>}
                <div className="mt-1 flex gap-2 text-xs text-zinc-600">
                  {p.type && <span>{p.type.replace(/_/g, ' ')}</span>}
                  {p.published && <span>{p.published}</span>}
                </div>
              </div>
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-zinc-600 hover:text-zinc-400">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {tv.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">TV & video ({tv.length})</h2>
          <div className="space-y-2">
            {tv.map((t: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 p-3">
                <div>
                  <span className="text-sm font-medium">{t.outlet}</span>
                  <span className="ml-2 text-xs text-zinc-500">{t.type?.replace(/_/g, ' ')}</span>
                </div>
                {t.url && (
                  <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-400">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="rounded-md border border-amber-900 bg-amber-950/20 p-4 text-sm text-amber-400">
        Pitch agents are forbidden from claiming anything not in <code className="text-xs">docs/taylor_credibility.json</code>.
        Audience numbers marked "stale" must use qualitative descriptions in pitches — never specific counts.
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs text-zinc-500">{label}: </span>
      <span className="text-sm text-zinc-300">{children}</span>
    </div>
  )
}
