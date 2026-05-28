-- TaylorReach — migration 010
-- Extends brand_contacts for Hunter.io integration.
--
-- email_status  — normalised deliverability verdict from Hunter SMTP check
-- confidence    — Hunter's 0-100 confidence score for the email address
--
-- Also extends the quality_badge CHECK constraint to include:
--   risky   — Hunter returned accept_all (server accepts all mail, unverifiable)
--   invalid — Hunter returned undeliverable / disposable / bounced
--
-- Run this BEFORE deploying the Hunter integration.

-- ── Extend quality_badge check ────────────────────────────────────────────────
-- The original inline CHECK from migration 007 was auto-named by Postgres.
-- Drop it and replace with a named constraint that includes the new badge tiers.

ALTER TABLE brand_contacts
  DROP CONSTRAINT IF EXISTS brand_contacts_quality_badge_check;

ALTER TABLE brand_contacts
  ADD CONSTRAINT brand_contacts_quality_badge_check
  CHECK (quality_badge IN (
    'named', 'editorial', 'founder', 'role_based',
    'generic', 'unverified', 'risky', 'invalid'
  ));

-- ── New columns ───────────────────────────────────────────────────────────────

ALTER TABLE brand_contacts
  ADD COLUMN IF NOT EXISTS email_status text
    CHECK (email_status IN (
      'deliverable', 'undeliverable', 'risky', 'unknown', 'accept_all'
    )),
  ADD COLUMN IF NOT EXISTS confidence int
    CHECK (confidence >= 0 AND confidence <= 100);

-- Index to quickly surface verified contacts with high confidence
CREATE INDEX IF NOT EXISTS brand_contacts_email_status_idx
  ON brand_contacts(brand_id, email_status)
  WHERE email_status IS NOT NULL;
