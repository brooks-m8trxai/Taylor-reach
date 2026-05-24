-- TaylorReach — RLS policies + brand_watchlist table
-- Applies tenant isolation to every table in the schema.
-- Policy pattern: a user can only see/write rows belonging to tenants they own.

-- ============================================================================
-- BRAND WATCHLIST — missing from 001, added here
-- ============================================================================
create table brand_watchlist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  brand_name text not null,
  domain text,
  ig_handle text,
  category_hint text,
  notes text,
  last_checked_at timestamptz,
  created_at timestamptz default now()
);

create index idx_watchlist_tenant on brand_watchlist(tenant_id);
alter table brand_watchlist enable row level security;

-- ============================================================================
-- HELPER: returns the set of tenant IDs owned by the current auth user.
-- Used by all policies below.
-- ============================================================================
create or replace function auth_tenant_ids()
  returns setof uuid
  language sql stable security definer
as $$
  select id from tenants where owner_user_id = auth.uid()
$$;

-- ============================================================================
-- TENANTS — owner can only see and modify their own row
-- ============================================================================
create policy "tenants_select" on tenants
  for select using (owner_user_id = auth.uid());

create policy "tenants_update" on tenants
  for update using (owner_user_id = auth.uid());

-- ============================================================================
-- BRANDS
-- ============================================================================
create policy "brands_select" on brands
  for select using (tenant_id in (select auth_tenant_ids()));

create policy "brands_insert" on brands
  for insert with check (tenant_id in (select auth_tenant_ids()));

create policy "brands_update" on brands
  for update using (tenant_id in (select auth_tenant_ids()));

create policy "brands_delete" on brands
  for delete using (tenant_id in (select auth_tenant_ids()));

-- ============================================================================
-- BRAND CONTACTS (no tenant_id — isolated via brands)
-- ============================================================================
create policy "brand_contacts_select" on brand_contacts
  for select using (
    brand_id in (select id from brands where tenant_id in (select auth_tenant_ids()))
  );

create policy "brand_contacts_insert" on brand_contacts
  for insert with check (
    brand_id in (select id from brands where tenant_id in (select auth_tenant_ids()))
  );

create policy "brand_contacts_update" on brand_contacts
  for update using (
    brand_id in (select id from brands where tenant_id in (select auth_tenant_ids()))
  );

create policy "brand_contacts_delete" on brand_contacts
  for delete using (
    brand_id in (select id from brands where tenant_id in (select auth_tenant_ids()))
  );

-- ============================================================================
-- BRAND RECENT CAMPAIGNS (no tenant_id — isolated via brands)
-- ============================================================================
create policy "brand_campaigns_select" on brand_recent_campaigns
  for select using (
    brand_id in (select id from brands where tenant_id in (select auth_tenant_ids()))
  );

create policy "brand_campaigns_insert" on brand_recent_campaigns
  for insert with check (
    brand_id in (select id from brands where tenant_id in (select auth_tenant_ids()))
  );

create policy "brand_campaigns_update" on brand_recent_campaigns
  for update using (
    brand_id in (select id from brands where tenant_id in (select auth_tenant_ids()))
  );

create policy "brand_campaigns_delete" on brand_recent_campaigns
  for delete using (
    brand_id in (select id from brands where tenant_id in (select auth_tenant_ids()))
  );

-- ============================================================================
-- SIGNALS
-- ============================================================================
create policy "signals_select" on signals
  for select using (tenant_id in (select auth_tenant_ids()));

create policy "signals_insert" on signals
  for insert with check (tenant_id in (select auth_tenant_ids()));

create policy "signals_update" on signals
  for update using (tenant_id in (select auth_tenant_ids()));

create policy "signals_delete" on signals
  for delete using (tenant_id in (select auth_tenant_ids()));

-- ============================================================================
-- PITCH DRAFTS
-- ============================================================================
create policy "pitch_drafts_select" on pitch_drafts
  for select using (tenant_id in (select auth_tenant_ids()));

create policy "pitch_drafts_insert" on pitch_drafts
  for insert with check (tenant_id in (select auth_tenant_ids()));

create policy "pitch_drafts_update" on pitch_drafts
  for update using (tenant_id in (select auth_tenant_ids()));

create policy "pitch_drafts_delete" on pitch_drafts
  for delete using (tenant_id in (select auth_tenant_ids()));

-- ============================================================================
-- OUTREACH EVENTS
-- ============================================================================
create policy "outreach_events_select" on outreach_events
  for select using (tenant_id in (select auth_tenant_ids()));

create policy "outreach_events_insert" on outreach_events
  for insert with check (tenant_id in (select auth_tenant_ids()));

create policy "outreach_events_update" on outreach_events
  for update using (tenant_id in (select auth_tenant_ids()));

-- ============================================================================
-- REPLIES
-- ============================================================================
create policy "replies_select" on replies
  for select using (tenant_id in (select auth_tenant_ids()));

create policy "replies_insert" on replies
  for insert with check (tenant_id in (select auth_tenant_ids()));

create policy "replies_update" on replies
  for update using (tenant_id in (select auth_tenant_ids()));

-- ============================================================================
-- OPT OUTS
-- ============================================================================
create policy "opt_outs_select" on opt_outs
  for select using (tenant_id in (select auth_tenant_ids()));

create policy "opt_outs_insert" on opt_outs
  for insert with check (tenant_id in (select auth_tenant_ids()));

-- ============================================================================
-- DEALS
-- ============================================================================
create policy "deals_select" on deals
  for select using (tenant_id in (select auth_tenant_ids()));

create policy "deals_insert" on deals
  for insert with check (tenant_id in (select auth_tenant_ids()));

create policy "deals_update" on deals
  for update using (tenant_id in (select auth_tenant_ids()));

create policy "deals_delete" on deals
  for delete using (tenant_id in (select auth_tenant_ids()));

-- ============================================================================
-- NURTURE QUEUE
-- ============================================================================
create policy "nurture_queue_select" on nurture_queue
  for select using (tenant_id in (select auth_tenant_ids()));

create policy "nurture_queue_insert" on nurture_queue
  for insert with check (tenant_id in (select auth_tenant_ids()));

create policy "nurture_queue_update" on nurture_queue
  for update using (tenant_id in (select auth_tenant_ids()));

-- ============================================================================
-- TASKS
-- ============================================================================
create policy "tasks_select" on tasks
  for select using (tenant_id in (select auth_tenant_ids()));

create policy "tasks_insert" on tasks
  for insert with check (tenant_id in (select auth_tenant_ids()));

create policy "tasks_update" on tasks
  for update using (tenant_id in (select auth_tenant_ids()));

create policy "tasks_delete" on tasks
  for delete using (tenant_id in (select auth_tenant_ids()));

-- ============================================================================
-- AUDIT LOG — insert only from service role, read by owner
-- ============================================================================
create policy "audit_log_select" on audit_log
  for select using (tenant_id in (select auth_tenant_ids()));

-- Insert is intentionally omitted from RLS: the compliance gate uses the
-- service-role client (bypasses RLS) to write audit rows.

-- ============================================================================
-- BRAND WATCHLIST
-- ============================================================================
create policy "watchlist_select" on brand_watchlist
  for select using (tenant_id in (select auth_tenant_ids()));

create policy "watchlist_insert" on brand_watchlist
  for insert with check (tenant_id in (select auth_tenant_ids()));

create policy "watchlist_update" on brand_watchlist
  for update using (tenant_id in (select auth_tenant_ids()));

create policy "watchlist_delete" on brand_watchlist
  for delete using (tenant_id in (select auth_tenant_ids()));
