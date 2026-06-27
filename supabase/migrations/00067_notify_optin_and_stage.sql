-- Migration: notify-when-ready opt-in + per-stage progress signal
--
-- notify_email: the "Notify me when it's ready" opt-in. The completion email
--   (notify-run-complete) was firing for EVERY run; gate it on this flag so it
--   only fires when the user actually asked to be notified.
-- stage: a free-text "what's happening now" signal the long jobs write per
--   phase, so the progress UI shows real stages instead of a time-eased guess.
--   (compliance_checks already has progress_current; the others didn't.)
--
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout.

ALTER TABLE compliance_checks ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cost_estimates    ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE design_checks     ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE test_3d_jobs      ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE cost_estimates ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE design_checks  ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE test_3d_jobs   ADD COLUMN IF NOT EXISTS stage TEXT;
