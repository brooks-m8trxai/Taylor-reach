-- TaylorReach — migration 009
-- Adds brand provenance columns to support multi-source brand discovery.
--
-- founder_attributes  — jsonb: mom_founded, women_founded, bipoc_founded, etc.
--                       Used to apply fit score boosts and surface diverse brands.
--
-- discovery_source    — how this brand first entered the pipeline
--                       Drives analytics on which channels produce quality leads.
--
-- sources             — jsonb array of every discovery source seen so far
--                       Enables cross-source validation boost (+10 when 2+ sources agree).
--
-- Run this in Supabase SQL Editor before deploying the watchlist / discovery expansion.

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS founder_attributes jsonb,
  ADD COLUMN IF NOT EXISTS discovery_source   text
    CHECK (discovery_source IN (
      'rss', 'watchlist', 'retailer', 'funding',
      'social', 'curated', 'job_posting', 'founder_tracking', 'manual'
    )),
  ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]';

-- GIN index for founder attribute queries
-- ("show me all mom-founded brands with fit >= 80")
CREATE INDEX IF NOT EXISTS brands_founder_attrs_idx
  ON brands USING GIN (founder_attributes)
  WHERE founder_attributes IS NOT NULL;

CREATE INDEX IF NOT EXISTS brands_discovery_source_idx
  ON brands(tenant_id, discovery_source)
  WHERE discovery_source IS NOT NULL;

-- Backfill: all existing brands came from RSS
UPDATE brands
   SET discovery_source = 'rss',
       sources         = '["rss"]'
 WHERE discovery_source IS NULL;

-- brand_watchlist needs a unique constraint so the seeder can upsert safely
ALTER TABLE brand_watchlist
  ADD CONSTRAINT brand_watchlist_tenant_name_unique UNIQUE (tenant_id, brand_name);
