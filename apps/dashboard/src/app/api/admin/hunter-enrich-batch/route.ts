/**
 * GET /api/admin/hunter-enrich-batch
 *
 * Controlled batch enrichment — runs Hunter on up to 5 priority brands per call.
 * Designed to be triggered manually via curl so credit burn is deliberate.
 *
 * Selection criteria:
 *   fit_score >= 90, brand_kind = 'brand', domain set,
 *   no existing Hunter contacts (confidence IS NOT NULL)
 *   → ordered by fit_score DESC, brand_name ASC, LIMIT 5
 *
 * Per brand:
 *   - hunterDomainSearch(domain, { type:'personal', limit:3 })
 *   - Verify the top-ranked result only (highest Hunter confidence score)
 *   - Save results 2 and 3 WITHOUT verifying:
 *       email_status = NULL  (no SMTP check attempted)
 *       quality_badge = 'unverified'
 *     Note: email_status='unverified' is not a valid schema value — the DB
 *     CHECK only allows deliverable|undeliverable|risky|unknown|accept_all.
 *     NULL is the correct representation of "not yet checked." The Verify
 *     button on the brand page calls Hunter for these on demand.
 *
 * Credit budget: 1 search + 1 verification per brand = 2 credits × 5 = 10 max.
 * Stops before each brand if searches_remaining < 4 OR verifications_remaining < 4.
 *
 * maxDuration: 240s — serial with 4s rate-limit gaps (~16s per brand).
 *
 * Response shape:
 * {
 *   brands_processed, contacts_added,
 *   credits_used: { searches, verifications },
 *   credits_remaining: { searches, verifications },
 *   brands_skipped_no_match, stopped_due_to_credits,
 *   brands: [ per-brand detail... ]
 * }
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
export const maxDuration = 240   // 4 min — 5 brands × ~16s each (search + verify + rate gaps)

// Stop before each brand if either credit type is this low
const MIN_SEARCHES_TO_PROCEED     = 4
const MIN_VERIFICATIONS_TO_PROCEED = 4

// Brands per run — keep small so you can watch what it finds before burning more
const BRANDS_PER_RUN = 5

// ─── Badge helpers ────────────────────────────────────────────────────────────

function badgeFromVerify(
  result: string,
  acceptAll: boolean,
  confidence: number,
): { badge: string; reason: string; rolePriority: number; emailStatus: string } {
  if (result === 'deliverable' && confidence >= 70) {
    return {
      badge: 'named',
      reason: `Hunter personal email, verified deliverable (confidence ${confidence})`,
      rolePriority: 1,
      emailStatus: 'deliverable',
    }
  }
  if (result === 'undeliverable') {
    return {
      badge: 'invalid',
      reason: 'Hunter returned undeliverable — do not send',
      rolePriority: 9,
      emailStatus: 'undeliverable',
    }
  }
  if (result === 'risky' || acceptAll) {
    return {
      badge: 'risky',
      reason: 'Hunter email — accept-all server, deliverability unverifiable',
      rolePriority: 7,
      emailStatus: 'risky',
    }
  }
  // deliverable but low confidence, or 'unknown'
  return {
    badge: 'unverified',
    reason: `Hunter email (confidence ${confidence}, inconclusive SMTP check)`,
    rolePriority: 3,
    emailStatus: result,   // 'unknown' or 'deliverable' with low confidence
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  const tenantId = await getTenantId()
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant configured.' }, { status: 400 })
  }
  if (!process.env.HUNTER_API_KEY) {
    return NextResponse.json({ error: 'HUNTER_API_KEY not set' }, { status: 400 })
  }

  // ── One-time credit snapshot ───────────────────────────────────────────────
  // Called once at the top — not inside the loop — to avoid burning rate-limit
  // slots on account-info calls between brands.
  const account = await hunterAccountInfo('[hunter-enrich-batch]')
  if (!account) {
    return NextResponse.json(
      { error: 'Could not reach Hunter API — check HUNTER_API_KEY' },
      { status: 502 },
    )
  }

  const startSearches = account.requests.searches.available
                      - account.requests.searches.used
  const startVerifies = account.requests.verifications.available
                      - account.requests.verifications.used

  console.log(
    `[hunter-enrich-batch] Credits at start — ` +
    `searches=${startSearches} verifications=${startVerifies}`,
  )

  // Immediate abort if already below threshold before starting
  if (startSearches < MIN_SEARCHES_TO_PROCEED || startVerifies < MIN_VERIFICATIONS_TO_PROCEED) {
    return NextResponse.json({
      brands_processed: 0,
      contacts_added: 0,
      credits_used: { searches: 0, verifications: 0 },
      credits_remaining: { searches: startSearches, verifications: startVerifies },
      brands_skipped_no_match: 0,
      stopped_due_to_credits: true,
      message:
        `Stopped before starting — searches_remaining=${startSearches}, ` +
        `verifications_remaining=${startVerifies} ` +
        `(threshold: searches≥${MIN_SEARCHES_TO_PROCEED}, verifies≥${MIN_VERIFICATIONS_TO_PROCEED})`,
    })
  }

  // ── Find eligible brands ───────────────────────────────────────────────────
  const { data: candidates, error: brandsErr } = await supabase
    .from('brands')
    .select('id, brand_name, domain, fit_score')
    .eq('tenant_id', tenantId)
    .eq('brand_kind', 'brand')
    .gte('fit_score', 90)
    .not('domain', 'is', null)
    .order('fit_score', { ascending: false })
    .order('brand_name', { ascending: true })
    .limit(50)   // fetch more than needed so we can filter out already-enriched ones

  if (brandsErr) {
    return NextResponse.json({ error: brandsErr.message }, { status: 500 })
  }

  // Remove brands that already have Hunter contacts
  const { data: alreadyEnriched } = await supabase
    .from('brand_contacts')
    .select('brand_id')
    .not('confidence', 'is', null)

  const enrichedIds = new Set((alreadyEnriched ?? []).map(r => r.brand_id as string))
  const toEnrich = (candidates ?? [])
    .filter(b => !enrichedIds.has(b.id))
    .slice(0, BRANDS_PER_RUN)   // hard cap per run

  console.log(
    `[hunter-enrich-batch] ${candidates?.length ?? 0} brand candidates, ` +
    `${toEnrich.length} eligible after filtering (cap=${BRANDS_PER_RUN})`,
  )

  if (toEnrich.length === 0) {
    return NextResponse.json({
      brands_processed: 0,
      contacts_added: 0,
      credits_used: { searches: 0, verifications: 0 },
      credits_remaining: { searches: startSearches, verifications: startVerifies },
      brands_skipped_no_match: 0,
      stopped_due_to_credits: false,
      message: 'No eligible brands found — all fit≥90 product brands already have Hunter contacts',
      brands: [],
    })
  }

  // ── Serial enrichment ─────────────────────────────────────────────────────
  let searchesUsed   = 0
  let verifiesUsed   = 0
  let contactsAdded  = 0
  let noMatchCount   = 0
  let stoppedEarly   = false

  type BrandRow = {
    brand: string
    domain: string
    fit_score: number
    emails_found: number
    contacts_added: number
    top_contact: { email: string; name: string | null; badge: string; verified: boolean } | null
    skipped_reason: 'no_personal_emails' | 'no_domain' | null
  }
  const brandRows: BrandRow[] = []

  for (const brand of toEnrich) {
    const searchesLeft  = startSearches  - searchesUsed
    const verifiesLeft  = startVerifies  - verifiesUsed

    if (searchesLeft < MIN_SEARCHES_TO_PROCEED || verifiesLeft < MIN_VERIFICATIONS_TO_PROCEED) {
      console.log(
        `[hunter-enrich-batch] Stopping before ${brand.brand_name} — ` +
        `searches_left=${searchesLeft} verifies_left=${verifiesLeft}`,
      )
      stoppedEarly = true
      break
    }

    const log = `[hunter-enrich-batch/${brand.brand_name}]`
    console.log(`${log} fit=${brand.fit_score} domain=${brand.domain}`)

    // ── Domain search ────────────────────────────────────────────────────────
    const emails = await hunterDomainSearch(brand.domain!, {
      type: 'personal',
      limit: 3,
      logPrefix: log,
    })
    searchesUsed++   // credit burned even on zero-result search

    if (emails.length === 0) {
      console.log(`${log} No personal emails found`)
      noMatchCount++
      brandRows.push({
        brand: brand.brand_name, domain: brand.domain!, fit_score: brand.fit_score ?? 0,
        emails_found: 0, contacts_added: 0, top_contact: null,
        skipped_reason: 'no_personal_emails',
      })
      continue
    }

    // Sort by confidence DESC — #1 is the one worth spending a verify credit on
    const sorted = [...emails].sort((a, b) => b.confidence - a.confidence)
    const [top, ...rest] = sorted

    console.log(
      `${log} ${emails.length} email(s) found — ` +
      sorted.map(e => `${e.value}(${e.confidence})`).join(', '),
    )

    // ── Verify top contact only ──────────────────────────────────────────────
    const verify = top
      ? await hunterEmailVerifier(top.value.toLowerCase(), log)
      : null
    if (verify) verifiesUsed++

    // ── Save all contacts ────────────────────────────────────────────────────
    let brandAdded = 0
    let topResult: BrandRow['top_contact'] = null

    for (const [idx, h] of sorted.entries()) {
      const email  = h.value.toLowerCase()
      const isTop  = idx === 0

      // Dedup — skip if this email already exists for this brand
      const { data: existing } = await supabase
        .from('brand_contacts')
        .select('id')
        .eq('brand_id', brand.id)
        .eq('email', email)
        .maybeSingle()

      if (existing) {
        console.log(`${log}   SKIP ${email} — already in DB`)
        continue
      }

      // ── Badge ──────────────────────────────────────────────────────────────
      let badge: string, reason: string, rolePriority: number, emailStatus: string | null

      if (isTop && verify) {
        const b = badgeFromVerify(verify.result, verify.accept_all, h.confidence)
        badge = b.badge; reason = b.reason; rolePriority = b.rolePriority
        emailStatus = b.emailStatus
      } else {
        // No verify attempted — leave email_status NULL (not 'unverified', which
        // isn't a valid value in the DB CHECK constraint)
        badge        = 'unverified'
        reason       = `Hunter personal email, not yet verified (confidence ${h.confidence})`
        rolePriority = 3
        emailStatus  = null
      }

      const verified = isTop && verify?.result === 'deliverable' && h.confidence >= 70

      const { error: insertErr } = await supabase
        .from('brand_contacts')
        .insert({
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
          email_status:  emailStatus,
        })

      if (insertErr) {
        console.error(`${log}   INSERT failed for ${email}: ${insertErr.message}`)
      } else {
        brandAdded++
        contactsAdded++
        console.log(
          `${log}   SAVED ${email} badge=${badge} verified=${verified} confidence=${h.confidence}` +
          (isTop && verify ? ` smtp=${verify.result}` : ' smtp=skipped'),
        )
        if (isTop) {
          topResult = {
            email,
            name: [h.first_name, h.last_name].filter(Boolean).join(' ') || null,
            badge,
            verified,
          }
        }
      }
    }

    brandRows.push({
      brand: brand.brand_name, domain: brand.domain!, fit_score: brand.fit_score ?? 0,
      emails_found: emails.length, contacts_added: brandAdded,
      top_contact: topResult, skipped_reason: null,
    })

    console.log(
      `${log} Done — ${brandAdded} contacts saved ` +
      `| run totals: searches=${searchesUsed} verifies=${verifiesUsed} contacts=${contactsAdded}`,
    )
  }

  // ── Response ───────────────────────────────────────────────────────────────
  return NextResponse.json({
    brands_processed:       brandRows.filter(r => r.skipped_reason === null).length,
    contacts_added:         contactsAdded,
    credits_used:           { searches: searchesUsed, verifications: verifiesUsed },
    credits_remaining:      {
      searches:      startSearches - searchesUsed,
      verifications: startVerifies - verifiesUsed,
    },
    brands_skipped_no_match: noMatchCount,
    stopped_due_to_credits:  stoppedEarly,
    brands:                  brandRows,
  })
}
