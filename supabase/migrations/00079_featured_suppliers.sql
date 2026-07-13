-- SCRUM-171 — surface paid-tier supplier products inside Build optimisation
-- suggestions, with lead tracking.
--
-- Tier vocabulary aligns to the confirmed Trades & Suppliers pricing model:
--   free            — self-signup, directory listing only
--   verified        — "Verified Suppliers" ($199/mo): directory listing, NO lead referrals
--   growth_partner  — "Growth Partner" ($299/mo + $/lead): products surface in Build
-- Only growth_partner products appear inline on suggestions; everyone else is
-- Directory-only. Tier is set by the operator (Billing/payment is out of scope
-- for this ticket).

-- 1. Supplier tier on the directory listing --------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supplier_tier') THEN
    CREATE TYPE supplier_tier AS ENUM ('free', 'verified', 'growth_partner');
  END IF;
END$$;

-- Tier: only growth_partner products surface in Build suggestions; free +
-- verified stay Directory-only.
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS tier supplier_tier NOT NULL DEFAULT 'free';

CREATE INDEX IF NOT EXISTS idx_professionals_tier ON professionals(tier);

-- 2. Supplier product catalogue --------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id     UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  org_id              UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  -- The join key to a design suggestion. One of the 8 MMC_TECHNOLOGY_CATEGORIES
  -- keys (kept as TEXT to mirror design_suggestions.technology_category).
  technology_category TEXT NOT NULL,
  sku                 TEXT,
  name                TEXT NOT NULL,
  summary             TEXT,
  price_estimate      NUMERIC,
  lead_time_days      INT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_products_category
  ON supplier_products(technology_category) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_supplier_products_professional
  ON supplier_products(professional_id);

ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;

-- Public marketplace read: an active product of an approved supplier is visible
-- to any authenticated user (so the Build join can surface it). The owning org
-- can additionally see its own (incl. inactive) products.
DROP POLICY IF EXISTS supplier_products_read ON supplier_products;
CREATE POLICY supplier_products_read ON supplier_products
  FOR SELECT
  USING (
    org_id = get_user_org_id()
    OR (
      is_active
      AND EXISTS (
        SELECT 1 FROM professionals p
        WHERE p.id = supplier_products.professional_id
          AND p.status = 'approved'
      )
    )
  );

-- The owning org manages its own products (operator seeding runs as service role
-- and bypasses RLS regardless).
DROP POLICY IF EXISTS supplier_products_write ON supplier_products;
CREATE POLICY supplier_products_write ON supplier_products
  FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

-- 3. Lead tracking (directory referral click-throughs) ---------------------
CREATE TABLE IF NOT EXISTS directory_referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The referring user's project + org (who was shown the product).
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  suggestion_id   UUID REFERENCES design_suggestions(id) ON DELETE SET NULL,
  -- The referred supplier + product.
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_directory_referrals_professional
  ON directory_referrals(professional_id);
CREATE INDEX IF NOT EXISTS idx_directory_referrals_org
  ON directory_referrals(org_id);

ALTER TABLE directory_referrals ENABLE ROW LEVEL SECURITY;

-- The referring org owns its referral rows. (Operator analytics reads run as
-- service role.)
DROP POLICY IF EXISTS directory_referrals_rw ON directory_referrals;
CREATE POLICY directory_referrals_rw ON directory_referrals
  FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());
