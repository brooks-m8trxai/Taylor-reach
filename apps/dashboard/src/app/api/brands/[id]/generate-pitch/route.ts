/**
 * POST /api/brands/[id]/generate-pitch
 *
 * Runs the full pitch pipeline for a brand:
 *   1. If brand hasn't been enriched in the last 7 days → run enrichment
 *   2. Find the most recent high-fit signal for this brand
 *   3. Run the pitch agent (writeDraft) with the chosen angle
 *   4. Write pitch_drafts row with status='awaiting_approval'
 *   5. Return draft ID + subject line so the UI can show a toast
 *
 * Body (all optional):
 *   { signalId?: string, angle?: PitchAngle }
 *   If signalId is omitted, uses the most recent signal.
 *   If angle is omitted, the pitch agent picks the best angle automatically.
 */

import { NextResponse } from 'next/server'
import { serverClient } from '@taylor-reach/db'
import { enrich } from '@taylor-reach/enrichment'
import { writeDraft } from '@taylor-reach/pitch'
import type { PitchAngle } from '@taylor-reach/pitch'

const ENRICH_STALENESS_DAYS = 7

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const brandId = params.id

  try {
    // ── Fetch brand ────────────────────────────────────────────────────────
    const { data: brand, error: brandErr } = await serverClient
      .from('brands')
      .select('id, brand_name, domain, last_enriched_at, fit_score')
      .eq('id', brandId)
      .single()

    if (brandErr || !brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // ── Enrichment gate ────────────────────────────────────────────────────
    const enrichedAt = brand.last_enriched_at ? new Date(brand.last_enriched_at) : null
    const enrichStaleMs = ENRICH_STALENESS_DAYS * 24 * 3_600_000
    const needsEnrichment = !enrichedAt || Date.now() - enrichedAt.getTime() > enrichStaleMs

    if (needsEnrichment && brand.domain) {
      console.log(`[generate-pitch] Running enrichment for ${brand.brand_name}`)
      try {
        await enrich(brandId)
      } catch (enrichErr) {
        // Non-fatal: proceed without enrichment
        console.warn(`[generate-pitch] Enrichment failed for ${brand.brand_name}:`, enrichErr)
      }
    }

    // ── Find signal ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as { signalId?: string; angle?: PitchAngle }
    const { signalId: bodySignalId, angle } = body

    let signalId = bodySignalId
    if (!signalId) {
      const { data: latestSignal } = await serverClient
        .from('signals')
        .select('id')
        .eq('brand_id', brandId)
        .order('detected_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!latestSignal) {
        return NextResponse.json({
          error: `No signals found for ${brand.brand_name}. Run the scanner first to attach a signal.`
        }, { status: 400 })
      }
      signalId = latestSignal.id
    }

    // ── Generate draft ─────────────────────────────────────────────────────
    const result = await writeDraft(brandId, signalId!, angle)

    if (!result) {
      return NextResponse.json({
        error: `Pitch generation failed for ${brand.brand_name}. Check server logs for details.`
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      draftId: result.pitchDraftId,
      brandName: result.brandName,
      subject: result.subject,
      angle: result.angle,
      qualityScore: result.qualityScore,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[generate-pitch route]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
