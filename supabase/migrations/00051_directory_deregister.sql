-- SCRUM-239: Add deregistered status to professionals
-- Allows business owners to soft-delete their MMC Direct listing

-- Add deregistered to professional_status enum
ALTER TYPE professional_status ADD VALUE IF NOT EXISTS 'deregistered';

-- Add deregistered_at timestamp for tracking when deregistration occurred
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS deregistered_at TIMESTAMPTZ;

-- NOTE: the partial index that filters on status = 'deregistered' lives in
-- 00054, NOT here. Postgres forbids USING a newly-added enum value in the same
-- transaction that adds it ("unsafe use of new value ... must be committed
-- before they can be used"), and each migration file runs in one transaction —
-- so referencing 'deregistered' in this file fails under `supabase db push`.
-- Splitting the index into 00054 lets this ADD VALUE commit first.
