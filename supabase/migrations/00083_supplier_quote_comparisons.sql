-- SCRUM-172 — Quote: multi-supplier comparison quote.
--
-- Karen (2026-05-01 Build module review): "they might want to sort of choose
-- three different people who do precast concrete and give me a quote for each
-- of those." Quote today produces a single estimated cost per line item; a
-- builder wants 2–3 supplier quotes per component, side by side.
--
-- A comparison is scoped to (project, MMC technology_category). The builder
-- picks up to 3 supplier products (from the supplier_products catalogue seeded
-- in 00079); one AI price-call runs per selected product, and the results are
-- stored as parallel variants with a delta-vs-lowest.
--
-- This is a NEW, self-contained surface — it does NOT modify the whole-plan
-- cost_estimates pipeline.

-- 1. The comparison run ----------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_quote_comparisons (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id              UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  -- One of the 8 MMC_TECHNOLOGY_CATEGORIES keys (the supplier_products join
  -- key). TEXT to mirror supplier_products.technology_category.
  technology_category TEXT NOT NULL,
  region              TEXT NOT NULL DEFAULT 'NSW',
  status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'processing', 'completed', 'error')),
  summary             TEXT,
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_supplier_quote_comparisons_project
  ON supplier_quote_comparisons(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_quote_comparisons_status
  ON supplier_quote_comparisons(status) WHERE status IN ('queued', 'processing');

ALTER TABLE supplier_quote_comparisons ENABLE ROW LEVEL SECURITY;

-- Org-scoped: the owning org reads + manages its own comparisons. The Inngest
-- worker runs as service role and bypasses RLS.
DROP POLICY IF EXISTS supplier_quote_comparisons_rw ON supplier_quote_comparisons;
CREATE POLICY supplier_quote_comparisons_rw ON supplier_quote_comparisons
  FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

-- 2. The per-supplier variants (one row per selected supplier product) -------
CREATE TABLE IF NOT EXISTS supplier_quote_variants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id       UUID NOT NULL REFERENCES supplier_quote_comparisons(id) ON DELETE CASCADE,
  -- Carried for a direct RLS predicate (no join needed) — mirrors the
  -- comparison's org.
  org_id              UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  professional_id     UUID REFERENCES professionals(id) ON DELETE SET NULL,
  product_id          UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  -- Denormalised supplier/product identity captured at request time so the
  -- comparison is stable even if the catalogue changes or a listing is removed.
  supplier_name       TEXT NOT NULL,
  product_name        TEXT NOT NULL,
  sku                 TEXT,
  summary             TEXT,
  base_price_estimate NUMERIC,      -- the supplier's published indicative price (anchor)
  lead_time_days      INT,
  -- Filled by the AI price-call.
  quantity            NUMERIC,
  unit                TEXT,
  unit_rate           NUMERIC,      -- $ per unit, supplied + installed
  estimated_total     NUMERIC,      -- total $ supplied + installed for this project
  confidence          NUMERIC,      -- 0.0–1.0
  notes               TEXT,
  -- Derived by computeVariantDeltas across the priced variants.
  delta_vs_lowest_pct NUMERIC,
  is_lowest           BOOLEAN NOT NULL DEFAULT false,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_quote_variants_comparison
  ON supplier_quote_variants(comparison_id, sort_order);

ALTER TABLE supplier_quote_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_quote_variants_rw ON supplier_quote_variants;
CREATE POLICY supplier_quote_variants_rw ON supplier_quote_variants
  FOR ALL
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());
