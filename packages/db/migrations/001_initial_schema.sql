-- TaylorReach — Supabase schema v1
-- Multi-tenant from day one. Every queryable table has tenant_id + RLS.
-- Table order matters: referenced tables must be created before referencing ones.

-- ============================================================================
-- TENANTS
-- ============================================================================
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references auth.users(id),
  data_tier text not null default 'bootstrap' check (data_tier in ('bootstrap', 'paid')),
  niche_pillars text[] not null default '{}',
  physical_address text not null,
  unsubscribe_url text not null,
  from_address text not null,
  domain text not null,
  daily_send_cap int not null default 30,
  warmup_started_at timestamptz,
  sender_reputation text default 'new' check (sender_reputation in ('new','warming','warm','established')),
  brand_voice_doc text,
  cal_links jsonb default '{}',
  credibility jsonb default '{
    "press": [],
    "ig_followers": 0,
    "tiktok_followers": 0,
    "newsletter_subscribers": 0,
    "current_partners": [],
    "past_press_features": []
  }',
  created_at timestamptz default now()
);

-- ============================================================================
-- BRANDS — enriched brand records (must be before signals)
-- ============================================================================
create table brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  brand_name text not null,
  domain text,
  ig_handle text,
  tiktok_handle text,
  description text,
  categories text[] not null default '{}',
  founded_year int,
  hq_city text,
  hq_country text,
  size_band text check (size_band in ('startup','small','mid','large','enterprise')),
  funding_signal jsonb,
  voice_samples text[] default '{}',
  past_creator_tier text check (past_creator_tier in ('micro','mid','macro','celebrity','unknown')),
  budget_signal_score int check (budget_signal_score between 0 and 100),
  fit_score int check (fit_score between 0 and 100),
  conflict_flag jsonb default '{"is_competitor_of":[],"blocked_until":null}',
  status text not null default 'new' check (status in (
    'new','scoring','enriched','queued','pitched','replied_warm','replied_send_more',
    'call_booked','negotiating','deal_won','deal_live','closed_lost','nurture','opted_out','blocked'
  )),
  last_signal_at timestamptz,
  last_enriched_at timestamptz,
  last_contacted_at timestamptz,
  next_recheck_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, domain)
);

create index idx_brands_tenant_status on brands(tenant_id, status);
create index idx_brands_tenant_fit on brands(tenant_id, fit_score desc) where status in ('enriched','queued');

create table brand_contacts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text,
  title text,
  email text,
  linkedin_url text,
  role_priority int check (role_priority between 1 and 5),
  source text,
  verified boolean default false,
  created_at timestamptz default now()
);

create index idx_brand_contacts_brand on brand_contacts(brand_id);

create table brand_recent_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  campaign_name text,
  launched_at date,
  tagline text,
  creator_partners jsonb default '[]',
  source_url text,
  captured_at timestamptz default now()
);

-- ============================================================================
-- SIGNALS — raw scanner output (after brands so brand_id FK resolves)
-- ============================================================================
create table signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  source text not null,
  source_url text,
  signal_type text not null check (signal_type in (
    'product_launch','campaign_launch','funding_round','creator_partnership',
    'celebrity_moment','editorial_mention','hiring_signal','podcast_episode',
    'seasonal_window','taylor_press_hit'
  )),
  brand_name text not null,
  brand_handle text,
  brand_domain text,
  brand_id uuid references brands(id),
  headline text not null,
  raw_excerpt text,
  niche_fit_score int check (niche_fit_score between 0 and 100),
  needs_review boolean default false,
  detected_at timestamptz default now(),
  source_published_at timestamptz,
  metadata jsonb default '{}',
  raw_payload jsonb default '{}'
);

create index idx_signals_tenant_brand on signals(tenant_id, brand_id);
create index idx_signals_tenant_detected on signals(tenant_id, detected_at desc);
create index idx_signals_brand_domain on signals(brand_domain);

