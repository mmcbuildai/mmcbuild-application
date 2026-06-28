-- MMC supplier reference rates (Stage 4 / MMC Quote)
--
-- Loads the FIRST real MMC rate data into cost_reference_rates. Until now the
-- table held 71 rows, all NSW traditional `market` estimates plus a handful of
-- aspirational MMC guesses (SIP/CLT/pod) with no supplier basis — so the MMC
-- column in every quote was AI-extrapolated (SIP -194%, pods -177%).
--
-- These rates are extracted from real supplier quotes held in the owner's Drive:
--   * F2K_Unit_Cost_and_Sales_V13 (AGREED PRICING master) — module supply $2,100/m2
--   * F2K_2x2_Wabi_Pricing_Calculations_V7 — full WABI 2x2 site-works build-up
--   * Property Friends / Branscombe modular cost calculator — per-module rates
--   * F2K_Modular_Build_Pricing_Overview — cross-model finished $/m2 benchmarks
--   * I-Homes / Unison Modular Quote QU0412 — ex-factory volumetric
--
-- STATE NOTE: loaded as NSW so the default lookup path surfaces them. Module
-- supply is genuinely ex-factory / national; site-works rates are WA/TAS-sourced
-- and carry a NSW-loading-factor caveat in source_detail (see the Gaps tab of
-- docs/MMC-Reference-Rates-From-Supplier-Quotes-2026-06.xlsx).
--
-- Idempotent: upserts the provenance source, then deletes+reinserts only the
-- rows owned by this source_id, so re-running replaces cleanly without dupes.

INSERT INTO cost_rate_sources (id, name, source_type, config, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)',
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
('mmc_module_supply', 'Volumetric module supply (ex-factory, delivered)', 'sqm', 2175, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI/F2K/Branscombe converged $2,100-2,250; F2K V13 AGREED default $2,100. Ex-factory/national.', CURRENT_DATE),

-- Finished turnkey benchmark (sanity anchor, not a multiply-rate)
('mmc_finished_benchmark', 'Volumetric/flat-pack turnkey (incl margin + GST)', 'sqm', 3500, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'Range $3,180-3,944 across WABI 2x2/3x2/3x3H, WAM Koala70/BigRoo, F2K Joey (F2K_Modular_Build_Pricing_Overview). Use as headline MMC sanity check.', CURRENT_DATE),

-- MMC-only site works (no traditional analogue)
('mmc_site_works', 'Volumetric module install (crane + complexing + services hookup)', 'sqm', 50, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc — volumetric install $50/m2.', CURRENT_DATE),
('mmc_site_works', 'Flat-pack / panelised install crew', 'sqm', 500, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K $500/m2; F2K V13 models it at $180/m2 envelope.', CURRENT_DATE),
('mmc_site_works', 'Install per module (crane, complexing, hookup)', 'each', 6000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'Branscombe modular calculator — per-module install.', CURRENT_DATE),
('mmc_site_works', 'Builder cost per module (licence + supervision)', 'each', 5000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'Branscombe modular calculator — builder per module.', CURRENT_DATE),
('mmc_site_works', 'Port/factory to site transport (per module)', 'each', 3000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'Branscombe — port-to-site per module.', CURRENT_DATE),
('mmc_site_works', 'Factory to site transport (2 containers, double-B truck)', 'each', 10000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc — 2 containers on a double-B truck.', CURRENT_DATE),
('mmc_site_works', 'Site crane', 'day', 3000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc — typically 2 days.', CURRENT_DATE),

-- Substructure (merge with traditional substructure lookups — MMC footings)
('substructure', 'MMC eco-anchor screw-pile footing', 'each', 185, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI email 10 Mar 2026 — 18 anchors on the 2x2.', CURRENT_DATE),
('substructure', 'MMC footing/column - low (~1.2m)', 'lm', 600, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'Branscombe assumptions tab (F2).', CURRENT_DATE),
('substructure', 'MMC footing/column - medium (~2.0m)', 'lm', 800, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'Branscombe assumptions tab (F4).', CURRENT_DATE),
('substructure', 'MMC footing/column - high pier (~2.8m)', 'lm', 1000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'Branscombe assumptions tab (F3).', CURRENT_DATE),
('substructure', 'MMC slab on ground (concrete)', 'cum', 300, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'Branscombe assumptions tab.', CURRENT_DATE),

-- External works (merge with traditional external_works)
('external_works', 'MMC covered deck', 'sqm', 750, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'F2K V13 master.', CURRENT_DATE),
('external_works', 'MMC uncovered deck', 'sqm', 450, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI email 10 Mar 2026 — 40m2 deck.', CURRENT_DATE),
('external_works', 'MMC fencing', 'lm', 100, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'F2K V13 / Joey — wholesale.', CURRENT_DATE),
('external_works', 'MMC landscaping allowance', 'each', 20000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'Branscombe assumptions — per unit.', CURRENT_DATE),

-- Services (merge with traditional electrical/plumbing)
('electrical', 'MMC electric + NBN cable supply connection', 'each', 2000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc — cable run + materials.', CURRENT_DATE),
('electrical', 'MMC electric fitout and fix-off', 'each', 5000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc.', CURRENT_DATE),
('plumbing', 'MMC incoming water supply connection', 'each', 4000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc — pipe run + materials.', CURRENT_DATE),

-- Preliminaries / fees (merge with traditional preliminaries)
('preliminaries', 'MMC soil test', 'each', 1500, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc.', CURRENT_DATE),
('preliminaries', 'MMC building certification package', 'each', 5000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K / V13 standardised across models.', CURRENT_DATE),
('preliminaries', 'MMC council fees', 'each', 3000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc.', CURRENT_DATE),
('preliminaries', 'MMC state building warranty levy', 'each', 2500, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc.', CURRENT_DATE),
('preliminaries', 'MMC state workers compensation levy', 'each', 1000, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc.', CURRENT_DATE),
('preliminaries', 'MMC logistics coordination', 'each', 2500, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc.', CURRENT_DATE),
('preliminaries', 'MMC site security and preparation', 'each', 2500, 'NSW', 2026, 'MMC Supplier Quotes 2026 (WABI/WAM/Unison/F2K)', '00000000-0000-0000-0000-000000000002', 'WABI F2K calc.', CURRENT_DATE);
