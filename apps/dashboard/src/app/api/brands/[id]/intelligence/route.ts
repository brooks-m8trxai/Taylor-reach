/**
 * POST /api/brands/[id]/intelligence
 *
 * Generates (or returns cached) brand intelligence for the detail page:
 *   • about_summary       — what this brand does + who their customer is
 *   • opportunity_summary — why Taylor should pitch them right now
 *   • suggested_angles    — 2-3 ranked pitch angles from the pitch agent
 *
 * Results are cached in DB (about + opportunity + angles + intelligence_generated_at).
 * Cache is considered stale when intelligence_generated_at < last_signal_at.
 *
 * GET is also supported: returns cached values only (no generation).
 */

import { NextResponse } from 'next/server'
import { generateBrandIntelligence } from '@taylor-reach/pitch'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await generateBrandIntelligence(params.id)
    if (!result) {
      return NextResponse.json({ error: 'Brand not found or generation failed' }, { status: 404 })
    }
    return NextResponse.json({
      about: result.about,
      opportunity: result.opportunity,
      angles: result.angles,
      fromCache: result.fromCache,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[intelligence route]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
