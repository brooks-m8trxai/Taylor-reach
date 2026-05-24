-- TaylorReach — migration 004
-- Adds media_opportunity signal type and brand_kind column.
--
-- Run this in Supabase SQL Editor before deploying scanner changes.

-- ── 1. Add media_opportunity to signal_type ───────────────────────────────────
-- Drop the existing check constraint and replace it with one that includes the
-- new value.  Supabase Postgres supports ALTER TABLE … DROP CONSTRAINT.

alter table signals
  drop constraint signals_signal_type_check;

alter table signals
  add constraint signals_signal_type_check check (signal_type in (
    'product_launch',
    'campaign_launch',
    'funding_round',
    'creator_partnership',
    'celebrity_moment',
    'editorial_mention',
    'hiring_signal',
    'podcast_episode',
    'seasonal_window',
    'taylor_press_hit',
    'media_opportunity'
  ));

-- ── 2. Add brand_kind to brands ───────────────────────────────────────────────
-- Distinguishes product/DTC brands (sponsorship template) from media publishers
-- and creators (podcast_guest template).  Default 'brand' is safe for all
-- existing rows.

alter table brands
  add column if not exists brand_kind text not null default 'brand'
  check (brand_kind in ('brand', 'publisher', 'creator'));
