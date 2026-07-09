-- ============================================================
-- 00074 — Restore explicit RLS policies on the 2 cost-reference tables
-- ============================================================
-- Follow-on to 00073 (SCRUM-231). The RLS-restore DoD verify query, run after
-- 00073 applied in prod, surfaced two MORE public tables that are RLS-enabled
-- with ZERO policies (RLS-on, fail-closed, linter-flagged) — outside 231's
-- original scope (they come from 00018/00019, the cost-estimation work, not
-- 00046/00047):
--
--   * cost_reference_rates (00018) — global MMC/traditional benchmark rates.
--   * cost_rate_sources    (00019) — provenance/source rows for those rates.
--
-- Verified intent from the code: these are GLOBAL reference data (not org-scoped
-- user data) accessed ONLY via the service_role client — the settings cost-rates
-- actions read/write them via `db()` (admin), the AI cost tool
-- (lookup-cost-rate.ts) and the ingest job (ingest-cost-rates.ts) likewise use
-- `db()`/admin. No anon/authenticated client queries them directly.
--
-- service_role BYPASSES RLS, so all of the above keep working unchanged. As in
-- 00073, add an explicit deny-all-client policy per table to make the
-- "no client access" intent explicit and clear the linter, WITHOUT opening any
-- access — so no public table is left RLS-on-with-zero-policies. If a future
-- client-side feature needs to READ the reference rates, add a scoped read
-- policy then (they are non-sensitive reference data), rather than leaving the
-- intent implicit now.
--
-- Idempotent: safe to re-run.
-- ============================================================

do $$
declare
  t text;
  tables text[] := array[
    'cost_reference_rates',
    'cost_rate_sources'
  ];
begin
  foreach t in array tables
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping % (does not exist here)', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_no_client_access', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false);',
      t || '_no_client_access', t
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- DoD verification (run after apply — expect ZERO rows):
-- ------------------------------------------------------------
-- select c.relname
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relkind = 'r'
--   and c.relrowsecurity
--   and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
-- order by c.relname;
