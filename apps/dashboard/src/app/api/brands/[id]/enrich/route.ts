/**
 * POST /api/brands/[id]/enrich
 *
 * Runs the full enrichment pipeline for a brand:
 *   1. Resolves domain (from DB or known-publisher list)
 *   2. Fetches homepage, extracts og:description / h1 / h2 / body text
 *   3. Calls Haiku to extract brand profile (categories, size, budget signal)
 *   4. Calls Haiku to write a 2-3 sentence about_summary for the UI
 *   5. Updates brands row (domain, description, about_summary, fit_score, …)
 *   6. Saves any contacts found (website email + Apollo if key is set)
 *
 * Called by:
 *   - BrandIntelligenceClient on mount when enrichment is stale/missing
 *   - "Enrich now" button on the brand detail page
 *   - generate-pitch route (pre-flight enrichment gate)
 */

import { NextResponse } from 'next/server'
import { enrich } from '@taylor-reach/enrichment'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await enrich(params.id)
    if (!result) {
      return NextResponse.json(
        { error: 'Brand not found or enrichment failed' },
        { status: 404 },
      )
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[enrich route]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
