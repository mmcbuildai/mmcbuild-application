-- MMC finished-price benchmark evidence (Stage 4 / MMC Quote)
--
-- Adds the real finished $/m² data points behind the single $3,500/m² headline
-- benchmark (migration 00068), so the market anchor is evidenced by a spread of
-- actual market quotes rather than one figure. These are REFERENCE rows only
-- (visible in the Cost Rates admin browser); the engine prices MMC via the
-- module-supply build-up (computeMmcBuildup), not these rows.
--
-- Method-typed, NOT supplier-attributed (per the market-rate provenance rule):
--   * panelised / flat-pack finished prices (incl margin + GST)
--   * volumetric finished prices (incl margin + GST)
-- All carry the "Market Rate (sourced 2026, +/-15%)" provenance (source ...-002).
--
-- Idempotent: deletes+reinserts only the "Finished benchmark:" rows, leaving the
-- headline turnkey row from 00068 untouched.

DELETE FROM cost_reference_rates
WHERE source_id = '00000000-0000-0000-0000-000000000002'
  AND element LIKE 'Finished benchmark:%';

INSERT INTO cost_reference_rates
  (category, element, unit, base_rate, state, year, source, source_id, source_detail, effective_date)
VALUES
('mmc_finished_benchmark', 'Finished benchmark: panelised 2-bed ~126m2', 'sqm', 3571, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market finished price incl margin + GST (2026); panelised/flat-pack. +/-15% for price creep.', CURRENT_DATE),
('mmc_finished_benchmark', 'Finished benchmark: panelised 3-bed ~118m2', 'sqm', 3814, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market finished price incl margin + GST (2026); panelised/flat-pack. +/-15% for price creep.', CURRENT_DATE),
('mmc_finished_benchmark', 'Finished benchmark: panelised 3-bed/3-bath ~157m2', 'sqm', 3570, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market finished price incl margin + GST (2026); panelised/flat-pack. +/-15% for price creep.', CURRENT_DATE),
('mmc_finished_benchmark', 'Finished benchmark: panelised 2-bath 58m2 (incl carport + slab, ex-freight)', 'sqm', 4083, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market supply+install price ex-GST, ex-freight, incl carport + slab (2026); small-unit scope loads the per-m2. +/-15% for price creep.', CURRENT_DATE),
('mmc_finished_benchmark', 'Finished benchmark: volumetric ~105m2', 'sqm', 3305, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market finished price incl margin + GST (2026); volumetric module. +/-15% for price creep.', CURRENT_DATE),
('mmc_finished_benchmark', 'Finished benchmark: volumetric large ~232m2', 'sqm', 3944, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market finished price incl margin + GST (2026); volumetric module. +/-15% for price creep.', CURRENT_DATE);
