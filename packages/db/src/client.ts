import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Browser client ───────────────────────────────────────────────────────────
// Uses the anon key — subject to RLS. Safe to call from client components.

export function createBrowserClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  )
}

// ─── Server client ────────────────────────────────────────────────────────────
// Uses the service role key — bypasses RLS entirely.
// Never expose this instance (or the key) to the browser.
//
// Two important options:
//   auth.persistSession = false  — no cookie/localStorage reads; safe in Node.js
//   global.fetch cache:'no-store' — prevents Next.js from caching Supabase
//                                   responses, which would otherwise serve stale
//                                   zero-row results after a fresh DB insert.

export const serverClient: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url: RequestInfo | URL, init?: RequestInit) =>
        fetch(url, { ...init, cache: 'no-store' }),
    },
  },
)

// ─── Backward-compat alias ────────────────────────────────────────────────────
// scanner.ts, enricher.ts, angle_generator.ts, draft_writer.ts all import
// `supabase` by name — keep this working without touching those packages.

export const supabase: SupabaseClient = serverClient
