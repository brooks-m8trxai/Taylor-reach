/**
 * GET /api/admin/hunter-enrich-priority
 *
 * Bulk-enriches high-fit brands that have no Hunter contacts yet.
 *
 * Selection criteria:
 *   - fit_score >= 90
 *   - domain IS NOT NULL
 *   - no existing brand_contacts with confidence IS NOT NULL (i.e. no prior Hunter run)
 *   - ordered by fit_score DESC, brand_name ASC
 *
 * Per brand:
 *   - hunterDomainSearch(domain, { type:'personal', limit:3 })
 *   - Verify the #1 result only (highest Hunter confidence score)
 *   - Save all 3 contacts; the other 2 get email_status=null + badge='unverified'
 *
 * Stops early if remaining search credits drop below 5.
 *
 * Credit budget: 33 searches → ~10–11 brands at 3/brand.
 * maxDuration: 300s (rate limiter adds ~8s per brand: 4s search + 4s verify)
 */

import { NextResponse } from 'next/server'
import { supabase } from '@taylor-reach/db'
import {
  hunterAccountInfo,
  hunterDomainSearch,
  hunterEmailVerifier,
} from '@taylor-reach/integrations'
import { getTenantId } from '@/lib/tenant'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300   // 5 min — serial enrichment + rate limiter gaps

// ─── Credit threshold for early stop ─────────────────────────────────────────
// Stop before spending the last few credits. Keeps a small reserve for
// manual verification from the brand page.
const STOP_AT_SEARCHES_REMAINING = 5

// ─── Badge / role_priority from Hunter verify result ─────────────────────────

function hunterBadge(
  verifyResult: string | null,
  acceptAll: boolean,
  confidence: number,
): { badge: string; reason: string; rolePriority: number } {
  if (verifyResult === 'deliverable' && confidence >= 70) {
    return {
      badge: 'named',
      reason: `Hunter personal email, verified deliverable (confidence ${confidence})`,
      rolePriority: 1,
    }
  }
  if (verifyResult === 'undeliverable') {
    return {
      badge: 'invalid',
      reason: `Hunter returned undeliverable — do not send`,
      rolePriority: 9,
    }
  }
  if (verifyResult === 'risky' || acceptAll) {
    return {
      badge: 'risky',
      reason: `Hunter email — accept-all server, deliverability unverifiable`,
      rolePriority: 7,
    }
  }
  // Deliverable but low confidence, or unknown result
  return {
    badge: 'unverified',
    reason: `Hunter personal email (confidence ${confidence}, not verified)`,
    rolePriority: 3,
  }
}

