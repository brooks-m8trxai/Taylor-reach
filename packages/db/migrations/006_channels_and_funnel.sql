-- ═══════════════════════════════════════════════════════════════════════════
-- 006_channels_and_funnel.sql
--
-- Phase A: Brand-deal channel + funnel routing
-- Phase B schema: Content calendar (ready for Phase B build)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Signals: funnel column ─────────────────────────────────────────────────
-- Separates signals by acquisition channel so the UI can show three distinct
-- feeds: brand deals, media opportunities, and content radar.

ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS funnel text
    CHECK (funnel IN ('brand_deal', 'media_opportunity', 'content_radar'));

-- Back-fill existing media_opportunity signals
UPDATE signals
   SET funnel = 'media_opportunity'
 WHERE signal_type = 'media_opportunity'
   AND funnel IS NULL;

-- ── Brands: brand_category + funding_event ─────────────────────────────────
-- brand_category: single canonical category string set by enricher
--   (e.g. 'strollers', 'baby food', 'sleep', 'maternity fashion')
-- funding_event:  JSONB snapshot of the most recent funding round
--   { round: 'Series A', amount_usd: 5000000, date: '2025-01', source_url: '' }

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS brand_category text,
  ADD COLUMN IF NOT EXISTS funding_event  jsonb;

-- ── Content calendar (Phase B schema — safe to run now) ────────────────────

CREATE TABLE IF NOT EXISTS content_calendar (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id),
  signal_id       uuid        REFERENCES signals(id) ON DELETE SET NULL,
  title           text        NOT NULL,
  status          text        NOT NULL DEFAULT 'idea'
                              CHECK (status IN ('idea', 'drafted', 'scheduled', 'posted', 'passed')),
  platform        text        CHECK (platform IN ('instagram', 'tiktok', 'newsletter', 'podcast', 'x')),
  suggested_angles jsonb,
  scheduled_for   timestamptz,
  posted_at       timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;

-- Drop policy first in case of re-run
DROP POLICY IF EXISTS "Tenant content calendar isolation" ON content_calendar;

CREATE POLICY "Tenant content calendar isolation" ON content_calendar
  FOR ALL USING (
    tenant_id IN (
      SELECT id FROM tenants WHERE owner_user_id = auth.uid()
    )
  );

-- Index for calendar views
CREATE INDEX IF NOT EXISTS content_calendar_tenant_status
  ON content_calendar(tenant_id, status);

CREATE INDEX IF NOT EXISTS content_calendar_scheduled
  ON content_calendar(tenant_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL;

-- Index for funnel filtering on signals
CREATE INDEX IF NOT EXISTS signals_funnel_idx
  ON signals(tenant_id, funnel)
  WHERE funnel IS NOT NULL;
