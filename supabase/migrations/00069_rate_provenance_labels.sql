-- Rate provenance labels (Stage 4 / MMC Quote)
--
-- Splits every reference rate into two honest, client-facing buckets:
--   * "Market Rate (sourced 2026, +/-15%)"        -> rates we actually sourced
--     from comparable industry quotes (migration 00068).
--   * "Extrapolated from public information (data gap)" -> the original generic
--     seed rates + the unfounded MMC guesses (SIP/CLT/pod). These are NOT
--     sourced quotes; they are public-information ballparks and are flagged to
--     the client (Karen) as data gaps she needs to fill with real numbers.
--
-- Renaming the seed source row relabels all rates that point at it (the join in
-- lookup-cost-rate surfaces the name to the quote report). Idempotent: keyed by
-- the fixed source id.

UPDATE cost_rate_sources
SET name = 'Extrapolated from public information (data gap)'
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Make the unfounded MMC guesses' detail explicit so the report flags them.
UPDATE cost_reference_rates
SET source_detail = 'Extrapolated from public information - DATA GAP. Confirm an actual market rate.'
WHERE element IN (
  'SIP panel wall (installed)',
  'Prefabricated wall panel (timber)',
  'CLT wall panel (installed)',
  'Prefabricated bathroom pod (complete)'
);
