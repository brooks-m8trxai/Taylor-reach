/**
 * Brand enricher.
 *
 * Given a brand_id, fetches the brand's public web presence and extracts:
 *   - Description, categories, founded year, HQ
 *   - IG/TikTok handles
 *   - Budget signals (careers page, press mentions of ad spend)
 *   - Primary contact email (from /contact page or site footer)
 *   - about_summary: 2-3 sentence plain-prose brand description (for UI display)
 *
 * If no domain is on file, falls back to a hardcoded list of known publishers
 * (inline copy here to avoid a circular dep with @taylor-reach/signals).
 *
 * If APOLLO_API_KEY is set, also queries Apollo for verified contact data.
 * Updates the brand row + inserts brand_contacts.
 */

import * as cheerio from 'cheerio'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@taylor-reach/db'
import { apolloFindContacts, apolloTitlePriority } from '@taylor-reach/integrations'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Inline publisher domain map ──────────────────────────────────────────────
// Mirrors packages/signals/src/publisher-list.ts — kept here to avoid circular
// dependency (signals → enrichment already exists).

const KNOWN_PUBLISHER_DOMAINS: Record<string, { domain: string; description: string }> = {
  motherly:          { domain: 'motherly.com',      description: 'Motherly is a digital media and wellness brand for modern mothers covering pregnancy, parenting, and maternal health, with a millennial and Gen-Z mom audience.' },
  'mother.ly':       { domain: 'motherly.com',      description: 'Motherly is a digital media and wellness brand for modern mothers covering pregnancy, parenting, and maternal health, with a millennial and Gen-Z mom audience.' },
  'cool mom picks':  { domain: 'coolmompicks.com',  description: 'Cool Mom Picks is an independent media brand recommending innovative products for modern parents, with a trend-forward, design-savvy mom audience.' },
  coolmompicks:      { domain: 'coolmompicks.com',  description: 'Cool Mom Picks is an independent media brand recommending innovative products for modern parents, with a trend-forward, design-savvy mom audience.' },
  'scary mommy':     { domain: 'scarymommy.com',    description: 'Scary Mommy is a parenting media brand known for raw, honest coverage of motherhood, reaching tens of millions of millennial moms monthly.' },
  scarymommy:        { domain: 'scarymommy.com',    description: 'Scary Mommy is a parenting media brand known for raw, honest coverage of motherhood, reaching tens of millions of millennial moms monthly.' },
  romper:            { domain: 'romper.com',         description: 'Romper is a digital media brand for millennial and Gen-Z parents covering pregnancy, newborn care, and early parenting with a culturally savvy voice targeting first-time parents.' },
  babylist:          { domain: 'babylist.com',       description: 'Babylist is the leading baby registry platform serving millions of expectant parents who are actively curating and purchasing newborn essentials.' },
  parents:           { domain: 'parents.com',        description: 'Parents is one of the largest US parenting media brands, covering child development, health, and family life for a mainstream parent audience across all stages.' },
  'parents magazine':{ domain: 'parents.com',        description: 'Parents is one of the largest US parenting media brands, covering child development, health, and family life for a mainstream parent audience across all stages.' },
  'the bump':        { domain: 'thebump.com',        description: 'The Bump is a pregnancy and new parent digital media brand serving expectant and new parents with week-by-week pregnancy tracking and expert advice.' },
  thebump:           { domain: 'thebump.com',        description: 'The Bump is a pregnancy and new parent digital media brand serving expectant and new parents with week-by-week pregnancy tracking and expert advice.' },
  babycenter:        { domain: 'babycenter.com',     description: 'BabyCenter is one of the world\'s largest pregnancy and parenting digital media brands, reaching over 100 million parents globally.' },
}

function resolvePublisherInfo(brandName: string): { domain: string; description: string } | null {
  return KNOWN_PUBLISHER_DOMAINS[brandName.toLowerCase().trim()] ?? null
}

// ─── Contact quality classification ──────────────────────────────────────────

type QualityBadge = 'named' | 'editorial' | 'founder' | 'role_based' | 'generic' | 'unverified'

