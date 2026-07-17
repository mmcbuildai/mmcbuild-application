// SCRUM-172 — prompts for the multi-supplier comparison quote. One price-call
// per (component × supplier) produces a like-for-like installed cost so the
// suppliers can be compared; a final summary call reads the priced rows.

/** Price ONE supplier's product for the component, for THIS project. */
export function SUPPLIER_QUOTE_PROMPT(
  projectContext: string,
  categoryLabel: string,
  product: {
    supplier_name: string;
    product_name: string;
    sku: string | null;
    summary: string | null;
    base_price_estimate: number | null;
    lead_time_days: number | null;
  },
): string {
  const anchor =
    product.base_price_estimate != null
      ? `The supplier lists an indicative price of $${product.base_price_estimate.toLocaleString()} for this product — anchor your estimate on it, adjusting for the project's scale and installation.`
      : `The supplier has not published a price — estimate from comparable Australian market rates for this component.`;

  return `Price the "${categoryLabel}" component for this project using ONE specific supplier's product, so it can be compared like-for-like against other suppliers for the same component.

${projectContext}

SUPPLIER PRODUCT:
- Supplier: ${product.supplier_name}
- Product: ${product.product_name}${product.sku ? ` (SKU ${product.sku})` : ""}
${product.summary ? `- Description: ${product.summary}\n` : ""}- Indicative lead time: ${product.lead_time_days != null ? `${product.lead_time_days} days` : "not stated"}

${anchor}

Estimate the SUPPLIED-AND-INSTALLED cost of this component for THIS project (materials for this product + installation), in Australian dollars. Use the project's gross floor area / scale to size the quantity. Do not price the whole house — only this one component.

Return ONLY a JSON object, no prose, no markdown fences:
{
  "quantity": <number or null — the measured quantity, e.g. m2 / m3 / units>,
  "unit": "<unit string, e.g. m2, m3, item — or null>",
  "unit_rate": <number or null — $ per unit, supplied + installed>,
  "estimated_total": <number — total $ supplied + installed for this project>,
  "confidence": <number 0.0–1.0>,
  "notes": "<one sentence: the key assumption or how this product compares — max 200 chars>"
}`;
}

/** Summarise the priced comparison for the builder. */
export function SUPPLIER_COMPARISON_SUMMARY_PROMPT(
  categoryLabel: string,
  rows: string,
): string {
  return `A builder compared supplier quotes for the "${categoryLabel}" component of their project. The per-supplier results:

${rows}

Write a concise 2–3 sentence procurement summary: name the lowest-cost option, note any meaningful price gap between suppliers, and flag one trade-off worth considering (for example, a cheaper supplier with a longer lead time). Do not invent figures beyond those given. Plain text, no markdown.`;
}
