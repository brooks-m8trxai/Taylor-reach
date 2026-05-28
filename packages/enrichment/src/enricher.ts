/**
 * Brand enricher.
 *
 * Given a brand_id, fetches the brand's public web presence and extracts:
 *   - Description, categories, founded year, HQ
 *   - IG/TikTok handles
 *   - Budget signals (careers page, press mentions of ad spend)
 *   - Contact emails from homepage, footer, partnership-specific pages
 *   - about_summary: 2-3 sentence plain-prose brand description (for UI display)
 *
 * Contact discovery order:
 *   1. Homepage — mailto: links + footer + partnership anchor text
 *   2. Partnership-focused pages (parallel) — /partnerships, /influencers, etc.
 *   3. General info pages — /about, /team
 *   4. Apollo.io — org lookup → named contacts with verified emails
 *   5. Hunter.io — domain search for personal emails (with SMTP verification)
 *
 * If no domain is on file, falls back to a hardcoded list of known publishers.
 */

import * as cheerio from 'cheerio'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@taylor-reach/db'
import {
  apolloFindContacts,
  apolloTitlePriority,
  apolloSearchOrganization,
  hunterDomainSearch,
  hunterEmailVerifier,
  hunterAccountInfo,
} from '@taylor-reach/integrations'

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

/**
 * Extracts emails specifically from the <footer> element.
 * DTC brands often hide their PR/press email in footer links labelled
 * "Press" or "Media" — these get stripped out of rawText by the scraper
 * before analysis, so we need a dedicated footer pass.
 */
function extractFooterEmails(html: string): string[] {
  const $ = cheerio.load(html)
  const footerMailto = extractMailtoEmails($.html($('footer')) ?? '')
  const footerText   = $('footer').text().replace(/\s+/g, ' ')
  return filterUsableEmails([...footerMailto, ...extractTextEmails(footerText)])
}

/**
 * Scans homepage anchor tags for links whose visible text suggests a
 * partnership / press page. Returns internal paths ("/partnerships", etc.)
 * so the enricher can fetch those pages in a targeted second pass.
 *
 * Also returns any mailto: emails directly found in those anchors.
 */
const PARTNERSHIP_LINK_KEYWORDS = [
  'partnership', 'partnerships', 'collaborate', 'collaboration',
  'press inquiries', 'press inquiry', 'media kit', 'influencer',
  'creator', 'work with us', 'affiliate', 'wholesale',
]

