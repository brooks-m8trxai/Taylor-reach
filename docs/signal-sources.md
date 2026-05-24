# Signal sources

Every signal source the scanner reads. When you add a source, document it here. When a source breaks, log it in `runbooks/source-failures.md`.

## Active sources — bootstrap tier (free)

### PR wires
| Source | URL | Notes | Cadence |
|---|---|---|---|
| PR Newswire | https://www.prnewswire.com/news-releases/news-releases-list/?category=family | Filter for: baby, infant, toddler, maternity, parent, newborn, postpartum, family, pregnancy. RSS available. | every 4h |
| Business Wire | https://www.businesswire.com/portal/site/home/news/?ndmConfigId=1000146&newsLang=en&beanID=2154326273&viewID=news_view&category=consumer | Same keyword filter. | every 4h |
| EIN Presswire | https://www.einpresswire.com/rss/parent-family/ | Lower signal-to-noise, but free and finds smaller DTC brands. | every 6h |

### Industry editorial
| Source | URL | Notes |
|---|---|---|
| Modern Retail | https://www.modernretail.co/feed/ | Best source for DTC parent-brand news. Read every post. |
| Glossy | https://www.glossy.co/feed/ | Beauty/fashion overlap — covers premium parent brands. |
| Adweek brand marketing | https://www.adweek.com/brand-marketing/feed/ | Campaign launches at scale. |
| The Toy Book | https://toybook.com/feed/ | Kids products, gift-guide windows. |
| Babylist editorial | https://www.babylist.com/hello-baby | Top of funnel for new parents — brand mentions here matter. |
| Romper | https://www.romper.com/rss | Parenting culture; Taylor has been in here before. |
| Motherly | https://www.mother.ly/feed/ | Same audience as Taylor's. |
| BabyCenter | https://www.babycenter.com/news | News + trends. |

### Funding + business signals
| Source | URL | Notes |
|---|---|---|
| Crunchbase News | https://news.crunchbase.com/feed/ | Filter for keywords: baby, infant, family, parenting, maternity, postpartum, kid. |
| TechCrunch | https://techcrunch.com/feed/ | Same filter — funded DTC parent brands often covered here first. |
| Inc. | https://www.inc.com/rss.xml | Smaller brand profiles + funding. |

### Celebrity / cultural moments (Taylor's unique edge)
| Source | URL | Notes |
|---|---|---|
| Page Six | https://pagesix.com/feed/ | Filter for: pregnancy, baby, named, name reveal, expecting. |
| People (parents tag) | https://people.com/tag/parents/feed/ | High signal for celeb baby moments. |
| Us Weekly | https://www.usmagazine.com/feed/ | Same filter. |
| Hollywood Bump | https://hollywoodbump.com/ | Scrape with Playwright, respectful rate limit. They literally track celebrity pregnancies. |

### Hiring signals
| Source | Method | Notes |
|---|---|---|
| LinkedIn jobs | Browser MCP fetch, rate-limited | Search query: ("influencer marketing" OR "creator marketing" OR "brand partnerships") AND (baby OR parenting OR maternity OR family). New jobs in last 7 days = high signal. |

### Podcasts
| Source | URL | Notes |
|---|---|---|
| Listen Notes search | https://www.listennotes.com/api/ | Free tier: 300 requests/month. Use for searching parenting podcasts + finding hosts. |

### Seasonal calendar (hardcoded, not a feed)
| Window | Pitch start | Pitch end | Categories |
|---|---|---|---|
| Mother's Day | Feb 1 | Mar 15 | All parent brands, gift-friendly products |
| Father's Day | Mar 15 | May 1 | Dad-focused brands, family lifestyle |
| Baby shower season | Mar 1 | May 31 | Registry-friendly brands |
| Back to school | Jun 1 | Aug 1 | Older-kid brands, family planning |
| Holiday gift guide | Jul 15 | Sep 30 | Major retailers, all parent categories |
| Black Friday / Cyber Monday | Sep 15 | Oct 31 | DTC brands with sale events |
| New Year / January parenting resolutions | Nov 15 | Dec 31 | Parenting apps, wellness, sleep training |

### Taylor's own press
| Source | Method | Notes |
|---|---|---|
| Google Alerts | Email-to-RSS | "Taylor Humphrey" baby names. Surface every hit. |
| Talkwalker Alerts | Free tier | Backup for Google Alerts coverage. |

## Active sources — paid tier (when keys present)

| Source | Cost | Adds |
|---|---|---|
| Apollo.io | $49+/mo | Real contact data + hiring signals + tech stack changes |
| Modash | $99+/mo | Deeper creator-partnership intel across IG/TikTok |
| Listen Notes paid | $30/mo | Unlimited podcast search + episode-level guesting matches |
| SimilarWeb basic | $125/mo | Ad spend signals — knowing who's actively buying ads = who has budget now |
| Muck Rack | $5k/yr | Journalist contact data for the earned-media angle |

## Brand watchlist (Taylor-specific, manual)

Independent of the above feeds, Taylor curates a watchlist of ~50-100 brands she's especially interested in. Stored in `brand_watchlist` table. For watchlist brands:
- IG account is polled every 6h
- Any new campaign / partner / launch is a high-priority signal
- LinkedIn page is checked weekly for hiring

## Filtering rules

After raw signals are pulled, every signal goes through:

1. **Brand extraction** — Haiku call to extract `{brand_name, domain, confidence}`. Confidence < 0.7 → needs_review.
2. **Niche fit** — Haiku scoring against Taylor's pillars. Score < 40 → discard. 40-65 → write but flag. 65+ → normal.
3. **Dedupe** — if signal exists for `(brand_domain, signal_type, source_published_at ± 24h)` → skip.
4. **Spam/PR-bot filter** — sources flagged as low-quality (cheap PR distribution, listicles) get a niche-fit penalty.

## Adding a new source

1. Add to this file (with URL, keyword filter, cadence).
2. Add a scraper module in `packages/signals/src/sources/`.
3. Wire into the daily n8n workflow.
4. Run for 7 days, manually review signal quality before trusting downstream.