function unverifiedBadge(confidence: number): { badge: string; reason: string; rolePriority: number } {
  return {
    badge: 'unverified',
    reason: `Hunter personal email, not yet verified (confidence ${confidence})`,
    rolePriority: 3,
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const tenantId = await getTenantId()
  if (!tenantId) {
    return NextResponse.json(
      { error: 'No tenant configured.' },
      { status: 400 },
    )
  }

  if (!process.env.HUNTER_API_KEY) {
    return NextResponse.json(
      { error: 'HUNTER_API_KEY not set' },
      { status: 400 },
    )
  }

  // ── Initial credit check ───────────────────────────────────────────────────
  const initialAccount = await hunterAccountInfo('[hunter-enrich-priority]')
  if (!initialAccount) {
    return NextResponse.json(
      { error: 'Hunter account info unavailable — check HUNTER_API_KEY' },
      { status: 502 },
    )
  }

  const initialSearches = initialAccount.requests.searches.available
                        - initialAccount.requests.searches.used
  const initialVerifies = initialAccount.requests.verifications.available
                        - initialAccount.requests.verifications.used

  console.log(
    `[hunter-enrich-priority] Starting — searches_remaining=${initialSearches} ` +
    `verifications_remaining=${initialVerifies}`,
  )

  if (initialSearches < STOP_AT_SEARCHES_REMAINING) {
    return NextResponse.json({
      ok: false,
      stopped_due_to_credit_limit: true,
      message: `Only ${initialSearches} search credits remaining — below threshold of ${STOP_AT_SEARCHES_REMAINING}`,
      credits_remaining: { searches: initialSearches, verifications: initialVerifies },
    })
  }

  // ── Find priority brands with no Hunter contacts ───────────────────────────
  const { data: allBrands, error: brandsErr } = await supabase
    .from('brands')
    .select('id, brand_name, domain, fit_score')
    .eq('tenant_id', tenantId)
    .gte('fit_score', 90)
    .not('domain', 'is', null)
    .order('fit_score', { ascending: false })
    .order('brand_name', { ascending: true })
    .limit(100)

  if (brandsErr) {
    return NextResponse.json({ error: brandsErr.message }, { status: 500 })
  }

  // Find brand IDs that already have Hunter contacts (confidence IS NOT NULL)
  const { data: alreadyEnriched } = await supabase
    .from('brand_contacts')
    .select('brand_id')
    .not('confidence', 'is', null)

  const enrichedSet = new Set((alreadyEnriched ?? []).map(r => r.brand_id as string))
  const toEnrich = (allBrands ?? []).filter(b => !enrichedSet.has(b.id))

  console.log(
    `[hunter-enrich-priority] ${(allBrands ?? []).length} brands fit_score≥90, ` +
    `${toEnrich.length} have no Hunter contacts yet`,
  )

  // ── Per-brand summary ──────────────────────────────────────────────────────
  type BrandResult = {
    brand: string
    domain: string
    fit_score: number
    emails_found: number
    contacts_added: number
    contacts_skipped_existing: number
    top_contact: { name: string | null; email: string; badge: string; verified: boolean } | null
    skipped_reason: string | null
  }

  const brandResults: BrandResult[] = []
  let searchesUsed   = 0
  let verifiesUsed   = 0
  let totalContacts  = 0
  let noMatchCount   = 0
  let stoppedEarly   = false

  // ── Serial enrichment loop ─────────────────────────────────────────────────
  for (const brand of toEnrich) {
    const remaining = initialSearches - searchesUsed

    // Route-level early stop (higher threshold than hunter.ts floor)
    if (remaining < STOP_AT_SEARCHES_REMAINING) {
      console.log(
        `[hunter-enrich-priority] Stopping — only ${remaining} searches left ` +
        `(threshold ${STOP_AT_SEARCHES_REMAINING})`,
      )
      stoppedEarly = true
      break
    }

    const log = `[hunter-enrich-priority/${brand.brand_name}]`
    console.log(`${log} Processing (fit=${brand.fit_score}, domain=${brand.domain})`)

    // Domain search — costs 1 search credit
    const emails = await hunterDomainSearch(brand.domain!, {
      type: 'personal',
      limit: 3,
      logPrefix: log,
    })

    if (emails.length === 0) {
      console.log(`${log} No personal emails found — skipping`)
      noMatchCount++
      brandResults.push({
        brand: brand.brand_name,
        domain: brand.domain!,
        fit_score: brand.fit_score ?? 0,
        emails_found: 0,
        contacts_added: 0,
        contacts_skipped_existing: 0,
        top_contact: null,
        skipped_reason: 'no_personal_emails_found',
      })
      searchesUsed++   // still burned a search credit even on miss
      continue
    }

    searchesUsed++

    // Sort by confidence DESC — highest confidence = most worth verifying
    const sorted = [...emails].sort((a, b) => b.confidence - a.confidence)
    const [topEmail, ...restEmails] = sorted

    // Verify only the top contact — saves verification credits
    let topVerify: Awaited<ReturnType<typeof hunterEmailVerifier>> = null
    if (topEmail) {
      topVerify = await hunterEmailVerifier(topEmail.value.toLowerCase(), log)
      if (topVerify) verifiesUsed++
    }

    // Save all contacts
    let contactsAdded = 0
    let contactsSkipped = 0
    let topResult: BrandResult['top_contact'] = null

    for (const [idx, h] of sorted.entries()) {
      const email = h.value.toLowerCase()
      const isTop = idx === 0

      // Dedup check
      const { data: existing } = await supabase
        .from('brand_contacts')
        .select('id')
        .eq('brand_id', brand.id)
        .eq('email', email)
        .maybeSingle()

      if (existing) {
        contactsSkipped++
        continue
      }

      // Badge + role_priority
      const { badge, reason, rolePriority } = isTop && topVerify
        ? hunterBadge(topVerify.result, topVerify.accept_all, h.confidence)
        : unverifiedBadge(h.confidence)

      const verified = isTop
        && topVerify?.result === 'deliverable'
        && h.confidence >= 70

      const insertPayload: Record<string, unknown> = {
        brand_id:      brand.id,
        name:          [h.first_name, h.last_name].filter(Boolean).join(' ') || null,
        title:         h.position ?? null,
        email,
        source:        'hunter',
        verified,
        quality_badge: badge,
        badge_reason:  reason,
        role_priority: rolePriority,
        confidence:    h.confidence,
        // Only the top contact has an email_status (was SMTP-checked)
        // The others are left null so the Verify button on the brand page works
        email_status:  isTop && topVerify ? topVerify.result : null,
      }

      const { error: insertErr } = await supabase
        .from('brand_contacts')
        .insert(insertPayload)

      if (insertErr) {
        console.error(`${log} INSERT failed for ${email}: ${insertErr.message}`)
      } else {
        contactsAdded++
        totalContacts++
        console.log(`${log} Saved ${email} (badge=${badge} verified=${verified})`)

        if (isTop) {
          topResult = {
            name:     insertPayload.name as string | null,
            email,
            badge,
            verified,
          }
        }
      }
    }

    brandResults.push({
      brand:                    brand.brand_name,
      domain:                   brand.domain!,
      fit_score:                brand.fit_score ?? 0,
      emails_found:             emails.length,
      contacts_added:           contactsAdded,
      contacts_skipped_existing: contactsSkipped,
      top_contact:              topResult,
      skipped_reason:           null,
    })

    console.log(
      `${log} Done — ${contactsAdded} contacts saved, ` +
      `searches_used_so_far=${searchesUsed} verifies_used_so_far=${verifiesUsed}`,
    )
  }

  // ── Final aggregate: verified named contacts across all processed brands ───
  const processedIds = brandResults
    .filter(r => r.contacts_added > 0)
    .map(r => {
      const brand = toEnrich.find(b => b.brand_name === r.brand)
      return brand?.id
    })
    .filter((id): id is string => !!id)

  let namedVerifiedTotal = 0
  if (processedIds.length > 0) {
    const { count } = await supabase
      .from('brand_contacts')
      .select('id', { count: 'exact', head: true })
      .in('brand_id', processedIds)
      .eq('quality_badge', 'named')
      .eq('verified', true)

    namedVerifiedTotal = count ?? 0
  }

  const creditsRemaining = {
    searches:      initialSearches      - searchesUsed,
    verifications: initialVerifies      - verifiesUsed,
  }

  return NextResponse.json({
    ok: true,
    summary: {
      brands_eligible:               toEnrich.length,
      brands_processed:              brandResults.filter(r => !r.skipped_reason).length,
      brands_skipped_no_match:       noMatchCount,
      contacts_added:                totalContacts,
      verified_named_contacts_added: namedVerifiedTotal,
      stopped_due_to_credit_limit:   stoppedEarly,
    },
    credits: {
      used:      { searches: searchesUsed, verifications: verifiesUsed },
      remaining: creditsRemaining,
    },
    brands: brandResults,
  })
}