function findPartnershipAnchors(html: string): { paths: string[]; emails: string[] } {
  const $ = cheerio.load(html)
  const paths: string[] = []
  const emails: string[] = []

  $('a[href]').each((_, el) => {
    const text = $(el).text().toLowerCase().trim()
    const href = $(el).attr('href') ?? ''

    if (!PARTNERSHIP_LINK_KEYWORDS.some(kw => text.includes(kw))) return

    if (href.startsWith('mailto:')) {
      const email = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase()
      if (email.includes('@')) emails.push(email)
    } else if (href.startsWith('/') && !href.startsWith('//')) {
      // Internal path — add to list for scraping
      paths.push(href.split('?')[0].split('#')[0])  // strip query/fragment
    }
  })

  return { paths: [...new Set(paths)], emails: filterUsableEmails([...new Set(emails)]) }
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
  /** Raw HTML of the homepage — kept for footer + partnership anchor analysis */
  homepageHtml: string
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
    homepageHtml: html,   // kept for footer + partnership-anchor analysis
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

  // ── Apollo org lookup — fills in gaps scraping couldn't get ─────────────
  // Skipped when APOLLO_DISABLED=true (env var) — set this when Apollo is
  // 422-ing on DTC brands and you want Hunter to carry the full load.
  // apolloSearchOrganization caches results in-memory, so repeat enrichments
  // cost 0 extra credits after the first run.
  let apolloOrg = null
  if (domain && !process.env.APOLLO_DISABLED) {
    apolloOrg = await apolloSearchOrganization(domain, '[enricher]')
  } else if (process.env.APOLLO_DISABLED) {
    console.log(`[enricher] Apollo disabled via APOLLO_DISABLED — skipping org lookup`)
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
  if (scraped?.igHandle)              updatePayload.ig_handle = `@${scraped.igHandle}`
  if (scraped?.tiktokHandle)          updatePayload.tiktok_handle = `@${scraped.tiktokHandle}`

  // Apollo org data fills in fields scraping couldn't get
  // (Haiku wins when it extracts something; Apollo is the fallback)
  if (!updatePayload.founded_year && apolloOrg?.founded_year)
    updatePayload.founded_year = apolloOrg.founded_year
  else if (haikuData?.founded_year)
    updatePayload.founded_year = haikuData.founded_year

  if (!updatePayload.hq_city && haikuData?.hq_city)
    updatePayload.hq_city = haikuData.hq_city
  if (!updatePayload.hq_country && haikuData?.hq_country)
    updatePayload.hq_country = haikuData.hq_country

  // Apollo employee count → size_band if Haiku didn't classify it
  if (!updatePayload.size_band && apolloOrg?.estimated_num_employees != null) {
    const emp = apolloOrg.estimated_num_employees
    updatePayload.size_band =
      emp < 10  ? 'startup'
      : emp < 50  ? 'small'
      : emp < 250 ? 'mid'
      : emp < 1000 ? 'large'
      : 'enterprise'
    console.log(`[enricher] Apollo employee count (${emp}) → size_band=${updatePayload.size_band}`)
  }

  // LinkedIn URL from Apollo (useful for prospecting)
  if (apolloOrg?.linkedin_url) updatePayload.linkedin_url = apolloOrg.linkedin_url

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

  // Collect all emails from every available source
  const emailSet = new Set<string>()

  // Source 1: mailto: links from homepage scrape
  if (scraped?.mailtoEmails?.length) {
    console.log(`[enricher/contacts] Homepage mailto: ${scraped.mailtoEmails.join(', ')}`)
    scraped.mailtoEmails.forEach(e => emailSet.add(e))
  } else {
    console.log(`[enricher/contacts] Homepage mailto: none`)
  }

  // Source 2: text-embedded emails from homepage body
  if (scraped?.contactEmail) {
    console.log(`[enricher/contacts] Homepage text email: ${scraped.contactEmail}`)
    emailSet.add(scraped.contactEmail)
  }

  if (domain && scraped?.homepageHtml) {
    // Source 3: footer emails — DTC brands often put press@ in the footer
    const footerEmails = extractFooterEmails(scraped.homepageHtml)
    if (footerEmails.length) {
      console.log(`[enricher/contacts] Footer emails: ${footerEmails.join(', ')}`)
      footerEmails.forEach(e => emailSet.add(e))
    }

    // Source 4: partnership-anchor link text detection — follow matched paths
    const { paths: anchorPaths, emails: anchorEmails } = findPartnershipAnchors(scraped.homepageHtml)
    anchorEmails.forEach(e => emailSet.add(e))
    if (anchorPaths.length) {
      console.log(`[enricher/contacts] Partnership anchors found: ${anchorPaths.join(', ')}`)
    }

    // Source 5: targeted pages — partnership-specific + general info pages.
    // Runs in parallel batches: partnership pages first (high probability for
    // DTC mom brands), then general info pages.
    //
    // Partnership pages: /partnerships /influencers /creators /collaborate
    //   /work-with-us /affiliate /press-room /wholesale /media /news
    //   + any additional paths found via anchor-text detection above.
    // General pages:  /about /team (kept — often have team email addresses)
    // Always check:   /contact /press (most brands have one of these)
    const PARTNERSHIP_PATHS = [
      '/partnerships', '/influencers', '/creators', '/collaborate',
      '/work-with-us', '/affiliate', '/press-room', '/wholesale',
      '/media', '/news',
    ]
    const GENERAL_PATHS = ['/contact', '/press', '/about', '/team']

    // Merge anchor-detected paths + known lists, dedup, exclude homepage
    const allPaths = [...new Set([
      ...PARTNERSHIP_PATHS,
      ...anchorPaths.filter(p => p.length > 1 && p !== '/'),
      ...GENERAL_PATHS,
    ])]

    console.log(`[enricher/contacts] Scraping ${allPaths.length} pages in parallel (6s timeout each)`)

    // Parallel fetch — all pages at once, shorter timeout than homepage
    const pageResults = await Promise.allSettled(
      allPaths.map(async path => {
        const html = await fetchPage(`https://${domain}${path}`, 6_000)
        if (!html) return { path, emails: [] as string[] }

        const pageMailto = extractMailtoEmails(html)
        const $ = cheerio.load(html)
        const pageText = $('body').text().replace(/\s+/g, ' ').slice(0, 2000)
        const textEmails = extractTextEmails(pageText)
        const footerFromPage = extractFooterEmails(html)
        const combined = filterUsableEmails([...pageMailto, ...textEmails, ...footerFromPage])
        return { path, emails: combined }
      }),
    )

    let totalPageEmails = 0
    for (const r of pageResults) {
      if (r.status === 'fulfilled' && r.value.emails.length) {
        console.log(`[enricher/contacts]   ${r.value.path}: ${r.value.emails.join(', ')}`)
        r.value.emails.forEach(e => emailSet.add(e))
        totalPageEmails += r.value.emails.length
      }
    }
    if (totalPageEmails === 0) {
      console.log(`[enricher/contacts]   No emails found in any secondary pages`)
    }
  }

  const usableEmails = [...emailSet]
  console.log(`[enricher/contacts] Scraped emails (unique): ${usableEmails.length > 0 ? usableEmails.join(', ') : 'NONE'}`)

  // Assemble candidate contacts
  type Candidate = {
    name: string | null
    title: string | null
    email: string
    source: string
    linkedinUrl?: string | null
    rolePriority?: number
    emailStatus?: string | null
    confidence?: number | null
    hunterResult?: string | null   // 'deliverable' | 'risky' | etc.
  }
  const candidates: Candidate[] = []

  for (const email of usableEmails) {
    candidates.push({ name: null, title: null, email, source: 'website' })
  }

  // ── Apollo contacts ────────────────────────────────────────────────────────
  // Two-step: org lookup (cached) → people by org_id. Falls back to domain search.
  // Skip entirely when APOLLO_DISABLED=true — Apollo 422s on most DTC brands
  // and Hunter covers that gap better.
  if (domain && !process.env.APOLLO_DISABLED) {
    console.log(`[enricher/contacts] Apollo: ${process.env.APOLLO_API_KEY ? 'enabled' : 'key not set'}`)
    if (process.env.APOLLO_API_KEY) {
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
  } else if (process.env.APOLLO_DISABLED) {
    console.log(`[enricher/contacts] Apollo disabled via APOLLO_DISABLED — skipping contact search`)
  }

  // ── Hunter contacts ────────────────────────────────────────────────────────
  // Domain search for personal emails (named contacts), followed by SMTP
  // verification of each result. Hunter's DTC database often covers brands
  // that Apollo misses.
  //
  // Verify cache: keyed by email, lives for the duration of this single
  // enrichment run. Prevents double-spending credits when the same address
  // appears from multiple sources (e.g. scraped homepage AND Hunter result).
  // On a cache hit the stored result is reused as-is — no second API call.
  if (domain && process.env.HUNTER_API_KEY) {
    // Log credit balance once per enrichment run so usage is visible
    await hunterAccountInfo('[enricher/contacts]')

    const hunterEmails = await hunterDomainSearch(domain, {
      type: 'personal',
      limit: 5,
      logPrefix: '[enricher/contacts]',
    })

    // Per-run verify cache: email → HunterVerifyResult
    // Keyed by lowercase email. If two sources produce the same address, the
    // first verification result wins — we deliberately don't call twice.
    // (Between-run flakiness is handled by the DB dedup check — once a
    // contact is saved it isn't re-saved, regardless of what Hunter returns
    // on the next enrichment run.)
    const runVerifyCache = new Map<string, { result: string; score: number } | null>()

    for (const h of hunterEmails) {
      const emailKey = h.value.toLowerCase()
      let verifyResult: string | null = null
      let verifyScore: number | null = null

      if (runVerifyCache.has(emailKey)) {
        // Cache hit — reuse previous result, no API call
        const cached = runVerifyCache.get(emailKey)
        verifyResult = cached?.result ?? null
        verifyScore  = cached?.score  ?? null
        console.log(`[enricher/contacts] verify cache hit: ${emailKey} → ${verifyResult} (score=${verifyScore})`)
      } else {
        const verify = await hunterEmailVerifier(emailKey, '[enricher/contacts]')
        verifyResult = verify?.result ?? null
        verifyScore  = verify?.score  ?? null
        // Store even if null so we don't retry a failed call either
        runVerifyCache.set(emailKey, verify ? { result: verify.result, score: verify.score } : null)
      }

      candidates.push({
        name: h.first_name && h.last_name ? `${h.first_name} ${h.last_name}`.trim() : null,
        title: h.position ?? null,
        email: emailKey,
        source: 'hunter',
        rolePriority: undefined,   // computed below from badge
        emailStatus: verifyResult,
        confidence: h.confidence,
        hunterResult: verifyResult,
      })
    }
  } else if (domain) {
    console.log(`[enricher/contacts] Hunter key not set — skipping Hunter domain search`)
  }

  console.log(`[enricher/contacts] Total candidates to attempt: ${candidates.length}`)

  let contactsFound = 0

  for (const c of candidates) {
    // Dedup check — match on email address regardless of source
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

    // Quality badge — Hunter results use hunter_result to determine badge
    let badge: string
    let reason: string
    if (c.source === 'hunter') {
      if (c.hunterResult === 'deliverable' && c.confidence != null && c.confidence >= 70) {
        badge = 'named'; reason = `Hunter personal email, verified deliverable (confidence ${c.confidence})`
      } else if (c.hunterResult === 'risky' || (c.source === 'hunter' && !c.hunterResult)) {
        badge = 'risky'; reason = `Hunter email — accept_all server, deliverability unverifiable`
      } else if (c.hunterResult === 'undeliverable') {
        badge = 'invalid'; reason = `Hunter returned undeliverable — do not send`
      } else {
        badge = 'unverified'; reason = `Hunter email (confidence ${c.confidence ?? '?'}, unverified)`
      }
    } else {
      const computed = computeContactQualityBadge(c.email, c.name, c.title, finalBrandKind, finalSizeBand)
      badge = computed.badge
      reason = computed.reason
    }

    const insertPayload: Record<string, unknown> = {
      brand_id: brandId,
      name: c.name,
      title: c.title,
      email: c.email,
      source: c.source,
      verified: (c.source === 'apollo' && c.emailStatus === 'verified')
             || (c.source === 'hunter' && c.hunterResult === 'deliverable'),
      quality_badge: badge,
      badge_reason: reason,
      role_priority: c.rolePriority
        ?? (badge === 'named' || badge === 'founder' ? 1
          : badge === 'role_based' ? 2
          : badge === 'editorial' ? 2
          : badge === 'generic' ? 5
          : badge === 'invalid' ? 9
          : 3),
    }
    if (c.linkedinUrl)    insertPayload.linkedin_url  = c.linkedinUrl
    if (c.emailStatus)    insertPayload.email_status  = c.emailStatus
    if (c.confidence != null) insertPayload.confidence = c.confidence

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
