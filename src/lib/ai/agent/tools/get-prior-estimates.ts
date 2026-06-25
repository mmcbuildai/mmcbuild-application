/**
 * Agent Tool: get_prior_estimates
 * Access estimates from already-costed categories for cross-category awareness.
 */

import type { CostCategoryResult } from "@/lib/ai/types";

export const getPriorEstimatesDef = {
  name: "get_prior_estimates",
  description:
    "Get cost estimates from categories that have already been costed in earlier phases. " +
    "Use this for cross-category awareness (e.g., checking frame costs to inform scaffolding in preliminaries).",
  input_schema: {
    type: "object" as const,
    properties: {
      categories: {
        type: "array",
        items: { type: "string" },
        description: "Category keys to retrieve estimates from (e.g., ['frame', 'substructure'])",
      },
    },
    required: ["categories"],
  },
};

export function executeGetPriorEstimates(
  input: { categories: string[] },
  context: { priorResults: Map<string, CostCategoryResult> }
): string {
  const results: string[] = [];

  for (const cat of input.categories) {
    const result = context.priorResults.get(cat);
    if (!result) {
      results.push(`[${cat}] Not yet estimated.`);
      continue;
    }

    if (result.line_items.length === 0) {
      results.push(`[${cat}] No line items.`);
      continue;
    }

    const traditionalTotal = result.line_items.reduce(
      (sum, li) => sum + (li.traditional_total ?? 0), 0
    );
    const mmcTotal = result.line_items.reduce(
      (sum, li) => sum + (li.mmc_total ?? li.traditional_total ?? 0), 0
    );

    const lines = result.line_items.map(
      (li) =>
        `  - ${li.element_description}: ${li.quantity} ${li.unit} × $${li.traditional_rate}/${li.unit} = $${(li.traditional_total ?? 0).toLocaleString()}` +
        (li.mmc_total ? ` (MMC: $${li.mmc_total.toLocaleString()})` : "")
    );

    results.push(
      `[${cat}] Traditional: $${traditionalTotal.toLocaleString()}, MMC: $${mmcTotal.toLocaleString()}\n${lines.join("\n")}`
    );
  }

  return results.join("\n\n");
}
