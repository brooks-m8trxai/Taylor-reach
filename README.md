# TaylorReach

Brand partnership engine for Taylor Humphrey (@thatsanicename). Surfaces brand opportunities from signals across press, social, and culture, generates personalized outreach in her voice, books warm replies onto her calendar.

Built by m8trx.ai.

## What this does

Every day the system:

1. **Scans** ~20 sources for fresh brand signals (product launches, campaigns, funding, celebrity moments, hiring signals, podcast guesting opportunities)
2. **Enriches** each surfaced brand with contacts, recent campaigns, voice samples, budget signals
3. **Scores** brands for fit against Taylor's niches and current partner conflicts
4. **Drafts** 2-3 angle options per high-fit brand and writes the pitch in her voice
5. **Queues** drafts for Taylor's one-click approval
6. **Sends** approved pitches via Gmail with proper warm-up, throttling, and CAN-SPAM compliance
7. **Follows up** on a touch 2 / touch 3 cadence, with auto-pause on reply
8. **Triages** inbound replies — classifies intent, drafts response, routes warm replies to Cal.com
9. **Reports** every morning with what to do, what's stalled, what's worth her attention

## Quick start

```bash
unzip taylor-reach.zip && cd taylor-reach

# Install (pnpm workspaces)
pnpm install

# Bootstrap Supabase
cd packages/db && pnpm supabase start && pnpm supabase db reset

# Set env vars
cp .env.example .env.local
# fill in: SUPABASE_URL, SUPABASE_SERVICE_KEY, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
#         ANTHROPIC_API_KEY, CAL_API_KEY (optional)

# Start the dashboard
cd apps/dashboard && pnpm dev
# open http://localhost:3000

# In Settings:
# - Connect Gmail OAuth
# - Verify SPF/DKIM/DMARC on the sending domain
# - Set CAN-SPAM physical address
# - Upload taylor_credibility.json (press, follower counts, current partners)
# - Configure niche pillars and target deal types
# - Configure Cal.com event types

# Run the first scan
> Run scanner now
```

## Tech stack

| Layer | Bootstrap | Paid upgrade |
|---|---|---|
| Database, auth | Supabase free | Supabase Pro ($25/mo) |
| Workflow | n8n self-hosted ($5/mo VPS) | n8n Cloud ($20/mo) |
| Dashboard | Next.js on Vercel hobby | Vercel Pro if traffic |
| Email | Gmail API + her domain | Same |
| Signals | RSS + Google Alerts + free Listen Notes | Apollo, Modash, Listen Notes paid, SimilarWeb |
| AI | Claude API (Sonnet drafts, Haiku triage) | Same |
| Booking | Cal.com free | Cal.com Pro |

Bootstrap cost: ~$5/mo (VPS for n8n) + Claude API usage.
Production cost at scale: ~$200-400/mo.

## Repo layout

```
.claude/agents/        Claude Code subagents (scanner, enricher, pitch, outreach, reply-triage, coordinator)
.claude/commands/      Slash commands for common operator tasks
apps/dashboard/        Next.js operator UI
apps/api/              API routes
packages/
  signals/             Scanner — RSS, press wires, IG, podcasts, celebrity feeds
  enrichment/          Apollo, IG, web scraping for brand data
  pitch/               Angle generator + draft writer + voice matcher
  compliance/          CAN-SPAM, dedupe, partner conflicts, sender reputation
  integrations/        Gmail, Cal.com, Apollo wrappers
  agents/              Shared runtime + Claude API client
  db/                  Supabase migrations + generated TS types
docs/
  taylor-voice.md      Voice guide for the pitch agent
  brand-rules.md       Scoring criteria
  signal-sources.md    All sources documented
  runbooks/            What to do when X breaks
workflows/             n8n workflow JSON
```

## Operating principles

- **Quality over volume.** 30-50 sends/week max. Templated slop burns reputation across the industry.
- **Every pitch references a real signal.** No specific signal → not ready to pitch.
- **Taylor reads every draft.** System drafts, human approves.
- **Never auto-reply to a brand.** Reply-triage drafts; she sends.
- **No Instagram DMs.** Email only.
- **Don't pitch a sponsor's competitor.** Hard rule.

## What this is NOT

- Not a "mass outreach" tool. If you want to send 500 templated emails, this is the wrong system.
- Not a Gmail replacement. It sends via her existing Gmail.
- Not negotiation software. Once a call is booked, Taylor closes.
- Not a media kit builder (though it does auto-update one based on current stats).

## Productization note

The architecture is multi-tenant from day one (every table has `tenant_id`, RLS enforced). Taylor is tenant #1, but this can become a m8trx.ai product for other influencers/experts later. The compliance gate, voice guide, and signal sources are all per-tenant configurable.
