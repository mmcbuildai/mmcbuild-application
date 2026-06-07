-- Migration 00054: partial index on deregistered professionals (SCRUM-239)
--
-- Split out of 00051. The `WHERE status = 'deregistered'` predicate USES the
-- 'deregistered' enum value added in 00051. Postgres forbids using a newly
-- added enum value in the same transaction that adds it, and each migration
-- file runs in its own transaction — so this index must live in a separate
-- migration that runs AFTER 00051 has committed the new value.
--
-- Idempotent: CREATE INDEX IF NOT EXISTS.

-- Index for querying deregistered listings (admin/migration purposes)
CREATE INDEX IF NOT EXISTS idx_professionals_deregistered_at
  ON professionals(deregistered_at) WHERE status = 'deregistered';
