/**
 * POST /api/admin/re-enrich-all
 *
 * Runs enrichment on every brand for the tenant and returns a summary report.
 * Throttles to avoid hammering external sites (1 brand at a time, 2s gap).
 *
 * Example response:
 *   {
 *     "ok": true,
 *     "report": [
 *       { "brand": "Bobbie", "contacts_before": 0, "contacts_after": 3, "badges": ["named","named","generic"] },
 *       ...
 *     ],
 *     "elapsed_seconds": 42
 *   }
 */

import { NextResponse } from 'next/server'
import { serverClient } from '@taylor-reach/db'
import { enrich } from '@taylor-reach/enrichment'
import { getTenantId } from '@/lib/tenant'

interface BrandReport {
  brand: string
  brand_id: string
  contacts_before: number
  contacts_after: number
  new_contacts: number
  badges: string[]
  fit_score: number | null
  error?: string
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST() {
  const start = Date.now()
  const tenantId = await getTenantId()

  if (!tenantId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Load all brands for this tenant
  const { data: brands } = await serverClient
    .from('brands')
    .select('id, brand_name, fit_score')
    .eq('tenant_id', tenantId)
    .order('fit_score', { ascending: false })

  if (!brands || brands.length === 0) {
    return NextResponse.json({ ok: true, report: [], elapsed_seconds: 0 })
  }

  console.log(`\n[re-enrich] ${'═'.repeat(60)}`)
  console.log(`[re-enrich] RE-ENRICHMENT REPORT — ${brands.length} brands`)
  console.log(`[re-enrich] ${'═'.repeat(60)}`)

  const report: BrandReport[] = []

  for (const brand of brands) {
    // Count contacts before
    const { count: countBefore } = await serverClient
      .from('brand_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)

    let result: Awaited<ReturnType<typeof enrich>> = null
    let errorMsg: string | undefined

    try {
      result = await enrich(brand.id)
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err)
      console.error(`[re-enrich] ${brand.brand_name}: FAILED — ${errorMsg}`)
    }

    // Count contacts after + fetch badges
    const { count: countAfter } = await serverClient
      .from('brand_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)

    const { data: contacts } = await serverClient
      .from('brand_contacts')
      .select('quality_badge')
      .eq('brand_id', brand.id)

    const badges = (contacts ?? []).map((c: any) => c.quality_badge ?? 'unverified')
    const newContacts = Math.max(0, (countAfter ?? 0) - (countBefore ?? 0))

    const row: BrandReport = {
      brand: brand.brand_name,
      brand_id: brand.id,
      contacts_before: countBefore ?? 0,
      contacts_after: countAfter ?? 0,
      new_contacts: newContacts,
      badges,
      fit_score: result?.fitScoreUpdated ?? brand.fit_score,
      ...(errorMsg ? { error: errorMsg } : {}),
    }

    report.push(row)
    console.log(`[re-enrich] ${brand.brand_name}: ${countBefore ?? 0} → ${countAfter ?? 0} contacts (+${newContacts}) badges=[${badges.join(',')}]`)

    // Polite delay between brands — don't hammer external sites
    await sleep(2000)
  }

  // Print summary table
  console.log(`\n[re-enrich] ${'═'.repeat(60)}`)
  console.log(`[re-enrich] ==== RE-ENRICHMENT REPORT ====`)
  for (const row of report) {
    const badgeSummary = row.badges.length > 0 ? row.badges.join(', ') : 'none'
    const line = `${row.brand}: ${row.contacts_before} → ${row.contacts_after} contacts (${row.badges.length > 0 ? badgeSummary : 'no contacts'})`
    console.log(`[re-enrich]   ${line}`)
  }
  const elapsed = Math.round((Date.now() - start) / 1000)
  console.log(`[re-enrich] Elapsed: ${elapsed}s`)
  console.log(`[re-enrich] ${'═'.repeat(60)}\n`)

  return NextResponse.json({ ok: true, report, elapsed_seconds: elapsed })
}
