/**
 * MMC cost build-up — the whole-module model.
 *
 * Real MMC (modern methods of construction) pricing is NOT a per-trade sum like
 * a traditional build. A factory module is bought as ONE supply rate ($/m² of
 * gross floor area) that already includes frame, walls, roof, insulation,
 * internal fit-out and services rough-in. On top of that sit the works that
 * remain on site: footings, transport, crane/install, service connections,
 * preliminaries, and a builder margin.
 *
 * So instead of asking the model to invent an `mmc_rate` per traditional trade
 * (which produced nonsense — SIP -194%, pods -177%), we compute the MMC total
 * deterministically from the market-sourced rates (the "Market Rate (sourced
 * 2026, ±15%)" rows in cost_reference_rates), anchored on gross floor area.
 *
 * The engine prefers the live DB rate (passed in `rates`, keyed by element
 * name) and falls back to the sourced constants below so a renamed/removed row
 * never crashes a quote.
 */

export interface MmcBuildupLine {
  cost_category: string;
  element_description: string;
  quantity: number;
  unit: string;
  /** Per-unit rate applied. */
  rate: number;
  /** quantity × rate, rounded. */
  mmc_total: number;
}

export interface MmcBuildupResult {
  lines: MmcBuildupLine[];
  /** Sum of all component lines before margin. */
  subtotal: number;
  margin: number;
  /** subtotal + margin — the headline MMC figure. */
  total: number;
  gfa: number;
}

export type MmcRateMap = Record<string, number>;

export interface MmcBuildupOptions {
  /** Include the landscaping allowance (from the questionnaire). */
  landscaping?: boolean;
}

/** Builder margin embedded in the MMC build-up, to match the 15–25% margin the
 * traditional reference rates already carry (so the two sides compare fairly). */
export const MMC_MARGIN_RATE = 0.2;

/** Fallback rates — mirror the market-sourced rows in cost_reference_rates. */
export const MMC_FALLBACK_RATES = {
  moduleSupply: 2175,
  install: 50,
  transport: 10000,
  craneDay: 3000,
  footing: 185,
  electricConnect: 2000,
  waterConnect: 4000,
  electricFitout: 5000,
  soilTest: 1500,
  certification: 5000,
  councilFees: 3000,
  warrantyLevy: 2500,
  workersComp: 1000,
  logistics: 2500,
  siteSecurity: 2500,
  landscaping: 20000,
} as const;

/** Element names as stored in cost_reference_rates (used to read live rates). */
const ELEMENT = {
  moduleSupply: "Volumetric module supply (ex-factory, delivered)",
  install: "Volumetric module install (crane + complexing + services hookup)",
  transport: "Factory to site transport (2 containers, double-B truck)",
  crane: "Site crane",
  footing: "MMC eco-anchor screw-pile footing",
  electricConnect: "MMC electric + NBN cable supply connection",
  waterConnect: "MMC incoming water supply connection",
  electricFitout: "MMC electric fitout and fix-off",
  soilTest: "MMC soil test",
  certification: "MMC building certification package",
  councilFees: "MMC council fees",
  warrantyLevy: "MMC state building warranty levy",
  workersComp: "MMC state workers compensation levy",
  logistics: "MMC logistics coordination",
  siteSecurity: "MMC site security and preparation",
  landscaping: "MMC landscaping allowance",
} as const;

/**
 * Compute the MMC cost as a module-supply + site-works build-up.
 *
 * @param gfa  Gross floor area in m² (the cost driver). Must be > 0.
 * @param rates  Live rate map keyed by element name (optional; falls back to constants).
 * @param opts   Project flags (e.g. landscaping).
 */
