# TaylorReach

You are working on **TaylorReach** — a brand partnership engine for Taylor Humphrey (@thatsanicename), a professional baby namer with a substantial parenting-niche audience. Brooks (her brother) is building this. The system surfaces brand opportunities, generates personalized outreach, and books warm replies onto Taylor's calendar. Taylor closes deals herself.

## North star

Get **3-5 qualified brand replies per week** from highly personalized outreach to a curated set of brands in Taylor's niche. Quality over volume — never bulk-blast.

## Who Taylor is and what she's selling

- Professional baby namer; quasi-viral; press in major parenting outlets
- Niches: baby naming, pregnancy/expecting, modern parenting identity, family lifestyle
- Audience: expecting parents and new parents, mostly women 25-40, US + UK + AU
- What brands buy from her: paid IG/TikTok sponsorships, ambassador deals, podcast guesting, speaking, media features, gifted product features

## Non-negotiable rules

1. **Quality over volume.** Cap sends at 30-50 per week. Brand managers in this niche talk to each other; templated slop burns her reputation across the industry permanently. Better to send 20 great pitches than 200 mediocre ones.

2. **Every pitch must reference a specific, current, real thing about the brand.** Launch, campaign, funding round, recent creator partnership, celebrity moment — something. If the system has no specific signal on a brand, that brand is NOT ready to pitch. It goes into nurture, not into the send queue.

3. **Taylor reads every draft before it sends.** The system drafts; she approves with one click or edits. No auto-send, ever. (After 6+ months of trust we can revisit one specific high-confidence path — until then, every send needs human approval.)

4. **CAN-SPAM compliant on every send.** Physical address in footer. Working unsubscribe link. No deceptive headers. The compliance gate enforces this.

5. **Never pitch a current sponsor's direct competitor.** The dedupe rule is hard: load Taylor's active partners and her 90-day exclusivity windows. Cross-reference every brand before queueing.

6. **Never pitch the same brand twice in 90 days** unless they engaged. After a non-reply, the brand goes into a 90-day cooldown.

7. **FTC compliance reminders on go-live.** When a paid deal closes and Taylor's content goes live, the system reminds her about #ad / #sponsored disclosure requirements. (We don't enforce — that's her content workflow. We just remind.)

8. **No Instagram DMs.** Against ToS for business use, brand managers don't take IG DMs seriously, and IG account bans are catastrophic for an influencer. Email only.

9. **Sender reputation is sacred.** SPF/DKIM/DMARC must be live before any sending. Warm-up cap at 20 sends/day for first 14 days on a new sending address. The Gmail wrapper enforces this.

10. **No fake humanness.** The system can draft in her voice and reply-triage with AI, but never pretend to be Taylor in a live conversation. When a brand replies, the system drafts; she sends.

## Tech stack

- **Frontend**: Next.js 14+ (app router), TypeScript, Tailwind, shadcn/ui, lucide-react, Recharts
- **Backend**: Supabase (Postgres + Auth + RLS + Storage + Edge Functions)
- **Orchestration**: n8n self-hosted on a small VPS — runs the daily scan and the follow-up cadence
- **Agents**: Claude Code subagents (`.claude/agents/`) for stage-specific reasoning
- **Email**: Gmail API (OAuth) — sending from Taylor's verified domain
- **Booking**: Cal.com (free tier) embedded link
- **Signals (bootstrap)**: RSS feeds, Google Alerts, manual Crunchbase, free Listen Notes
- **Signals (paid)**: Apollo, Modash, ListenNotes paid, SimilarWeb basic
- **AI**: Claude API (Sonnet for drafts, Haiku for triage/classification)

## Repository layout

```
.claude/agents/        subagent prompts, one per pipeline stage
.claude/commands/      slash commands for common operator tasks
apps/dashboard/        Next.js operator UI (Taylor + Brooks log in here)
apps/api/              API routes (Supabase Edge Functions where possible)
packages/
  agents/              shared agent runtime + prompt templates
  signals/             scanner — RSS, Google Alerts, Crunchbase, IG, podcast feeds
  enrichment/          per-brand data pulling (Apollo, IG, web scrape)
  pitch/               angle generator + draft writer in Taylor's voice
  compliance/          CAN-SPAM gate, dedupe, partner-conflict checks
  integrations/        Gmail, Cal.com, Apollo, Modash wrappers
  db/                  Supabase migrations, generated TS types
docs/                  plain-language docs for operator + Taylor
workflows/             n8n workflow JSON, version-controlled
```

## Working principles

- **Signal-first thinking.** A brand is not "ready to pitch" unless we have a specific recent signal. Building this discipline into the system is the whole product. If you're tempted to lower the signal bar to fill the queue, the queue is correctly empty — fix the scanner instead.
- **Voice matters.** Drafts in Taylor's voice. Her voice is warm, expert, slightly witty, never desperate, never "honored to connect." Pull tone from her IG captions and recent press quotes — don't invent a voice.
- **Round every displayed number.** Currency uses `Intl.NumberFormat`, percentages get `.toFixed(1)`, integers get `Math.round()`.
- **Multi-tenant from day one.** Taylor is tenant #1, but the schema and RLS assume m8trx.ai will productize this for other influencers later. All tables have `tenant_id`.
- **Audit everything.** Every signal captured, every brand surfaced, every draft generated, every send, every reply, every booking — all logged. Taylor and Brooks need full visibility into what the system did and why.

## What I (Claude) should do at the start of any task

1. Read this file and any relevant subagent prompts.
2. Check `docs/taylor-voice.md` if the task touches drafting.
3. Check `docs/brand-rules.md` if the task touches scoring or filtering.
4. Ask Brooks (or Taylor, if she's in the seat) before assuming pitch angles, deal terms, or partner conflicts.

## What I should never do

- Send any email without an audit token from the compliance gate AND a human approval flag.
- Lower the signal threshold to fill an empty queue.
- Auto-reply to a brand reply (only draft for approval).
- Pitch competitors of Taylor's current partners.
- Use Instagram DMs, even for "warm" prospects.
- Invent press credentials, audience numbers, or partnerships in the pitch copy. If the system doesn't know it, the pitch doesn't claim it.
