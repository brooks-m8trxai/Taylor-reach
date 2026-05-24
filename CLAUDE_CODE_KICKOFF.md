# TaylorReach — Claude Code Kickoff

Paste this entire document into Claude Code after running `cd taylor-reach && claude` in the unzipped repo.

---

## Project context

I'm Brooks. I run m8trx.ai ("AI Operating System for Business"). I'm building TaylorReach for my sister Taylor Humphrey (@thatsanicename), a professional baby namer with serious press credibility and a substantial parenting-niche audience.

The system surfaces brand opportunities from signals across press, social, and culture, generates highly personalized outreach in her voice, and books warm replies onto her calendar. Taylor closes her own deals — the system's job ends at "qualified brand reply on her calendar."

This is also a productization play: it's Taylor's tool first, then a m8trx.ai SaaS for other expert/influencer creators later. Schema, RLS, and config are all multi-tenant from day one.

## Before you write any code

Read these in order:

1. `CLAUDE.md` — non-negotiable rules and architecture overview.
2. Every file in `.claude/agents/` — the six subagents (scanner, enricher, pitch, outreach, reply-triage, coordinator). When I ask you to do something that maps to one of them, invoke that subagent rather than acting directly.
3. `docs/taylor-voice.md` — her voice guide. Anything that touches drafting must respect this.
4. `docs/taylor_credibility.json` — verified press, audience, and credentials. The pitch agent is FORBIDDEN from claiming anything not in this file.
5. `docs/taylor-context.md` — her actual on-record quotes, thought leadership themes, target brand categories. Reference material for the pitch agent.
6. `docs/brand-rules.md` — fit scoring and routing rules.
7. `docs/signal-sources.md` — every source the scanner pulls from.
8. `packages/db/migrations/001_initial_schema.sql` — the full data model.
9. `packages/compliance/src/gate.ts` — the lightweight compliance gate.

After reading, give me a 5-bullet summary of what you understand the system to be plus anything you think is missing, wrong, contradictory, or risky. Do NOT write code yet.

## What's already in the repo

- `CLAUDE.md` — project memory
- `.claude/agents/` — six subagent prompts
- `docs/` — voice guide, brand rules, signal sources spec
- `packages/db/migrations/001_initial_schema.sql` — full Supabase schema with multi-tenant RLS
- `packages/compliance/src/gate.ts` — CAN-SPAM + dedupe + conflict + sender-reputation gate
- `packages/pitch/templates/` — sponsorship and podcast_guest templates (more to write)
- `apps/dashboard/src/app/layout.tsx`, `page.tsx`, `queue/page.tsx`, `components/sidebar.tsx` — dashboard skeleton with daily briefing and approval queue

## What you need to build

In this order, one phase at a time, confirming with me before moving to the next.

### Phase 1 — make it run locally

1. Root `package.json` with pnpm workspaces. Workspaces: `apps/*`, `packages/*`.
2. `pnpm-workspace.yaml`, `tsconfig.json` base, `.gitignore`, `.env.example`.
3. `apps/dashboard/package.json` with Next.js 14 app router, TypeScript, Tailwind, shadcn/ui, lucide-react, recharts, `@supabase/supabase-js`. Set up `tailwind.config.ts`, `postcss.config.js`, `globals.css` matching the dark aesthetic in the existing sidebar.
4. `packages/db/` — `package.json` with `@supabase/supabase-js`, generated types file, `client.ts` exporting server and browser clients.
5. `packages/compliance/package.json` with the types file the gate references.
6. `packages/integrations/package.json` with `googleapis`, `@cal/embed-core`, etc.
7. `packages/signals/package.json` with `rss-parser`, `cheerio`, `playwright`.
8. `packages/agents/package.json` with `@anthropic-ai/sdk`.
9. `packages/pitch/package.json`.
10. `packages/enrichment/package.json`.
11. Migration `002_rls_policies.sql` — finish RLS policies for every tenant-scoped table (only `brands` is sketched).

### Phase 2 — finish the dashboard

