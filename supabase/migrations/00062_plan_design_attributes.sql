-- ============================================================
-- 00062: Plan lightweight design attributes
-- ============================================================
-- Adds a JSONB column to plans that stores a COMPACT set of
-- questionnaire-relevant design attributes extracted on upload by a
-- single lightweight vision call (NOT the full 3D geometry extraction).
--
-- Most users run MMC Comply against their design BEFORE running the
-- Build/3D module, so the existing design-driven questionnaire prefill
-- (which reads design_checks.spatial_layout) has nothing to offer them.
-- This column gives the questionnaire prefill a fallback source: a
-- DesignAttributes object (storeys, floor area, rooms, party wall, roof
-- material, wall cladding, habitable ceiling height) produced cheaply at
-- upload time. Null for files we can't extract attributes from (e.g.
-- DWG/manual-review plans with no vision path) — the questionnaire then
-- simply falls back to "fill it in yourself".

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS design_attributes JSONB;

COMMENT ON COLUMN plans.design_attributes IS
  'Compact questionnaire-relevant attributes extracted on upload via a single lightweight vision call (storeys, floor_area_m2, rooms, has_party_wall, roof_material, wall_cladding, ceiling_height_habitable_m). Read as a fallback by the Comply questionnaire prefill when no 3D spatial_layout exists. Null when no vision path / extraction failed.';

CREATE INDEX IF NOT EXISTS idx_plans_design_attributes_gin
  ON plans USING GIN (design_attributes);
