/**
 * POST /api/admin/cleanup-off-niche
 *
 * One-time cleanup: removes brands that should never have been created
 * (slipped through the niche filter before it was added) along with their signals.
 *
 * Safe to run multiple times — brands not found are just skipped.
 */

import { NextResponse } from 'next/server'
import { serverClient } from '@taylor-reach/db'

const OFF_NICHE_BRAND_NAMES = [
  'Lärabar',
  'Larabar',
  'Lunchables',
  'HelloNation',
  'Hello Nation',
  'Hello Magazine',
  'Paris Baguette',
  'Kwench Juice Cafe',
  'Kwench',
]

export async function POST() {
  const report: { deleted: string[]; signalsDeleted: number; notFound: string[] } = {
    deleted: [],
    signalsDeleted: 0,
    notFound: [],
  }

  for (const brandName of OFF_NICHE_BRAND_NAMES) {
    // Find brand by name (case-insensitive)
    const { data: brands } = await serverClient
      .from('brands')
      .select('id, brand_name')
      .ilike('brand_name', brandName)

    if (!brands || brands.length === 0) {
      report.notFound.push(brandName)
      console.log(`[cleanup] "${brandName}" — not found, skipping`)
      continue
    }

    for (const brand of brands) {
      // Delete signals first (FK constraint)
      const { count: sigCount } = await serverClient
        .from('signals')
        .delete({ count: 'exact' })
        .eq('brand_id', brand.id)

      report.signalsDeleted += sigCount ?? 0
      console.log(`[cleanup] "${brand.brand_name}" — deleted ${sigCount ?? 0} signals`)

      // Delete the brand (cascades to contacts, campaigns)
      const { error } = await serverClient
        .from('brands')
        .delete()
        .eq('id', brand.id)

      if (error) {
        console.error(`[cleanup] Failed to delete "${brand.brand_name}": ${error.message}`)
      } else {
        report.deleted.push(brand.brand_name)
        console.log(`[cleanup] Deleted brand "${brand.brand_name}" (${brand.id})`)
      }
    }
  }

  console.log(`[cleanup] Done — deleted ${report.deleted.length} brands, ${report.signalsDeleted} signals`)

  return NextResponse.json({
    ok: true,
    deleted: report.deleted,
    signals_deleted: report.signalsDeleted,
    not_found: report.notFound,
  })
}
