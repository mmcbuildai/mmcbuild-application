/**
 * Agent Tool: lookup_cost_rate
 * Looks up reference cost rates from the cost_reference_rates table.
 * Checks org-specific overrides first, then falls back to global rates.
 * Returns source provenance information alongside rate data.
 */

import { db } from "@/lib/supabase/db";

export const lookupCostRateDef = {
  name: "lookup_cost_rate",
  description:
    "Look up reference cost rates from the Australian construction rates database. " +
    "Returns unit rates for specific elements within a cost category, including the source name and detail. " +
    "Use this before estimating costs to get accurate base rates.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        description: "The cost category (e.g., 'frame', 'plumbing', 'external_walls')",
      },
      element: {
        type: "string",
        description: "Optional specific element to search for (e.g., 'timber wall frame')",
      },
      state: {
        type: "string",
        description: "Australian state for regional rates (default: 'NSW')",
      },
    },
    required: ["category"],
  },
};

export interface RateResult {
  element: string;
  unit: string;
  base_rate: number;
  state: string;
  year: number;
  source_name: string;
  source_detail: string | null;
  is_override: boolean;
}

/**
 * Query org-specific rate overrides first.
 */
async function queryOrgOverrides(
  orgId: string,
  category: string,
  state: string,
  element?: string
): Promise<RateResult[]> {
  let query = db()
    .from("org_rate_overrides")
    .select("element, unit, base_rate, state, year, notes, source_label")
    .eq("org_id", orgId)
    .eq("category", category)
    .eq("state", state);

  if (element) {
    query = query.ilike("element", `%${element}%`);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  return (data as {
    element: string;
    unit: string;
    base_rate: number;
    state: string;
    year: number;
    notes: string | null;
    source_label: string;
  }[]).map((r) => ({
    element: r.element,
    unit: r.unit,
    base_rate: r.base_rate,
    state: r.state,
    year: r.year,
    source_name: r.source_label,
    source_detail: r.notes,
    is_override: true,
  }));
}

interface RateRowLegacy {
  element: string;
  unit: string;
  base_rate: number;
  state: string;
  year: number;
}

interface RateRowEnhanced extends RateRowLegacy {
  source_detail: string | null;
  effective_date: string | null;
  expires_at: string | null;
  cost_rate_sources: { name: string } | null;
}

type RateRow = RateRowLegacy | RateRowEnhanced;

function hasProvenance(row: RateRow): row is RateRowEnhanced {
  return "cost_rate_sources" in row;
}

/**
 * Query global reference rates with fallback for legacy schema.
 */
async function queryGlobalRates(
  category: string,
  state: string,
  element?: string
): Promise<RateResult[]> {
  const today = new Date().toISOString().split("T")[0];

  // Try enhanced query first
  let query = db()
    .from("cost_reference_rates")
    .select("element, unit, base_rate, state, year, source_detail, effective_date, expires_at, cost_rate_sources(name)")
    .eq("category", category);

  if (element) {
    query = query.ilike("element", `%${element}%`);
  }

  query = query
    .or(`expires_at.is.null,expires_at.gte.${today}`)
    .eq("state", state)
    .order("effective_date", { ascending: false });

  const enhanced = await query;

  let rows: RateRow[];
  if (!enhanced.error && enhanced.data) {
    rows = enhanced.data;
  } else {
    // Fall back to legacy query
    let legacyQuery = db()
      .from("cost_reference_rates")
      .select("element, unit, base_rate, state, year")
      .eq("category", category);

    if (element) {
      legacyQuery = legacyQuery.ilike("element", `%${element}%`);
    }

    legacyQuery = legacyQuery.eq("state", state).order("element");
    const legacy = await legacyQuery;
    rows = legacy.data ?? [];
  }

  // Deduplicate by element
  const seen = new Set<string>();
  const results: RateResult[] = [];
  for (const r of rows) {
    if (seen.has(r.element)) continue;
    seen.add(r.element);

    const sourceName = hasProvenance(r)
      ? r.cost_rate_sources?.name ?? "Extrapolated from public information (data gap)"
      : "Extrapolated from public information (data gap)";
    const sourceDetail = hasProvenance(r) ? r.source_detail : null;

    results.push({
      element: r.element,
      unit: r.unit,
      base_rate: r.base_rate,
      state: r.state,
      year: r.year,
      source_name: sourceName,
      source_detail: sourceDetail,
      is_override: false,
    });
  }

  return results;
}

function formatRateLine(r: RateResult, suffix?: string): string {
  const overrideTag = r.is_override ? " [CLIENT OVERRIDE]" : "";
  const detail = r.source_detail ? ` [${r.source_detail}]` : "";
  return `  - ${r.element}: $${r.base_rate}/${r.unit} (${r.state} ${r.year}${suffix ?? ""}) | source_name: "${r.source_name}"${detail}${overrideTag}`;
}

export async function executeLookupCostRate(
  input: { category: string; element?: string; state?: string },
  orgId?: string
): Promise<string> {
  const state = input.state ?? "NSW";

  // 1. Check org overrides first
  let orgRates: RateResult[] = [];
  if (orgId) {
    orgRates = await queryOrgOverrides(orgId, input.category, state, input.element);
  }

  // 2. Get global rates
  let globalRates = await queryGlobalRates(input.category, state, input.element);

  // 3. Merge: org overrides take priority (by element name)
  const overrideElements = new Set(orgRates.map((r) => r.element));
  const nonOverriddenGlobal = globalRates.filter((r) => !overrideElements.has(r.element));
  const mergedRates = [...orgRates, ...nonOverriddenGlobal];

  if (mergedRates.length === 0) {
    // META-SEARCH: an element-specific miss should NOT make the agent re-probe
    // the same category with element variations (the #1 cause of slow, expensive
    // cost runs — Karen, 2026-06-20). Return EVERY available rate in the category
    // in this one call so the agent picks the closest, and tell it not to search
    // again. Only runs when an element filter was the thing that missed.
    if (input.element) {
      const catOrg = orgId
        ? await queryOrgOverrides(orgId, input.category, state)
        : [];
      const catGlobal = await queryGlobalRates(input.category, state);
      const catOverrideElements = new Set(catOrg.map((r) => r.element));
      const catMerged = [
        ...catOrg,
        ...catGlobal.filter((r) => !catOverrideElements.has(r.element)),
      ];
      if (catMerged.length > 0) {
        const lines = catMerged.map((r) => formatRateLine(r));
        return `No exact rate for element "${input.element}" in "${input.category}". Here are ALL available "${input.category}" rates — pick the closest match, or estimate the rate yourself (rate_source_name "Extrapolated from public information (data gap)"). Do NOT call lookup_cost_rate for this category again:\n${lines.join("\n")}`;
      }
    }

    // Fall back to NSW rates
    if (state !== "NSW") {
      const nswGlobal = await queryGlobalRates(input.category, "NSW", input.element);
      let nswOrg: RateResult[] = [];
      if (orgId) {
        nswOrg = await queryOrgOverrides(orgId, input.category, "NSW", input.element);
      }

      const nswOverrides = new Set(nswOrg.map((r) => r.element));
      const nswMerged = [...nswOrg, ...nswGlobal.filter((r) => !nswOverrides.has(r.element))];

      if (nswMerged.length > 0) {
        const lines = nswMerged.map((r) => formatRateLine(r, `, adjust for ${state}`));
        return `Reference rates for "${input.category}" (NSW base, needs ${state} adjustment):\n${lines.join("\n")}`;
      }
    }

    // Nothing in the tables for this category at all → estimate + a "to be
    // confirmed" placeholder, and do NOT keep searching for what isn't there.
    return JSON.stringify({
      rates: [],
      source_name: "Extrapolated from public information (data gap)",
      source_detail: null,
      message: `No reference rates exist for category "${input.category}"${input.element ? ` (element "${input.element}")` : ""}. Estimate the rate from market knowledge and set rate_source_name to "Extrapolated from public information (data gap)" (a "to be confirmed" placeholder is fine). Do NOT call lookup_cost_rate for this category again — the data is not in the tables.`,
    });
  }

  const lines = mergedRates.map((r) => formatRateLine(r));
  const overrideCount = mergedRates.filter((r) => r.is_override).length;
  const overrideNote = overrideCount > 0
    ? `\n\nNote: ${overrideCount} rate(s) are client overrides — use these preferentially.`
    : "";

  return `Reference rates for "${input.category}":\n${lines.join("\n")}\n\nIMPORTANT: For each line item that uses a reference rate, set rate_source_name to the source_name shown above. If you estimate a rate yourself, set rate_source_name to "Extrapolated from public information (data gap)".${overrideNote}`;
}

/**
 * Structured variant of the rate lookup — returns merged `RateResult[]` instead
 * of the formatted agent string. Org overrides take priority over global rates
 * (by element); falls back to NSW base rates when a non-NSW state has no match.
 *
 * Used by the MMC Direct instant-estimate primitive. `executeLookupCostRate`
 * above is intentionally left untouched (it is on the live MMC Quote path).
 */
export async function lookupRatesStructured(
  input: { category: string; element?: string; state?: string },
  orgId?: string
): Promise<RateResult[]> {
  const state = input.state ?? "NSW";

  const orgRates = orgId
    ? await queryOrgOverrides(orgId, input.category, state, input.element)
    : [];
  const globalRates = await queryGlobalRates(input.category, state, input.element);

  const overrideElements = new Set(orgRates.map((r) => r.element));
  const merged = [
    ...orgRates,
    ...globalRates.filter((r) => !overrideElements.has(r.element)),
  ];

  if (merged.length === 0 && state !== "NSW") {
    const nswOrg = orgId
      ? await queryOrgOverrides(orgId, input.category, "NSW", input.element)
      : [];
    const nswGlobal = await queryGlobalRates(input.category, "NSW", input.element);
    const nswOverrides = new Set(nswOrg.map((r) => r.element));
    return [...nswOrg, ...nswGlobal.filter((r) => !nswOverrides.has(r.element))];
  }

  return merged;
}