function computeContactQualityBadge(
  email: string,
  name: string | null,
  title: string | null,
  brandKind: string,
  sizeBand: string | null,
): { badge: QualityBadge; reason: string } {
  const prefix = (email.split('@')[0] ?? '').toLowerCase()
  const titleLower = (title ?? '').toLowerCase()

  // Named person: firstname.lastname@ pattern AND marketing/partnerships title
  if (
    name
    && /^[a-z]+\.[a-z]+$/.test(prefix)
    && (titleLower.includes('partner') || titleLower.includes('influencer')
        || titleLower.includes('marketing') || titleLower.includes('creator'))
  ) {
    return { badge: 'named', reason: `named contact (${prefix}) with relevant title` }
  }

  // Editorial inbox at a publisher
  if (
    brandKind === 'publisher'
    && ['pitches', 'editorial', 'tips', 'story', 'press', 'contribute'].includes(prefix)
  ) {
    return { badge: 'editorial', reason: `editorial inbox at publisher: ${prefix}@` }
  }

  // Founder at a startup/small brand
  if (
    ['startup', 'small'].includes(sizeBand ?? '')
    && (prefix === 'founder' || titleLower.includes('founder')
        || titleLower.includes('ceo') || titleLower.includes('co-founder'))
  ) {
    return { badge: 'founder', reason: `founder contact at early-stage brand` }
  }

  // Role-based (acceptable targeted role)
  const ROLE_PREFIXES = ['partnerships', 'marketing', 'creators', 'influencer',
    'collab', 'collaborate', 'pr', 'media', 'brand', 'sponsorship']
  if (ROLE_PREFIXES.some(p => prefix.includes(p))) {
    return { badge: 'role_based', reason: `role-based inbox: ${prefix}@` }
  }

  // Generic inboxes at product brands (low value but keep)
  const GENERIC_PREFIXES = ['info', 'hello', 'contact', 'support', 'hi', 'team',
    'help', 'general', 'admin', 'office']
  if (GENERIC_PREFIXES.some(p => prefix === p) && brandKind !== 'publisher') {
    return { badge: 'generic', reason: `generic inbox: ${prefix}@ (low outreach priority)` }
  }

  return { badge: 'unverified', reason: `email found but not yet classified` }
}

// ─── Contact email extraction helpers ────────────────────────────────────────

/** Extracts emails from <a href="mailto:"> links — most reliable source. */
function extractMailtoEmails(html: string): string[] {
  const $ = cheerio.load(html)
  const emails: string[] = []
  $('a[href^="mailto:"], a[href^="MAILTO:"]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    const email = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase()
    if (email.includes('@') && email.includes('.')) emails.push(email)
  })
  return [...new Set(emails)]
}

/** Extracts emails from raw text via regex — fallback for text-embedded addresses. */
function extractTextEmails(text: string): string[] {
  const matches = text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g) ?? []
  return [...new Set(matches.map(e => e.toLowerCase()))]
}

/** Remove clearly junk emails (noreply, bounce, tracking pixels, etc.) */
function filterUsableEmails(emails: string[]): string[] {
  const JUNK_PREFIXES = [
    'noreply', 'no-reply', 'unsubscribe', 'donotreply', 'bounce',
    'postmaster', 'mailer-daemon', 'bounce', 'notifications', 'alerts',
  ]
  return emails.filter(e =>
    e.includes('@')
    && e.includes('.')
    && !JUNK_PREFIXES.some(p => e.startsWith(p + '@') || e.startsWith(p + '+'))
    && !e.includes('example.')
    && !e.includes('yoursite.')
    && !e.includes('domain.com'),
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnrichmentResult {
  brandId: string
  brandName: string
  domain: string | null
  description: string | null
  aboutSummary: string | null
  categories: string[]
  igHandle: string | null
  tiktokHandle: string | null
  foundedYear: number | null
  hqCity: string | null
  budgetSignalScore: number
  contactsFound: number
  fitScoreUpdated: number
}

// ─── HTTP fetch with timeout + UA ─────────────────────────────────────────────

async function fetchPage(url: string, timeoutMs = 10_000): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TaylorReachBot/1.0; research only)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    clearTimeout(timeout)
    if (!resp.ok) return null
    return await resp.text()
  } catch {
    return null
  }
}

// ─── Website scraping ─────────────────────────────────────────────────────────

