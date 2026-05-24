/**
 * scripts/seed-test-signals.ts
 *
 * Inserts 5 hardcoded test brands + signals, runs enrichment and
 * draft-writer on each, then prints subject + first 30 words to the terminal.
 *
 * Usage (from repo root):
 *   npx tsx --env-file=apps/dashboard/.env.local scripts/seed-test-signals.ts
 */

import { supabase } from '@taylor-reach/db'
import { enrich } from '@taylor-reach/enrichment'
import { writeDraft } from '@taylor-reach/pitch'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function first30Words(text: string): string {
  return text.split(/\s+/).slice(0, 30).join(' ')
}

function banner(label: string) {
  const line = '═'.repeat(70)
  console.log(`\n${line}`)
  console.log(`  ${label}`)
  console.log(line)
}

function ok(msg: string) { console.log(`  ✓  ${msg}`) }
function info(msg: string) { console.log(`     ${msg}`) }
function warn(msg: string) { console.log(`  ⚠  ${msg}`) }

// ─── Test data ─────────────────────────────────────────────────────────────────

interface TestBrand {
  brand_name: string
  domain: string
  description: string
  categories: string[]
  size_band: 'startup' | 'small' | 'mid' | 'large'
  fit_score: number
}

interface TestSignal {
  brandKey: string          // matches TestBrand.domain
  signal_type: string
  headline: string
  raw_excerpt: string
  source: string
  source_url: string
}

const TEST_BRANDS: TestBrand[] = [
  {
    brand_name: 'Bobbie',
    domain: 'bobbie.com',
    description: 'USDA-certified organic infant and toddler formula brand. Direct-to-consumer subscription, clean-label ingredients, founded by moms.',
    categories: ['baby_formula', 'infant_nutrition', 'organic'],
    size_band: 'mid',
    fit_score: 87,
  },
  {
    brand_name: 'Lovevery',
    domain: 'lovevery.com',
    description: 'Developmental play kit subscription for ages 0–4. Evidence-based toy and activity sets designed by child development experts. Premium DTC brand.',
    categories: ['developmental_toys', 'baby_subscription', 'education'],
    size_band: 'mid',
    fit_score: 88,
  },
  {
    brand_name: 'Frida Mom',
    domain: 'fridamom.com',
    description: 'Postpartum and maternal recovery brand — no-nonsense products for the fourth trimester. Sister brand to FridaBaby.',
    categories: ['postpartum', 'maternal_health', 'self_care'],
    size_band: 'mid',
    fit_score: 86,
  },
  {
    brand_name: 'Lalo',
    domain: 'meetlalo.com',
    description: 'Modern direct-to-consumer baby gear brand — high chairs, play yards, bassinets. Design-forward, sustainability-conscious, strong DTC positioning.',
    categories: ['baby_gear', 'nursery', 'sleep'],
    size_band: 'small',
    fit_score: 83,
  },
  {
    brand_name: 'Maisonette',
    domain: 'maisonette.com',
    description: 'Curated premium children\'s boutique — luxury baby gear, clothing, and gifts. Registry-focused, editorial-driven, aspirational parent audience.',
    categories: ['luxury_baby', 'childrens_fashion', 'gifting'],
    size_band: 'mid',
    fit_score: 81,
  },
]

