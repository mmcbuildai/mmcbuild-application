-- ============================================================
-- 00073 — Restore explicit RLS policies on 5 service-role-only tables
-- (SCRUM-231)
-- ============================================================
-- Five public tables ship RLS-ENABLED but with ZERO policies, so they fail
-- closed and the Supabase linter flags them ("RLS enabled, no policy"). They are
-- NOT org-scoped user data — verified against the migrations + the code, they
-- are a SERVICE-ROLE-ONLY surface:
--
--   * marketplace_estimate_tokens (00046) — remediation/estimate access tokens,
--     only ever written/read server-side via the admin (service_role) client
--     (src/lib/estimation/create-estimate.ts inserts via `admin`; the public
--     /api/remediation/[token] path reads them server-side). 00046 already noted
--     "no user-facing policy by design".
--   * trust_audit_log / trust_metering_events / trust_rate_limits /
--     trust_permission_policies (00047) — the platform-trust permissions /
--     metering / rate-limit engine. Accessed ONLY via the service_role client:
--     src/lib/services/platform-trust-middleware/config.ts builds the client with
--     `createClient(url, serviceKey)`. No anon/authenticated client ever queries
--     them.
--
-- service_role BYPASSES RLS, so all of the above keep working unchanged. This
-- migration makes the "no client (anon/authenticated) access" intent EXPLICIT
-- with a deny-all policy per table, so no public table is left
-- RLS-on-with-zero-policies (the DoD) WITHOUT opening any client access.
--
-- Deliberately NOT the org-scoped storage-bucket pattern — these are engine
-- tables, not user data (per the SCRUM-231 warning). A USING(false) policy is
-- behaviourally identical to the current default-deny; it only codifies intent
-- and clears the linter.
--
-- Idempotent: safe to re-run.
-- ============================================================

do $$
declare
  t text;
  tables text[] := array[
    'marketplace_estimate_tokens',
    'trust_audit_log',
    'trust_metering_events',
    'trust_rate_limits',
    'trust_permission_policies'
  ];
begin
  foreach t in array tables
  loop
    -- Only act on tables that actually exist in this environment.
    if to_regclass('public.' || t) is null then
      raise notice 'skipping % (does not exist here)', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_no_client_access', t);
    -- Deny every client role (anon + authenticated). service_role bypasses RLS,
    -- so the middleware/admin paths are unaffected.
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false);',
      t || '_no_client_access', t
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- DoD verification (run after apply — expect ZERO rows):
--   no public table left RLS-enabled with no policy at all.
-- ------------------------------------------------------------
-- select c.relname
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relkind = 'r'
--   and c.relrowsecurity
--   and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
-- order by c.relname;