interface ScrapedSite {
  metaDesc: string
  h1: string
  h2s: string[]
  igHandle: string | null
  tiktokHandle: string | null
  contactEmail: string | null
  /** All mailto: link emails found on this page */
  mailtoEmails: string[]
  hasCareerPage: boolean
  rawText: string
  /** Kept for backward compat — same as metaDesc */
  description: string
}

function scrapeWebsite(html: string, domain: string): ScrapedSite {
  const $ = cheerio.load(html)

  // Remove nav/footer boilerplate for cleaner text
  $('nav, footer, script, style, noscript').remove()

  const rawText = $('body').text().replace(/\s+/g, ' ').slice(0, 3000)

  // Structured metadata — more reliable than raw body text for sparse JS sites
  const metaDesc = (
    $('meta[property="og:description"]').attr('content')
    ?? $('meta[name="description"]').attr('content')
    ?? ''
  ).trim()

  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim().slice(0, 200)
  const h2s = $('h2')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter(Boolean)
    .slice(0, 4)

  // Social handles
  const allLinks = $('a[href]').map((_, el) => $(el).attr('href') ?? '').get()
  const igMatch = allLinks.find(href => href.includes('instagram.com/'))
  const ttMatch = allLinks.find(href => href.includes('tiktok.com/'))

  const igHandle = igMatch
    ? (igMatch.match(/instagram\.com\/@?([^/?#]+)/)?.[1] ?? null)
    : null
  const tiktokHandle = ttMatch
    ? (ttMatch.match(/tiktok\.com\/@?([^/?#]+)/)?.[1] ?? null)
    : null

  // Contact email — from mailto: links first (most reliable), then text regex
  const mailtoEmails = extractMailtoEmails(html)
  const textEmails = extractTextEmails(rawText)
  const allEmails = filterUsableEmails([...mailtoEmails, ...textEmails])
  // Prefer emails that match the brand's own domain over third-party addresses
  const domainHint = domain ? domain.split('.')[0] : null
  const contactEmail = domainHint
    ? allEmails.find(e => e.includes(domainHint)) ?? allEmails[0] ?? null
    : allEmails[0] ?? null

  const hasCareerPage = allLinks.some(href => /career|job|hiring|join.?us/i.test(href))

  return {
    metaDesc: metaDesc.slice(0, 400),
    description: metaDesc.slice(0, 400),   // backward compat
    h1,
    h2s,
    igHandle,
    tiktokHandle,
    contactEmail,
    mailtoEmails,
    hasCareerPage,
    rawText,
  }
}

// ─── About-summary generation (for UI display) ────────────────────────────────

async function generateAboutSummary(
  brandName: string,
  domain: string,
  scraped: ScrapedSite,
  knownDescription?: string,
): Promise<string | null> {
  // Build structured context for Haiku
  const contextParts: string[] = []
  if (scraped.metaDesc)     contextParts.push(`Meta description: ${scraped.metaDesc}`)
  if (scraped.h1)           contextParts.push(`Main headline: ${scraped.h1}`)
  if (scraped.h2s.length)   contextParts.push(`Section headings: ${scraped.h2s.join(' | ')}`)
  if (knownDescription)     contextParts.push(`Known description: ${knownDescription}`)
  const bodySnippet = scraped.rawText.slice(0, 700)
  if (bodySnippet.trim())   contextParts.push(`Page text excerpt: ${bodySnippet}`)

  if (contextParts.length === 0) return null

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 250,
      system: [
        'You summarize brands in 2-3 factual sentences for a PR strategist evaluating sponsorship potential.',
        'Cover: what they sell, who their customer is, and what makes them distinctive.',
        'Be specific. Write plain prose — no markdown, no bullets, no preamble.',
      ].join(' '),
      messages: [{
        role: 'user',
        content: `Brand: ${brandName}\nDomain: ${domain}\n\n${contextParts.join('\n')}\n\nWrite 2-3 sentences about this brand.`,
      }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    // Reject placeholder-ish responses
    if (
      text.length < 40
      || text.toLowerCase().includes("don't have sufficient")
      || text.toLowerCase().includes('i don\'t have')
    ) return null
    return text
  } catch (err) {
    console.error(`[enricher] About-summary generation failed for ${brandName}:`, err)
    return null
  }
}

// ─── Haiku enrichment extraction (brand profile) ──────────────────────────────

interface HaikuEnrichment {
  description: string
  categories: string[]
  founded_year: number | null
  hq_city: string | null
  hq_country: string | null
  audience_description: string
  budget_signal_score: number
  past_creator_tier: 'micro' | 'mid' | 'macro' | 'celebrity' | 'unknown'
  size_band: 'startup' | 'small' | 'mid' | 'large' | 'enterprise'
  fit_notes: string
}

async function extractWithHaiku(
  brandName: string,
  domain: string,
  siteText: string,
  hasCareerPage: boolean,
): Promise<HaikuEnrichment | null> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system: `You extract structured brand data from website text.
You are enriching a brand partnership database for a baby name consultant who partners with baby/parenting brands.
Respond with JSON only — no markdown, no commentary.`,
      messages: [{
        role: 'user',
        content: `Brand: ${brandName}
Domain: ${domain}
Career page found: ${hasCareerPage}
Website text (first 3000 chars):
${siteText}

Extract and return JSON:
{
  "description": "1-2 sentence brand description",
  "categories": ["baby gear", "maternity", etc — 1-4 categories from Taylor's niche pillar system],
  "founded_year": null or YYYY,
  "hq_city": "City" or null,
  "hq_country": "Country" or null,
  "audience_description": "who their customer is",
  "budget_signal_score": 0-100 (hiring for creator/influencer marketing = +30, funded in last year = +25, active ad presence = +20, career page exists = +15, otherwise 30),
  "past_creator_tier": "micro|mid|macro|celebrity|unknown" (their typical influencer partnership tier),
  "size_band": "startup|small|mid|large|enterprise",
  "fit_notes": "1 sentence on why or why not this brand fits Taylor's audience"
}`,
      }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as HaikuEnrichment
  } catch (err) {
    console.error(`[enricher] Haiku extraction failed for ${brandName}:`, err)
    return null
  }
}

// Apollo contact lookup is handled by @taylor-reach/integrations/apollo

// ─── Main enrichment function ──────────────────────────────────────────────────

export async function enrich(brandId: string): Promise<EnrichmentResult | null> {
  // Load brand from DB
  const { data: brand } = await supabase
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .single()

  if (!brand) {
    console.error(`[enricher] Brand ${brandId} not found`)
    return null
  }

  const brandName: string = (brand as any).brand_name
  let domain: string | null = (brand as any).domain ?? null

  // ── Domain fallback for known publishers ──────────────────────────────────
  const publisherInfo = resolvePublisherInfo(brandName)
  if (!domain && publisherInfo) {
    domain = publisherInfo.domain
    console.log(`[enricher] ${brandName}: domain resolved from publisher list → ${domain}`)
    // Save the domain to DB so future runs don't need the fallback
    await supabase.from('brands').update({ domain }).eq('id', brandId)
  }

  console.log(`[enricher] Enriching ${brandName} (${domain ?? 'no domain'})`)

  // ── Scrape website ────────────────────────────────────────────────────────
  let scraped: ScrapedSite | null = null
  let haikuData: HaikuEnrichment | null = null
  let aboutSummary: string | null = null

  if (domain) {
    const html = await fetchPage(`https://${domain}`)
    if (html) {
      scraped = scrapeWebsite(html, domain)

      // Also try /contact page for email
      if (!scraped.contactEmail) {
        const contactHtml = await fetchPage(`https://${domain}/contact`)
        if (contactHtml) {
          const contactScraped = scrapeWebsite(contactHtml, domain)
          scraped.contactEmail = contactScraped.contactEmail
        }
      }

      // Brand profile extraction (categories, size, budget signal, etc.)
      haikuData = await extractWithHaiku(brandName, domain, scraped.rawText, scraped.hasCareerPage)

      // About summary — separate Haiku call using structured metadata
      // Use known publisher description as additional context if available
      aboutSummary = await generateAboutSummary(
        brandName,
        domain,
        scraped,
        publisherInfo?.description ?? haikuData?.description,
      )
    } else {
      // Homepage fetch failed — use the known publisher description as fallback
      if (publisherInfo) {
        aboutSummary = publisherInfo.description
        console.log(`[enricher] ${brandName}: homepage fetch failed, using hardcoded description`)
      }
    }
  } else if (publisherInfo) {
    // No domain at all, but we know who they are
    aboutSummary = publisherInfo.description
    console.log(`[enricher] ${brandName}: no domain found, using hardcoded description`)
  }

  // ── Compute scores ────────────────────────────────────────────────────────
  const budgetScore = haikuData?.budget_signal_score ?? (scraped?.hasCareerPage ? 40 : 30)
  const categoryFitEst = (brand as any).fit_score ?? 60
  const pastCreatorTierScore = {
    micro: 60, mid: 80, macro: 100, celebrity: 100, unknown: 50,
  }[haikuData?.past_creator_tier ?? 'unknown'] ?? 50

  const updatedFitScore = Math.round(
    0.35 * categoryFitEst
    + 0.20 * 50
    + 0.15 * budgetScore
    + 0.15 * 80
    + 0.10 * pastCreatorTierScore
    + 0.05 * 70,
  )

  // ── Update brand in DB ────────────────────────────────────────────────────
  const updatePayload: Record<string, unknown> = {
    last_enriched_at: new Date().toISOString(),
    fit_score: updatedFitScore,
    status: updatedFitScore >= 75 ? 'enriched' : (brand as any).status,
    budget_signal_score: budgetScore,
    past_creator_tier: haikuData?.past_creator_tier ?? 'unknown',
    size_band: haikuData?.size_band ?? null,
  }

  if (haikuData?.description)          updatePayload.description = haikuData.description
  if (haikuData?.categories?.length)   updatePayload.categories = haikuData.categories
  if (haikuData?.founded_year)         updatePayload.founded_year = haikuData.founded_year
  if (haikuData?.hq_city)             updatePayload.hq_city = haikuData.hq_city
  if (haikuData?.hq_country)          updatePayload.hq_country = haikuData.hq_country
  if (scraped?.igHandle)              updatePayload.ig_handle = `@${scraped.igHandle}`
  if (scraped?.tiktokHandle)          updatePayload.tiktok_handle = `@${scraped.tiktokHandle}`

  // Write about_summary so the intelligence panel can display it immediately
  if (aboutSummary) updatePayload.about_summary = aboutSummary

  await supabase.from('brands').update(updatePayload).eq('id', brandId)

  // ── Save contacts ─────────────────────────────────────────────────────────
  // Fetch brand meta for quality classification (brand_kind, size_band)
  const { data: brandMeta } = await supabase
    .from('brands')
    .select('brand_kind, size_band')
    .eq('id', brandId)
    .single()
  const finalBrandKind = (brandMeta as any)?.brand_kind ?? 'brand'
  const finalSizeBand  = (brandMeta as any)?.size_band  ?? null

  console.log(`[enricher/contacts] ── Starting contact discovery for ${brandName} ──`)
  console.log(`[enricher/contacts] brand_id=${brandId}  domain=${domain ?? 'none'}`)

  // Collect all emails from every available page
  const emailSet = new Set<string>()

  // Source 1: mailto: links from homepage scrape
  if (scraped?.mailtoEmails?.length) {
    console.log(`[enricher/contacts] Homepage mailto: ${scraped.mailtoEmails.join(', ')}`)
    scraped.mailtoEmails.forEach(e => emailSet.add(e))
  } else {
    console.log(`[enricher/contacts] Homepage mailto: none`)
  }

  // Source 2: text-embedded emails from homepage
  if (scraped?.contactEmail) {
    console.log(`[enricher/contacts] Homepage text email: ${scraped.contactEmail}`)
    emailSet.add(scraped.contactEmail)
  }

  // Sources 3-6: additional pages likely to have contact info
  if (domain) {
    for (const path of ['/contact', '/about', '/team', '/press']) {
      console.log(`[enricher/contacts] Scraping ${domain}${path}`)
      const html = await fetchPage(`https://${domain}${path}`)
      if (!html) { console.log(`[enricher/contacts]   → not found / blocked`); continue }

      const pageMailto = extractMailtoEmails(html)
      const $ = cheerio.load(html)
      const pageText = $('body').text().replace(/\s+/g, ' ').slice(0, 3000)
      const pageText2 = extractTextEmails(pageText)
      const combined = filterUsableEmails([...pageMailto, ...pageText2])
      console.log(`[enricher/contacts]   ${path}: mailto=${pageMailto.join(',') || 'none'} text=${pageText2.join(',') || 'none'}`)
      combined.forEach(e => emailSet.add(e))
    }
  }

  const usableEmails = [...emailSet]
  console.log(`[enricher/contacts] Unique usable emails: ${usableEmails.length > 0 ? usableEmails.join(', ') : 'NONE'}`)
  console.log(`[enricher/contacts] Apollo key present: ${!!process.env.APOLLO_API_KEY}`)

  // Assemble candidate contacts
  type Candidate = {
    name: string | null
    title: string | null
    email: string
    source: string
    linkedinUrl?: string | null
    rolePriority?: number
    emailStatus?: string | null
  }
  const candidates: Candidate[] = []

  for (const email of usableEmails) {
    candidates.push({ name: null, title: null, email, source: 'website' })
  }

  // Apollo contacts — cross-references LinkedIn to find named partnership contacts
  if (domain) {
    const apolloContacts = await apolloFindContacts(domain, {
      logPrefix: '[enricher/contacts]',
      perPage: 5,
    })
    for (const c of apolloContacts) {
      if (c.email) {
        candidates.push({
          name: c.name ?? null,
          title: c.title ?? null,
          email: c.email.toLowerCase(),
          source: 'apollo',
          linkedinUrl: c.linkedin_url ?? null,
          rolePriority: apolloTitlePriority(c.title),
          emailStatus: c.email_status ?? null,
        })
      }
    }
  }

  console.log(`[enricher/contacts] Total candidates to attempt: ${candidates.length}`)

  let contactsFound = 0

  for (const c of candidates) {
    // Dedup check
    const { data: existing } = await supabase
      .from('brand_contacts')
      .select('id')
      .eq('brand_id', brandId)
      .eq('email', c.email)
      .maybeSingle()

    if (existing) {
      console.log(`[enricher/contacts] SKIP ${c.email} — already exists`)
      continue
    }

    // Quality badge
    const { badge, reason } = computeContactQualityBadge(
      c.email, c.name, c.title, finalBrandKind, finalSizeBand,
    )

    const insertPayload: Record<string, unknown> = {
      brand_id: brandId,
      name: c.name,
      title: c.title,
      email: c.email,
      source: c.source,
      // Apollo emails are pre-verified by their data; scraped ones are unverified
      verified: c.source === 'apollo' && (c.emailStatus === 'verified'),
      quality_badge: badge,
      badge_reason: reason,
      // Use Apollo's title-priority score if available, else compute from badge
      role_priority: c.rolePriority
        ?? (badge === 'named' || badge === 'founder' ? 1
          : badge === 'role_based' ? 2
          : badge === 'editorial' ? 2
          : badge === 'generic' ? 5
          : 3),
    }
    // Store LinkedIn URL if Apollo provided it
    if (c.linkedinUrl) insertPayload.linkedin_url = c.linkedinUrl

    console.log(`[enricher/contacts] INSERT: email=${c.email} badge=${badge} source=${c.source}`)
    const { error: insertErr } = await supabase.from('brand_contacts').insert(insertPayload)

    if (insertErr) {
      console.error(`[enricher/contacts] FAILED for ${c.email}: ${insertErr.message}`)
    } else {
      console.log(`[enricher/contacts] WROTE 1 row → ${c.email} (${badge})`)
      contactsFound++
    }
  }

  console.log(`[enricher/contacts] Done: ${contactsFound} contact(s) saved for ${brandName}`)
  console.log(`[enricher/contacts] ─────────────────────────────────────────────────`)

  const result: EnrichmentResult = {
    brandId,
    brandName,
    domain,
    description: haikuData?.description ?? null,
    aboutSummary,
    categories: haikuData?.categories ?? [],
    igHandle: scraped?.igHandle ?? null,
    tiktokHandle: scraped?.tiktokHandle ?? null,
    foundedYear: haikuData?.founded_year ?? null,
    hqCity: haikuData?.hq_city ?? null,
    budgetSignalScore: budgetScore,
    contactsFound,
    fitScoreUpdated: updatedFitScore,
  }

  console.log(`[enricher] ${brandName}: fit=${updatedFitScore} contacts=${contactsFound} about=${aboutSummary ? 'written' : 'none'}`)
  return result
}
