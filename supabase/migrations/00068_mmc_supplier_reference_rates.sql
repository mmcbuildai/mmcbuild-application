-- MMC market reference rates (Stage 4 / MMC Quote)
--
-- Loads the FIRST market-sourced MMC rate data into cost_reference_rates. Until
-- now the table held only generic NSW traditional estimates plus a handful of
-- unfounded MMC guesses (SIP/CLT/pod) — so the MMC column in every quote was
-- extrapolated (SIP -194%, pods -177%).
--
-- These rates are MARKET RATES sourced from comparable industry quotes (2026).
-- A +/-15% margin of error applies to allow for price creep over time. Supplier
-- identities are deliberately NOT recorded here — the rates are presented to the
-- client as market rates, not attributed quotes.
--
-- STATE NOTE: loaded as NSW so the default lookup path surfaces them. Module
-- supply is genuinely ex-factory / national; site-works rates carry a
-- NSW-loading-factor caveat (a known data gap — see the Karen flag-back).
--
-- Idempotent: upserts the provenance source, then deletes+reinserts only the
-- rows owned by this source_id, so re-running replaces cleanly without dupes.

INSERT INTO cost_rate_sources (id, name, source_type, config, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Market Rate (sourced 2026, +/-15%)',
  'manual',
  '{}',
  true
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, is_active = true;

DELETE FROM cost_reference_rates
WHERE source_id = '00000000-0000-0000-0000-000000000002';

INSERT INTO cost_reference_rates
  (category, element, unit, base_rate, state, year, source, source_id, source_detail, effective_date)
VALUES
-- Module supply (the headline rate — replaces frame+walls+roof+insulation+internal fit+rough-in)
('mmc_module_supply', 'Volumetric module supply (ex-factory, delivered)', 'sqm', 2175, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (comparable industry quotes, 2026); volumetric ex-factory/national. +/-15% allowance for price creep.', CURRENT_DATE),

-- Finished turnkey benchmark (sanity anchor, not a multiply-rate)
('mmc_finished_benchmark', 'Volumetric/flat-pack turnkey (incl margin + GST)', 'sqm', 3500, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (comparable industry quotes, 2026); turnkey sanity anchor, observed range $3,180-3,944/m2. +/-15% allowance for price creep.', CURRENT_DATE),

-- MMC-only site works (no traditional analogue)
('mmc_site_works', 'Volumetric module install (crane + complexing + services hookup)', 'sqm', 50, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); volumetric module install. +/-15% for price creep.', CURRENT_DATE),
('mmc_site_works', 'Flat-pack / panelised install crew', 'sqm', 500, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); flat-pack/panelised install (envelope basis $180-500/m2). +/-15% for price creep.', CURRENT_DATE),
('mmc_site_works', 'Install per module (crane, complexing, hookup)', 'each', 6000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); per-module install. +/-15% for price creep.', CURRENT_DATE),
('mmc_site_works', 'Builder cost per module (licence + supervision)', 'each', 5000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); builder per module (licence + supervision). +/-15% for price creep.', CURRENT_DATE),
('mmc_site_works', 'Port/factory to site transport (per module)', 'each', 3000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); port/factory-to-site per module. +/-15% for price creep.', CURRENT_DATE),
('mmc_site_works', 'Factory to site transport (2 containers, double-B truck)', 'each', 10000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); 2 containers on a double-B truck. +/-15% for price creep.', CURRENT_DATE),
('mmc_site_works', 'Site crane', 'day', 3000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); site crane, typically 2 days. +/-15% for price creep.', CURRENT_DATE),

-- Substructure (merge with traditional substructure lookups — MMC footings)
('substructure', 'MMC eco-anchor screw-pile footing', 'each', 185, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); eco-anchor/screw-pile footing. +/-15% for price creep.', CURRENT_DATE),
('substructure', 'MMC footing/column - low (~1.2m)', 'lm', 600, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); low column/footing. +/-15% for price creep.', CURRENT_DATE),
('substructure', 'MMC footing/column - medium (~2.0m)', 'lm', 800, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); medium column/footing. +/-15% for price creep.', CURRENT_DATE),
('substructure', 'MMC footing/column - high pier (~2.8m)', 'lm', 1000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); high pier/column. +/-15% for price creep.', CURRENT_DATE),
('substructure', 'MMC slab on ground (concrete)', 'cum', 300, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); slab-on-ground concrete. +/-15% for price creep.', CURRENT_DATE),

-- External works (merge with traditional external_works)
('external_works', 'MMC covered deck', 'sqm', 750, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); covered deck. +/-15% for price creep.', CURRENT_DATE),
('external_works', 'MMC uncovered deck', 'sqm', 450, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); uncovered deck. +/-15% for price creep.', CURRENT_DATE),
('external_works', 'MMC fencing', 'lm', 100, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); fencing (wholesale). +/-15% for price creep.', CURRENT_DATE),
('external_works', 'MMC landscaping allowance', 'each', 20000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); landscaping allowance per unit. +/-15% for price creep.', CURRENT_DATE),

-- Services (merge with traditional electrical/plumbing)
('electrical', 'MMC electric + NBN cable supply connection', 'each', 2000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); electric + NBN cable supply connection. +/-15% for price creep.', CURRENT_DATE),
('electrical', 'MMC electric fitout and fix-off', 'each', 5000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); electric fitout and fix-off. +/-15% for price creep.', CURRENT_DATE),
('plumbing', 'MMC incoming water supply connection', 'each', 4000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); incoming water supply connection. +/-15% for price creep.', CURRENT_DATE),

-- Preliminaries / fees (merge with traditional preliminaries)
('preliminaries', 'MMC soil test', 'each', 1500, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); soil test. +/-15% for price creep.', CURRENT_DATE),
('preliminaries', 'MMC building certification package', 'each', 5000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); building certification package. +/-15% for price creep.', CURRENT_DATE),
('preliminaries', 'MMC council fees', 'each', 3000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); council fees. +/-15% for price creep.', CURRENT_DATE),
('preliminaries', 'MMC state building warranty levy', 'each', 2500, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); state building warranty levy. +/-15% for price creep.', CURRENT_DATE),
('preliminaries', 'MMC state workers compensation levy', 'each', 1000, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); state workers compensation levy. +/-15% for price creep.', CURRENT_DATE),
('preliminaries', 'MMC logistics coordination', 'each', 2500, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); logistics coordination. +/-15% for price creep.', CURRENT_DATE),
('preliminaries', 'MMC site security and preparation', 'each', 2500, 'NSW', 2026, 'Market Rate (sourced 2026, +/-15%)', '00000000-0000-0000-0000-000000000002', 'Market rate (2026); site security and preparation. +/-15% for price creep.', CURRENT_DATE);