export function computeMmcBuildup(
  gfa: number,
  rates: MmcRateMap = {},
  opts: MmcBuildupOptions = {},
): MmcBuildupResult {
  const r = (element: string, fallback: number): number => {
    const live = rates[element];
    return typeof live === "number" && live > 0 ? live : fallback;
  };

  const lines: MmcBuildupLine[] = [];
  const add = (
    cost_category: string,
    element_description: string,
    quantity: number,
    unit: string,
    rate: number,
  ) => {
    lines.push({
      cost_category,
      element_description,
      quantity,
      unit,
      rate,
      mmc_total: Math.round(quantity * rate),
    });
  };

  // 1. Factory module supply — the bulk; replaces frame, walls, roof,
  //    insulation, internal fit-out and services rough-in in one rate.
  add(
    "mmc_module",
    "Factory module supply (ex-factory, delivered)",
    gfa,
    "sqm",
    r(ELEMENT.moduleSupply, MMC_FALLBACK_RATES.moduleSupply),
  );

  // 2. Site works & installation
  add(
    "mmc_site_works",
    "Module install (crane + complexing + services hookup)",
    gfa,
    "sqm",
    r(ELEMENT.install, MMC_FALLBACK_RATES.install),
  );
  add(
    "mmc_site_works",
    "Factory to site transport",
    1,
    "load",
    r(ELEMENT.transport, MMC_FALLBACK_RATES.transport),
  );
  add(
    "mmc_site_works",
    "Site crane (2 days)",
    2,
    "day",
    r(ELEMENT.crane, MMC_FALLBACK_RATES.craneDay),
  );
  if (opts.landscaping) {
    add(
      "mmc_site_works",
      "Landscaping allowance",
      1,
      "each",
      r(ELEMENT.landscaping, MMC_FALLBACK_RATES.landscaping),
    );
  }

  // 3. Footings — eco-anchor count scaled to floor area (min 8).
  const footings = Math.max(8, Math.round(gfa / 5.5));
  add(
    "mmc_substructure",
    "Eco-anchor screw-pile footings",
    footings,
    "each",
    r(ELEMENT.footing, MMC_FALLBACK_RATES.footing),
  );

  // 4. Service connections
  add("mmc_services", "Electric + NBN supply connection", 1, "each", r(ELEMENT.electricConnect, MMC_FALLBACK_RATES.electricConnect));
  add("mmc_services", "Incoming water supply connection", 1, "each", r(ELEMENT.waterConnect, MMC_FALLBACK_RATES.waterConnect));
  add("mmc_services", "Electric fitout and fix-off", 1, "each", r(ELEMENT.electricFitout, MMC_FALLBACK_RATES.electricFitout));

  // 5. Preliminaries & fees
  add("mmc_preliminaries", "Soil test", 1, "each", r(ELEMENT.soilTest, MMC_FALLBACK_RATES.soilTest));
  add("mmc_preliminaries", "Building certification package", 1, "each", r(ELEMENT.certification, MMC_FALLBACK_RATES.certification));
  add("mmc_preliminaries", "Council fees", 1, "each", r(ELEMENT.councilFees, MMC_FALLBACK_RATES.councilFees));
  add("mmc_preliminaries", "State building warranty levy", 1, "each", r(ELEMENT.warrantyLevy, MMC_FALLBACK_RATES.warrantyLevy));
  add("mmc_preliminaries", "State workers compensation levy", 1, "each", r(ELEMENT.workersComp, MMC_FALLBACK_RATES.workersComp));
  add("mmc_preliminaries", "Logistics coordination", 1, "each", r(ELEMENT.logistics, MMC_FALLBACK_RATES.logistics));
  add("mmc_preliminaries", "Site security and preparation", 1, "each", r(ELEMENT.siteSecurity, MMC_FALLBACK_RATES.siteSecurity));

  const subtotal = lines.reduce((sum, l) => sum + l.mmc_total, 0);
  const margin = Math.round(subtotal * MMC_MARGIN_RATE);
  lines.push({
    cost_category: "mmc_margin",
    element_description: `Builder margin (${Math.round(MMC_MARGIN_RATE * 100)}%)`,
    quantity: 1,
    unit: "lump_sum",
    rate: margin,
    mmc_total: margin,
  });

  return { lines, subtotal, margin, total: subtotal + margin, gfa };
}