Build real working pages backed by Supabase (mock data is fine where the agents haven't been wired yet, but the schema and layout must be production-ready):

1. `/` — daily briefing. The skeleton exists. Implement `lib/briefing.ts` that aggregates from Supabase: sent yesterday, replies yesterday (split warm/cold), pipeline value, new high-signal brands, awaiting-reply queue, top 3 priorities, stalled deals.
2. `/queue` — approval queue. Skeleton exists. Wire the API routes `/api/drafts/[id]/approve` and `/api/drafts/[id]/reject`, plus a way to swap to an alternate angle.
3. `/inbox` — replies inbox with intent filters (warm / send-rates / not-now / not-a-fit / unclear). Click a reply → see original outbound thread + AI-drafted response + edit/send.
4. `/pipeline` — kanban board with brand cards by stage. Stages match `brands.status` enum.
5. `/brands` — searchable brand library. Filter by status, category, fit score, last-contact date. Click → brand detail page with all signals, contacts, prior conversations, recent campaigns, voice samples.
6. `/signals` — raw signal feed. Useful for Taylor to manually flag opportunities the system missed.
7. `/media-kit` — auto-generated media kit. Pulls from `taylor_credibility.json`. Per-pitch one-sheets are also generated here, customized with the brand's logo + tailored "why we're a fit" page.
8. `/calendar` — content commitments + pitch send windows + Cal.com bookings + seasonal pitch windows (Mother's Day, holiday gift guides, etc.).
9. `/analytics` — Recharts dashboards: sends/week, reply rate by source, reply rate by angle type, conversion rate by signal type, deal close rate, revenue by category.
10. `/settings` — Gmail OAuth connect (SPF/DKIM/DMARC verification status), niche pillars, deal types Taylor wants, Cal.com event-type mapping, CAN-SPAM physical address, daily send cap, current partners + exclusivity windows (drives conflict detection), credibility editor.

Use shadcn/ui components. Match the existing dark aesthetic. Round every displayed number per the design system.

### Phase 3 — make one end-to-end loop work

Pick three signal sources and build the full path from signal → enriched brand → fit score → draft → approval → send → reply → triage:

1. `packages/signals/src/sources/pr_newswire.ts` — RSS parser for PR Newswire filtered by baby/parent keywords.
2. `packages/signals/src/sources/crunchbase_news.ts` — RSS parser for funding rounds in parenting/family.
3. `packages/signals/src/sources/page_six_celebs.ts` — Page Six RSS filtered for pregnancy/baby moments.
4. `packages/signals/src/scanner.ts` — orchestrator that runs all sources, extracts brand names via Claude Haiku, scores niche fit, dedupes, writes to `signals` table.
5. `packages/enrichment/src/enricher.ts` — for each unique new brand in signals, builds the full brand record. Bootstrap mode: web fetch + LinkedIn public search via browser MCP (rate-limited). Skip Apollo until the API key is set.
6. `packages/pitch/src/angle_generator.ts` — given a brand + signals, generates 2-3 angles using Claude Sonnet.
7. `packages/pitch/src/draft_writer.ts` — picks the strongest angle, drafts the email using `docs/taylor-voice.md` + the right template from `packages/pitch/templates/`.
8. `packages/integrations/src/gmail.ts` — OAuth flow + send wrapper using the existing compliance gate. Throttling, warm-up, one-click unsubscribe headers (RFC 8058), audit-token header.
9. `packages/integrations/src/cal.ts` — Cal.com event creation + booking link generator.
10. `packages/agents/src/reply_triage.ts` — polls Gmail every 5min for new messages on threads we sent, classifies with Haiku, drafts response with Sonnet, writes to `replies`.
11. n8n workflow JSON in `workflows/`: daily-scanner.json, hourly-reply-poll.json, daily-briefing.json.
12. A "Run scanner now" button in the dashboard that kicks off the full loop manually.

After Phase 3 works locally with mock Gmail (sends logged to console + `outreach_events`), we'll connect real Gmail and run the first live test on 5-10 pre-vetted brands.

### Phase 4 — the polish layer

Don't start this until Phase 3 is working:

- Auto-updating media kit (pulls IG/TikTok stats weekly via official APIs)
- Per-pitch one-sheet generator (PDF with brand logo + tailored fit page)
- Seasonal pitch window automation (Mother's Day pitches queued in Feb, etc.)
- Brand watchlist polling (Taylor's manually curated list of 50-100 brands gets IG checked every 6h)
- Daily briefing email (sent at 7am her local time)
- Cal.com no-show + follow-up handling
- FTC #ad disclosure reminder when a deal goes live

## Working agreements

- **Ask before assuming.** If you need a deal-type pricing assumption, a voice tone judgment, a partner conflict interpretation — ask me.
- **Never bypass the compliance gate.** No "skip compliance for testing" flags. Write test fixtures that return `allow` instead.
- **One concern per commit.** Summarize each finished task in a single sentence so I can review small chunks.
- **Test the unhappy paths.** Gate must block the right things, not just allow. Write tests for blocked-cooldown, blocked-partner-conflict, blocked-opt-out, blocked-quiet-hours, blocked-daily-cap.
- **Round every displayed number.** Currency = `Intl.NumberFormat`, percentages = `.toFixed(1)`, integers = `Math.round()`.
- **No emoji** in code, comments, or UI strings.
- **No invented credentials in pitches.** If a press feature, follower count, or partnership isn't in `taylor_credibility.json`, the pitch agent can't use it.
- **Stop and ask** if you hit a question about Taylor's actual voice, her real press history, or her real audience numbers — I'll ask her directly.

## My current context

- Taylor and I are siblings; I run m8trx.ai. She's based in San Francisco.
- Her business: "What's in a Baby Name" (whatsinababyname.com), founded 2015.
- Real press she has (now in `taylor_credibility.json`): The New Yorker (the original 2022 viral profile), San Francisco Chronicle, New York Post, NZ Herald, Cosmopolitan, The Guardian, People, Tamron Hall, KTLA, KPIX, Access Hollywood, plus many others. She gets new press at least quarterly without paying for placement.
- Her socials: IG @whatsinababyname (~32K), TikTok @whatsinababynamedoula (~46K from 2022, likely materially higher now), X @babynamedoula. The audience numbers in `taylor_credibility.json` may be stale — confirm with Taylor before quoting specifics in any pitch.
- Her thought leadership themes (verified in `taylor-context.md`): family surnames as first names, celebrity effect on naming (Bieber → Jack), naming as personal branding, naming as cultural mirror, the "no mistakes in naming" mantra. The pitch agent should anchor angles to these where possible — she has earned the right to those positions on the record.
- **She has NO current brand partners and NO active exclusivity agreements.** This means the conflict-detection logic has nothing to block against — every otherwise-qualifying brand is open. As deals close, the system must update `current_brand_partners` and `exclusivity_windows`.
- **Doula context**: she's listed publicly as a doula and trained as one, but she does NOT currently take doula clients. It's an aspirational direction. The pitch agent must NOT cite doula credentials or experience. Reference her birth/pregnancy expertise through what she actually does — naming consults for expecting parents.
- **Strategic implication of no current partners**: The first ~3 months of pitches should weight slightly toward (a) gifted/ambassador deals over big paid sponsorships, and (b) speaking/podcast guesting over IG sponsorships. Reason: she needs to build a "recent partnership" track record to unlock the bigger paid deals later. The pitch agent should tag deal_type accordingly. We can shift to paid-sponsorship-heavy targeting once she has 3-5 brand partnerships closed.
- We don't yet have Apollo, Modash, Listen Notes paid, or SimilarWeb keys. Build to the interfaces; mock until those come online.
- We don't yet have a Cal.com paid account. Start with the free tier.
- Her sending domain is not yet authenticated. We'll do SPF/DKIM/DMARC before any live sends.

## Start here

Read the files in step 1-7 of "Before you write any code", then come back with your 5-bullet summary and any flags. Do NOT write code yet.

When I approve Phase 1, do those tasks one at a time, not "all of Phase 1 at once." The repo is small enough that I want to review each piece.

## A few specific risks to watch for as you build

1. **Pitch quality drift.** It's easy for the angle generator to slip toward generic phrasing when it runs out of signal context. Build a self-check step that fails the draft if it could be sent to a different brand by swapping the name.
2. **Sender reputation.** Gmail will throttle hard if we send too fast on a new domain. The warm-up logic in the gate is the safety net but the n8n workflow must respect it.
3. **Brand-name extraction errors.** Articles often mention multiple brands or use ambiguous names. Confidence < 0.7 → needs_review, not auto-pitch.
4. **Conflict detection blind spots.** If a current partner has exclusivity in "luxury strollers" and a new brand is "luxury baby carriers," is that a conflict? Be conservative — flag for operator review when categories are adjacent.
5. **Reply intent classification on subtle "no"s.** Brand managers say no politely. "Let's revisit in Q3" might be a real "circle back" OR a polite kill. Confidence < 0.7 → unclear → human reviews.
