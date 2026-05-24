# Brand fit scoring

How the system decides which brands are worth pitching. The scoring runs after enrichment.

## Components (0-100 weighted)

### 1. Category fit — 35%

Does the brand's product category overlap with Taylor's niches?

Taylor's niche pillars:
- Baby naming + identity (her core)
- Pregnancy + expecting
- New parenthood (0-2 years)
- Modern parenting culture (lifestyle, not just gear)
- Family identity (extends to siblings, dynamics)

Per category fit:

| Category | Fit |
|---|---|
| Baby naming services, name-related products | 100 |
| Pregnancy products (maternity, postpartum, prenatal) | 95 |
| Baby gear (strollers, monitors, carriers, sleep) | 90 |
| Baby/kid food + nutrition | 85 |
| Parenting apps + digital subscriptions | 85 |
| Maternity fashion + postpartum body care | 85 |
| Premium / luxury baby brands | 80 |
| Family clothing (matching, sibling, gender-neutral) | 80 |
| Kids products (3+ years) | 60 |
| Home & lifestyle for new parents (kitchen, organization) | 65 |
| Health insurance, doula services, parent support | 70 |
| Beauty / skincare with motherhood angle | 65 |
| General DTC women's brands (not parenting-specific) | 35 |
| Anything else | < 30 → discard |

### 2. Signal recency — 20%

How fresh is the most recent signal?

| Signal age | Score |
|---|---|
| Within 7 days | 100 |
| 7-14 days | 75 |
| 14-30 days | 40 |
| > 30 days | 15 (likely missed the window) |

Multiple recent signals stack: a brand with 3 fresh signals scores higher than one with 1. Cap stack at +20.

### 3. Budget signal — 15%

Does the brand have money to spend on influencer marketing?

Score from `budget_signal_score` in enrichment:
- Recent funding round (last 12 months): +30 base
- Hiring for influencer/creator marketing roles: +25
- Active paid social ads (per SimilarWeb if available): +20
- Has an agency of record listed in trade press: +15
- Past creator partnerships at Taylor's tier or above: +10

### 4. Audience overlap — 15%

Does this brand's customer match Taylor's audience?

- Same demographic (women 25-40, expecting + new parents): 100
- Adjacent (parents of older kids, expecting parents only, etc.): 70
- Tangential (general women, general lifestyle): 40
- Mismatched (men's products, B2B): 10

This uses brand categories + their recent campaign creative imagery (when the enricher pulls voice samples).

### 5. Past creator partnership tier — 10%

Has the brand worked with creators at Taylor's level or above?

| Last creator partner tier | Score |
|---|---|
| Macro / celebrity (100k+ followers, paid) | 100 |
| Mid-tier (25k-100k, paid) | 80 |
| Micro (< 25k, paid or gifted) | 60 |
| Gifted only / no creator history | 30 |
| Unknown | 50 (neutral) |

### 6. Uniqueness — 5%

Is this a brand 200 other creators are pitching today, or one Taylor could meaningfully own?

- Hyped DTC darling with huge press right now: 30 (everyone is pitching them)
- Mid-attention, growing: 70
- Quiet but well-funded, low-creator-noise: 100

## Composite

```
fit_score =
    0.35 * category_fit
  + 0.20 * signal_recency
  + 0.15 * budget_signal
  + 0.15 * audience_overlap
  + 0.10 * past_creator_tier
  + 0.05 * uniqueness
```

## Routing by score

- **< 60** → discard. Do not pitch. Do not nurture.
- **60-74** → queue for operator review. Don't auto-draft. Maybe pitch with a strong angle.
- **75-89** → auto-draft pitch. Goes to approval queue.
- **90+** → auto-draft + priority flag. Top of the next day's briefing.

## Override rules

- `conflict_flag.blocked_until > today` → blocked regardless of score.
- Brand opted out → blocked permanently.
- Brand in 90-day cooldown from prior non-reply → blocked until cooldown ends.
- Brand has active deal in `deals` → blocked from re-pitch until deal closes.

## Re-scoring

Brands get re-scored when:
- A new signal arrives (might bump up to drafting threshold)
- Enrichment refreshes (every 60 days)
- Taylor's credibility or audience numbers update (changes audience_overlap relativity)
- A current partner exclusivity ends (changes conflict_flag)
