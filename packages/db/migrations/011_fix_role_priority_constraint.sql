-- TaylorReach — migration 011
-- Fixes the brand_contacts_role_priority_check constraint.
--
-- Original migration 001 defined: role_priority BETWEEN 1 AND 5
-- Migration 010 added badge tiers 'risky' and 'invalid' which map to
-- role_priority values 7 and 9 respectively — both fail the old constraint.
--
-- This migration widens the allowed range to 1–9:
--   1 = named / founder        (best — go-to contact)
--   2 = role_based / editorial (targeted role inbox)
--   3 = unverified fallback
--   5 = generic inbox          (info@, hello@)
--   7 = risky                  (accept-all server, use with caution)
--   9 = invalid                (undeliverable — do not send)
--
-- Run this before re-enriching any brand that has Hunter contacts.

ALTER TABLE brand_contacts
  DROP CONSTRAINT IF EXISTS brand_contacts_role_priority_check;

ALTER TABLE brand_contacts
  ADD CONSTRAINT brand_contacts_role_priority_check
  CHECK (role_priority BETWEEN 1 AND 9);
