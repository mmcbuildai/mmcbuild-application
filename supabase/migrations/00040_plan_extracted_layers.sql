-- ============================================================
-- 00040: Plan extracted layer / structured data
-- ============================================================
-- Adds a JSONB column to plans that stores structured information
-- extracted during ingestion. For DWG/DXF files this includes layer
-- names, entity counts per layer, text annotations, block references,
-- and approximate measurements. Downstream features (3D vectoring,
-- questionnaire auto-fill, compliance auto-derivation) read from here.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS extracted_layers JSONB;

COMMENT ON COLUMN plans.extracted_layers IS
  'Structured data extracted from CAD/DXF (layers, entity counts, annotations, blocks). Null for files we cannot parse structurally.';

CREATE INDEX IF NOT EXISTS idx_plans_extracted_layers_gin
  ON plans USING GIN (extracted_layers);
