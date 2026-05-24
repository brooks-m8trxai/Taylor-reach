/**
 * POST /api/scan
 *
 * Runs the full scan → enrich → draft pipeline:
 *   1. Scanner pulls RSS feeds, calls Haiku to score signals, writes to DB
 *   2. For each new brand with fit >= 75, run enrichment
 *   3. For each enriched brand with fit >= 75 + a signal, write a pitch draft
 *
 * Returns a summary of what was found and created.
 * This route can take 60-120 seconds on a cold scan with many new brands.
 */

import { NextResponse } from 'next/server'
import { run as runScanner } from '@taylor-reach/signals'
import { enrich } from '@taylor-reach/enrichment'
import { writeDraft } from '@taylor-reach/pitch'
import { getTenantId } from '@/lib/tenant'
import { serverClient } from '@taylor-reach/db'

export const maxDuration = 300 // 5 min — scan can take a while

export async function POST() {
  const tenantId = await getTenantId()
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant configured. Run 003_seed_taylor.sql first.' }, { status: 400 })
  }

  const startedAt = Date.now()
  const log: string[] = []

  try {
    // ── Step 1: Scanner ─────────────────────────────────────────────────────
    log.push('Starting RSS scan...')
    const scanResult = await runScanner(tenantId)
    log.push(`Scan complete: ${scanResult.rawSignals} raw → ${scanResult.newSignals} new signals, ${scanResult.brandsCreated} brands created`)

    // ── Step 2: Enrich high-fit brands ──────────────────────────────────────
    const enrichResults: { brandId: string; fitScore: number; signalId: string | null }[] = []

    if (scanResult.highFitBrandIds.length > 0) {
      log.push(`Enriching ${scanResult.highFitBrandIds.length} brands with fit >= 75...`)

      for (const brandId of scanResult.highFitBrandIds) {
        try {
          const result = await enrich(brandId)
          if (result) {
            // Find the most recent signal for this brand
            const { data: signal } = await serverClient
              .from('signals')
              .select('id')
              .eq('brand_id', brandId)
              .order('detected_at', { ascending: false })
              .limit(1)
              .maybeSingle()

            enrichResults.push({
              brandId,
              fitScore: result.fitScoreUpdated,
              signalId: signal?.id ?? null,
            })
            log.push(`  ${result.brandName}: fit=${result.fitScoreUpdated} contacts=${result.contactsFound}`)
          }
        } catch (err) {
          log.push(`  Enrichment failed for ${brandId}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    // ── Step 3: Write pitch drafts ──────────────────────────────────────────
    const draftableItems = enrichResults.filter(r => r.fitScore >= 75 && r.signalId)
    let draftsCreated = 0

    if (draftableItems.length > 0) {
      log.push(`Writing ${draftableItems.length} pitch drafts...`)

      for (const item of draftableItems) {
        try {
          // Check if draft already exists for this brand+signal
          const { data: existing } = await serverClient
            .from('pitch_drafts')
            .select('id')
            .eq('brand_id', item.brandId)
            .eq('selected_signal_id', item.signalId!)
            .maybeSingle()

          if (existing) {
            log.push(`  Draft already exists for brand ${item.brandId}`)
            continue
          }

          const draft = await writeDraft(item.brandId, item.signalId!)
          if (draft) {
            draftsCreated++
            log.push(`  Draft created: "${draft.subject}" (score=${draft.qualityScore})`)
          }
        } catch (err) {
          log.push(`  Draft failed for ${item.brandId}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    const elapsed = Math.round((Date.now() - startedAt) / 1000)

    return NextResponse.json({
      ok: true,
      elapsed_seconds: elapsed,
      raw_signals: scanResult.rawSignals,
      new_signals: scanResult.newSignals,
      brands_created: scanResult.brandsCreated,
      brands_updated: scanResult.brandsUpdated,
      brands_enriched: enrichResults.length,
      drafts_created: draftsCreated,
      log,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.push(`FATAL: ${message}`)
    return NextResponse.json(
      { ok: false, error: message, log },
      { status: 500 },
    )
  }
}
