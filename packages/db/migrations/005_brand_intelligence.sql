-- TaylorReach — migration 005
-- Adds four intelligence-cache columns to brands.
--
-- about_summary        — 2-3 sentence human-readable description of the brand
-- opportunity_summary  — 2-3 sentences on WHY this brand is an opportunity for Taylor
-- suggested_angles_json — JSONB array of PitchAngle objects (from generateAngles)
-- intelligence_generated_at — when the three fields above were last generated
--
-- Staleness logic: regenerate when intelligence_generated_at IS NULL
--   OR intelligence_generated_at < last_signal_at (new signal arrived since last analysis)
--
-- Run this in Supabase SQL Editor before deploying the brand-detail intelligence changes.

alter table brands
  add column if not exists about_summary            text,
  add column if not exists opportunity_summary      text,
  add column if not exists suggested_angles_json    jsonb,
  add column if not exists intelligence_generated_at timestamptz;