-- ============================================================================
-- PITCH DRAFTS
-- ============================================================================
create table pitch_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade not null,
  contact_id uuid references brand_contacts(id),
  selected_signal_id uuid references signals(id),
  deal_type text not null check (deal_type in (
    'sponsorship','partnership','podcast_guest','speaking','media','gifted','ambassadorship'
  )),
  angle_used text not null check (angle_used in (
    'launch','campaign_echo','competitor','seasonal','cultural','earned','podcast'
  )),
  alternate_angles jsonb default '[]',
  subject text not null,
  body_text text not null,
  body_html text,
  recommended_send_at timestamptz,
  one_sheet_url text,
  draft_quality_score int check (draft_quality_score between 0 and 100),
  reasoning text,
  status text not null default 'awaiting_approval' check (status in (
    'awaiting_approval','approved','rejected','edited','sent','expired'
  )),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index idx_pitch_drafts_tenant_status on pitch_drafts(tenant_id, status);

-- ============================================================================
-- OUTREACH EVENTS — every send, every reply
-- ============================================================================
create table outreach_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade not null,
  pitch_draft_id uuid references pitch_drafts(id),
  thread_id text,
  message_id text,
  audit_token uuid,
  channel text not null default 'email',
  direction text not null check (direction in ('outbound','inbound')),
  touch_number int,
  subject text,
  body_text text,
  status text default 'queued' check (status in ('queued','sent','delivered','opened','replied','bounced','failed','complained')),
  sent_at timestamptz,
  scheduled_next_touch_at timestamptz,
  created_at timestamptz default now()
);

create index idx_outreach_brand on outreach_events(brand_id, created_at desc);
create index idx_outreach_tenant_sent on outreach_events(tenant_id, sent_at desc);

create table replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade not null,
  outreach_event_id uuid references outreach_events(id),
  raw_content text not null,
  from_email text,
  received_at timestamptz default now(),
  intent text check (intent in (
    'warm_interested','warm_send_more','request_intro_call',
    'not_now','not_a_fit','wrong_person','auto_reply','unsubscribe','unclear'
  )),
  intent_confidence numeric(3,2),
  draft_response jsonb,
  needs_operator_review boolean default true,
  resolved boolean default false,
  resolved_at timestamptz
);

create index idx_replies_tenant_unresolved on replies(tenant_id) where resolved = false;

create table opt_outs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  brand_id uuid references brands(id),
  contact_email text not null,
  recorded_at timestamptz default now()
);

-- ============================================================================
-- DEALS — once a call is booked
-- ============================================================================
create table deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade not null,
  deal_type text not null,
  estimated_value_usd numeric(10,2),
  actual_value_usd numeric(10,2),
  status text not null default 'discussion' check (status in (
    'discussion','negotiation','agreed','live','completed','cancelled'
  )),
  deliverables jsonb default '[]',
  go_live_date date,
  ftc_disclosure_reminded boolean default false,
  exclusivity_categories text[] default '{}',
  exclusivity_end_date date,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================================
-- NURTURE QUEUE — brands to re-check later
-- ============================================================================
create table nurture_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade not null,
  reason text,
  recheck_at timestamptz not null,
  resolved boolean default false,
  created_at timestamptz default now()
);

create index idx_nurture_recheck on nurture_queue(tenant_id, recheck_at) where resolved = false;

-- ============================================================================
-- TASKS — coordinator output
-- ============================================================================
create table tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  brand_id uuid references brands(id),
  title text not null,
  description text,
  recommended_action text,
  draft_content text,
  priority int default 50,
  estimated_value_usd numeric(10,2),
  due_at timestamptz,
  status text default 'pending' check (status in ('pending','approved','dismissed','completed')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  brand_id uuid references brands(id),
  decision text,
  reasons text[],
  rules_applied text[],
  action_type text,
  channel text,
  model_version text,
  payload jsonb,
  created_at timestamptz default now()
);

create index idx_audit_tenant_created on audit_log(tenant_id, created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY — enable on all tables
-- (Policies live in 002_rls_policies.sql)
-- ============================================================================
alter table tenants enable row level security;
alter table brands enable row level security;
alter table brand_contacts enable row level security;
alter table brand_recent_campaigns enable row level security;
alter table signals enable row level security;
alter table pitch_drafts enable row level security;
alter table outreach_events enable row level security;
alter table replies enable row level security;
alter table opt_outs enable row level security;
alter table deals enable row level security;
alter table nurture_queue enable row level security;
alter table tasks enable row level security;
alter table audit_log enable row level security;
