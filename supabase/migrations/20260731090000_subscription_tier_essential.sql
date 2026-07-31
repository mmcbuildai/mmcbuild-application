-- Widen organisations.subscription_tier to accept the current tier vocabulary.
--
-- 00025_billing.sql constrained this column to
--   ('trial', 'basic', 'professional', 'enterprise')
-- which predates the 2026-07-04 tier rename (Basic -> Essential, see
-- src/lib/stripe/plans.ts PLANS). sync-stripe-subscription writes 'essential',
-- so every write failed the CHECK — and because the update's error was
-- discarded, it failed SILENTLY: the subscriptions row upserted fine, the
-- organisation stayed on 'trial', and a paying customer's dashboard kept
-- showing the trial badge. Nothing had hit it yet only because production has
-- received zero Stripe webhooks.
--
-- 'basic' is RETAINED, not replaced: rows written before the rename still
-- carry it, and application code normalises it to Essential
-- (plans.ts LEGACY_PLAN_ALIASES / normalizePlanId). Dropping it here would
-- invalidate existing rows.
--
-- The constraint is dropped by lookup rather than by name because 00025 created
-- it inline via ADD COLUMN ... CHECK, so its name is Postgres-generated and is
-- not guaranteed across environments. Idempotent: re-running drops whatever
-- subscription_tier check exists (including this one) and re-adds it.

DO $$
DECLARE
  v_constraint text;
BEGIN
  FOR v_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'organisations'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%subscription_tier%'
  LOOP
    EXECUTE format('ALTER TABLE public.organisations DROP CONSTRAINT %I', v_constraint);
  END LOOP;
END $$;

ALTER TABLE public.organisations
  ADD CONSTRAINT organisations_subscription_tier_check
  CHECK (subscription_tier IN ('trial', 'basic', 'essential', 'professional', 'enterprise'));
