-- Migration 00053: add plans.error_message for surfacing why a plan landed in
-- manual_review / error (SCRUM-272 observability).
--
-- Plan processing degrades to manual_review on conversion / extraction / embed
-- failure (resilient ingest). Until now the *reason* was only in the Inngest
-- function logs, which aren't easily accessible. This column records the reason
-- so it can be shown on the plan card ("you'll be told why and asked to fix and
-- re-upload it") and queried directly.

ALTER TABLE plans ADD COLUMN IF NOT EXISTS error_message text;