const TEST_SIGNALS: TestSignal[] = [
  {
    brandKey: 'bobbie.com',
    signal_type: 'product_launch',
    headline: 'Bobbie Launches Organic Toddler Formula, Expanding Beyond Infant Stage',
    raw_excerpt: 'Bobbie, the USDA-certified organic infant formula brand, announced this week the launch of its Organic Toddler Formula — a first-of-its-kind toddler nutrition offering designed to fill the gap between infant formula and whole foods. The new line features clean-label ingredients with no corn syrup solids, no palm oil, and no synthetic preservatives. Bobbie is targeting health-conscious millennial parents navigating the complex toddler nutrition market, building on its loyal subscriber base of over 200,000 families.',
    source: 'PR Newswire',
    source_url: 'https://www.prnewswire.com/news-releases/bobbie-toddler-formula-launch-2026',
  },
  {
    brandKey: 'lovevery.com',
    signal_type: 'funding_round',
    headline: 'Lovevery Closes $50M Series C Extension as Hiring Push Signals Major Expansion',
    raw_excerpt: 'Lovevery, the play-kit subscription company for developmentally-focused early learning, has closed a $50 million Series C extension. The capital will be used to expand curriculum development, scale its direct-to-consumer operations, and accelerate international growth. Over the past 60 days, Lovevery has posted 40+ open roles across product, pediatric development, and content marketing — signaling an aggressive push into creator partnerships and content-led growth ahead of the 2026 holiday season.',
    source: 'Crunchbase News',
    source_url: 'https://news.crunchbase.com/startups/lovevery-series-c-extension-2026',
  },
  {
    brandKey: 'fridamom.com',
    signal_type: 'campaign_launch',
    headline: 'Frida Mom Refreshes Postpartum Recovery Line With New Fourth Trimester Campaign',
    raw_excerpt: 'Frida Mom today unveiled a comprehensive refresh of its postpartum recovery product line, anchored by a new campaign called "The Fourth Trimester" that centers maternal recovery alongside newborn care. The campaign includes updated packaging, three new SKUs targeting C-section recovery and breastfeeding support, and a creator-led content series launching across Instagram and TikTok. The brand is actively expanding its influencer roster, with an emphasis on authentic postpartum voices and mom-to-mom storytelling.',
    source: 'PR Newswire',
    source_url: 'https://www.prnewswire.com/news-releases/frida-mom-fourth-trimester-2026',
  },
  {
    brandKey: 'meetlalo.com',
    signal_type: 'campaign_launch',
    headline: 'Lalo Launches "Sleep Is Everything" Campaign, Repositioning Brand Around Infant Sleep Identity',
    raw_excerpt: 'Lalo, the direct-to-consumer baby gear brand, is launching "Sleep Is Everything" — a campaign built around the idea that good sleep gear isn\'t just functional, it\'s identity-defining for modern parents. The campaign features minimalist creative direction, parent-forward storytelling, and a targeted influencer strategy among sleep-focused parenting creators. Lalo\'s Crib and Dream Bassinet are the hero products. The brand is looking for parenting experts and content creators whose audience skews expecting and new parents aged 28–38.',
    source: 'Motherly',
    source_url: 'https://www.mother.ly/baby/lalo-sleep-campaign-2026',
  },
  {
    brandKey: 'maisonette.com',
    signal_type: 'celebrity_moment',
    headline: 'Celebrity Baby Registry Reveal Puts Maisonette Back in Spotlight as Premium Gifting Destination',
    raw_excerpt: 'After a high-profile celebrity couple revealed their baby registry on Maisonette, the curated children\'s luxury retailer is seeing a surge in new customer registrations and a wave of media coverage. The registry — featuring items from Stokke, BÉABA, and Maisonette\'s own exclusive collections — drove significant social conversation about premium baby gifting. The moment reignited coverage of Maisonette\'s curation-first positioning and its editorial voice in the children\'s luxury market, coming just weeks ahead of its annual baby gift guide launch.',
    source: 'Page Six',
    source_url: 'https://pagesix.com/2026/05/21/celebrity-baby-registry-maisonette/',
  },
]

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  banner('SEED TEST SIGNALS — TaylorReach pipeline smoke test')

  // ── Step 0: get tenant ───────────────────────────────────────────────────────
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name')
    .limit(1)
    .single()

  if (tenantErr || !tenant) {
    console.error('❌  No tenant found. Run 003_seed_taylor.sql first.')
    process.exit(1)
  }

  ok(`Tenant: ${(tenant as any).name} (${(tenant as any).id.slice(0, 8)}…)`)

  const tenantId = (tenant as any).id

  // ── Step 1: upsert brands ────────────────────────────────────────────────────
  banner('STEP 1 — Upsert brands')

  const brandIds: Record<string, string> = {}

  for (const b of TEST_BRANDS) {
    const { data: existing } = await supabase
      .from('brands')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('domain', b.domain)
      .maybeSingle()

    if (existing) {
      brandIds[b.domain] = (existing as any).id
      ok(`${b.brand_name} already exists — skipping insert`)
      continue
    }

    const { data: created, error: insertErr } = await supabase
      .from('brands')
      .insert({
        tenant_id: tenantId,
        brand_name: b.brand_name,
        domain: b.domain,
        description: b.description,
        categories: b.categories,
        size_band: b.size_band,
        fit_score: b.fit_score,
        status: 'scoring',
        last_signal_at: new Date().toISOString(),
        conflict_flag: { is_competitor_of: [], blocked_until: null },
        voice_samples: [],
      })
      .select('id')
      .single()

    if (insertErr || !created) {
      console.error(`❌  Brand insert failed for ${b.brand_name}: ${insertErr?.message}`)
      process.exit(1)
    }

    brandIds[b.domain] = (created as any).id
    ok(`Created brand: ${b.brand_name} (${(created as any).id.slice(0, 8)}…)`)
  }

  // ── Step 2: insert signals ───────────────────────────────────────────────────
  banner('STEP 2 — Insert signals')

  const signalIds: Record<string, string> = {}

  for (const s of TEST_SIGNALS) {
    const brandId = brandIds[s.brandKey]

    // Check for existing signal by URL
    const { data: existing } = await supabase
      .from('signals')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('source_url', s.source_url)
      .maybeSingle()

    if (existing) {
      signalIds[s.brandKey] = (existing as any).id
      const b = TEST_BRANDS.find(b => b.domain === s.brandKey)!
      ok(`${b.brand_name} signal already exists — reusing`)
      continue
    }

    const brand = TEST_BRANDS.find(b => b.domain === s.brandKey)!

    const { data: created, error: insertErr } = await supabase
      .from('signals')
      .insert({
        tenant_id: tenantId,
        brand_id: brandId,
        source: s.source,
        source_url: s.source_url,
        signal_type: s.signal_type,
        brand_name: brand.brand_name,
        brand_domain: s.brandKey,
        headline: s.headline,
        raw_excerpt: s.raw_excerpt,
        niche_fit_score: brand.fit_score,
        detected_at: new Date().toISOString(),
        source_published_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), // 2 days ago
        metadata: {},
        raw_payload: {},
      })
      .select('id')
      .single()

    if (insertErr || !created) {
      console.error(`❌  Signal insert failed for ${brand.brand_name}: ${insertErr?.message}`)
      process.exit(1)
    }

    signalIds[s.brandKey] = (created as any).id
    ok(`Created signal: ${brand.brand_name} — ${s.signal_type}`)
  }

  // ── Step 3: enrichment ───────────────────────────────────────────────────────
  banner('STEP 3 — Enrichment (scrape + Haiku)')

  for (const b of TEST_BRANDS) {
    const brandId = brandIds[b.domain]
    info(`Enriching ${b.brand_name}…`)
    try {
      const result = await enrich(brandId)
      if (result) {
        ok(`${b.brand_name} enriched: fit=${result.fitScoreUpdated} contacts=${result.contactsFound}`)
      } else {
        warn(`${b.brand_name}: enricher returned null (non-fatal)`)
      }
    } catch (err) {
      warn(`${b.brand_name}: enrichment failed — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Step 4: draft writing ────────────────────────────────────────────────────
  banner('STEP 4 — Draft writing (Sonnet)')

  const drafts: { brand: string; subject: string; opening: string; score: number }[] = []

  for (const b of TEST_BRANDS) {
    const brandId = brandIds[b.domain]
    const signalId = signalIds[b.domain]

    info(`Writing pitch for ${b.brand_name}…`)
    try {
      // Check for existing draft
      const { data: existing } = await supabase
        .from('pitch_drafts')
        .select('id, subject, body_text, draft_quality_score')
        .eq('brand_id', brandId)
        .eq('selected_signal_id', signalId)
        .maybeSingle()

      if (existing) {
        const e = existing as any
        ok(`${b.brand_name}: using existing draft`)
        drafts.push({
          brand: b.brand_name,
          subject: e.subject,
          opening: first30Words(e.body_text),
          score: e.draft_quality_score,
        })
        continue
      }

      const result = await writeDraft(brandId, signalId)
      if (result) {
        ok(`${b.brand_name}: draft created (score=${result.qualityScore})`)
        drafts.push({
          brand: b.brand_name,
          subject: result.subject,
          opening: first30Words(result.bodyText),
          score: result.qualityScore,
        })
      } else {
        warn(`${b.brand_name}: writeDraft returned null`)
      }
    } catch (err) {
      warn(`${b.brand_name}: draft failed — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Step 5: print results ────────────────────────────────────────────────────
  banner('RESULTS — Subject + opening 30 words per draft')

  if (drafts.length === 0) {
    console.log('\n  No drafts produced.')
  } else {
    for (const d of drafts) {
      console.log(`\n  ┌─ ${d.brand.toUpperCase()}  (score=${d.score}/100)`)
      console.log(`  │  Subject: "${d.subject}"`)
      console.log(`  │  Opening: "${d.opening}…"`)
      console.log(`  └${'─'.repeat(66)}`)
    }
  }

  console.log(`\n  ${drafts.length}/${TEST_BRANDS.length} drafts written. Check the dashboard → Drafts tab.\n`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
