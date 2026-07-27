-- ============================================================
-- 20260727120000 — Expose the CLI migration ledger to the drift gate (SCRUM-233)
-- ============================================================
-- WHY
-- The drift gate infers "was this migration applied?" by probing for a table or
-- column the migration creates. That works only for migrations that create such
-- an object. A migration that only creates RLS policies, functions, triggers or
-- data has nothing to probe, so it was reported "unverifiable" and CI stayed
-- green whether or not it had ever been applied — 27 of 86 migrations, including
-- every storage-policy migration.
--
-- Production already records the answer exactly, in
-- supabase_migrations.schema_migrations. The gate could not read it because
-- PostgREST only exposes the `public` schema, so this function lifts the version
-- list into reach. With it the gate compares repo filenames against the ledger
-- and the "unverifiable" bucket disappears: coverage goes to every migration,
-- whatever its contents.
--
-- WHY IT IS STILL NOT THE WHOLE ANSWER
-- The ledger records that a migration was REGISTERED as applied, which is not the
-- same as its objects being present — this repo's ledger was baselined on
-- 2026-07-27 by marking 84 hand-applied migrations as applied without re-running
-- them. So the gate keeps the object probes as a second, independent signal:
-- absent from the ledger = never applied; in the ledger but the object is missing
-- = the ledger is lying (a bad baseline, or something dropped by hand).
--
-- SECURITY
-- SECURITY DEFINER is required to read another schema, so the search_path is
-- pinned and EXECUTE is revoked from everyone except service_role. It returns
-- nothing but version strings — no data, no DDL, and it cannot write.
-- ============================================================

CREATE OR REPLACE FUNCTION public.applied_migration_versions()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT version
  FROM supabase_migrations.schema_migrations
  ORDER BY version;
$$;

COMMENT ON FUNCTION public.applied_migration_versions() IS
  'Read-only list of applied migration versions, for the CI drift gate (SCRUM-233). '
  'Service-role only. See scripts/migration-baseline.mjs.';

-- Least privilege: the gate runs with the service-role key, nobody else needs this.
REVOKE ALL ON FUNCTION public.applied_migration_versions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.applied_migration_versions() FROM anon;
REVOKE ALL ON FUNCTION public.applied_migration_versions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.applied_migration_versions() TO service_role;
