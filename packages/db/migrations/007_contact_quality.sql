-- ═══════════════════════════════════════════════════════════════════════════
-- 007_contact_quality.sql
--
-- Adds contact quality classification to brand_contacts:
--   quality_badge  — machine-computed tier: named | editorial | founder |
--                    role_based | generic | unverified
--   badge_reason   — one-line human-readable explanation
--   last_verified_at — timestamp of most recent SMTP/Hunter verification
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE brand_contacts
  ADD COLUMN IF NOT EXISTS quality_badge text
    CHECK (quality_badge IN (
      'named', 'editorial', 'founder', 'role_based', 'generic', 'unverified'
    )),
  ADD COLUMN IF NOT EXISTS badge_reason text,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

-- Index for querying by quality (e.g. "show me all named contacts first")
CREATE INDEX IF NOT EXISTS brand_contacts_quality_idx
  ON brand_contacts(brand_id, quality_badge);
