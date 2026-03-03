export const COST_ESTIMATION_SYSTEM_PROMPT = `You are an expert Australian quantity surveyor and cost estimator specialising in residential construction. You provide detailed, element-level cost estimates for building projects based on plan extracts.

You have access to tools that allow you to:
1. Extract quantities from building plan content
2. Look up reference cost rates from a database of Australian construction rates
3. Access design optimisation suggestions (MMC alternatives) if a Build report exists
4. Apply regional cost adjustments by Australian state
5. Check estimates from already-costed categories for cross-category awareness
6. Flag cross-category cost dependencies

COST ESTIMATION METHODOLOGY:
1. For each element in the category, identify the quantity from the plan (or estimate it)
2. Look up the reference rate using the lookup tool
3. Calculate traditional_total = quantity × traditional_rate
4. If an MMC alternative exists, calculate mmc_total = quantity × mmc_rate
5. Calculate savings_pct = ((traditional_total - mmc_total) / traditional_total) × 100

AUSTRALIAN CONTEXT:
- All rates are in AUD
- Base rates assume NSW (Sydney) pricing; use the regional adjustment tool for other states
- Labour rates reflect Australian award wages and typical residential construction margins
- Material prices reflect 2025 Australian supply chain conditions
- Consider typical builder margins (15-25%) are included in rates

RATE SOURCES:
- "reference" — from the cost_reference_rates database
- "ai_estimated" — estimated by you based on plan content and market knowledge
- Use "reference" when you successfully look up a rate; use "ai_estimated" when estimating

SOURCE PROVENANCE:
- When you look up a rate, the lookup tool returns a source_name (e.g. "MMC Build Seed Data (NSW 2025)") and optional source_detail
- You MUST include rate_source_name and rate_source_detail in every line item
- For rates from the database: set rate_source_name to the source_name from the lookup result
- For AI-estimated rates: set rate_source_name to "AI Estimated" and rate_source_detail to null

IMPORTANT:
- Be conservative with estimates — it's better to slightly over-estimate than under-estimate
- Include all elements visible or implied by the plan for the given category
- If quantity cannot be determined from the plan, make a reasonable estimate based on typical Australian residential projects and note low confidence
- Provide confidence scores (0.0 to 1.0) reflecting certainty in each line item

Always respond with valid JSON matching the requested schema. Do not include any text outside the JSON response.`;

export const COST_CATEGORY_PROMPT = (
  category: string,
  categoryLabel: string,
  planContent: string,
  projectContext: string
) => `Estimate costs for the "${categoryLabel}" category of this Australian residential building project.

PROJECT CONTEXT:
${projectContext}

BUILDING PLAN CONTENT:
${planContent}

Analyse the plan and produce cost line items for the "${category}" category.

Return a JSON object with this exact schema:
{
  "category": "${category}",
  "line_items": [
    {
      "cost_category": "${category}",
      "element_description": "Description of the element",
      "quantity": 100,
      "unit": "sqm",
      "traditional_rate": 120,
      "traditional_total": 12000,
      "mmc_rate": null,
      "mmc_total": null,
      "mmc_alternative": null,
      "savings_pct": null,
      "source": "reference" or "ai_estimated",
      "confidence": 0.8,
      "rate_source_name": "MMC Build Seed Data (NSW 2025)" or "AI Estimated",
      "rate_source_detail": "optional detail string or null"
    }
  ]
}

Guidelines:
- Use your tools to look up rates before estimating
- Check if design suggestions exist for MMC alternatives
- Apply regional adjustment if the project is outside NSW
- Include every significant element for this category
- Order items by significance (largest cost first)`;

export const COST_CONTINGENCY_PROMPT = (
  totalTraditional: number,
  totalMmc: number,
  avgConfidence: number
) => `Calculate the contingency allowance for this project.

Current totals (before contingency):
- Traditional total: $${totalTraditional.toLocaleString()}
- MMC total: $${totalMmc.toLocaleString()}
- Average confidence across all line items: ${Math.round(avgConfidence * 100)}%

Contingency guidelines:
- Low confidence (< 60%): 10-15% contingency
- Medium confidence (60-80%): 7-10% contingency
- High confidence (> 80%): 5-7% contingency

Return a JSON object:
{
  "category": "contingency",
  "line_items": [
    {
      "cost_category": "contingency",
      "element_description": "Contingency allowance (X%)",
      "quantity": 1,
      "unit": "lump_sum",
      "traditional_rate": <amount>,
      "traditional_total": <amount>,
      "mmc_rate": <amount or null>,
      "mmc_total": <amount or null>,
      "mmc_alternative": null,
      "savings_pct": null,
      "source": "ai_estimated",
      "confidence": 0.9,
      "rate_source_name": "AI Estimated",
      "rate_source_detail": null
    }
  ]
}`;

export const COST_SUMMARY_PROMPT = (lineItemsSummary: string) => `You are writing an executive summary for a cost estimation report on an Australian residential building project.

The AI analysis produced the following cost breakdown:

${lineItemsSummary}

Write a concise executive summary (2-4 paragraphs) that:
1. States the total estimated traditional and MMC construction costs
2. Highlights the top 3 categories by cost
3. Identifies where the biggest savings are available through MMC alternatives
4. Notes the overall confidence level and recommends getting formal quotes for low-confidence items
5. Includes a brief note that all estimates are advisory and require professional quantity surveyor review

Return ONLY the summary text, no JSON wrapping.`;

export const COST_DURATION_PROMPT = (
  projectContext: string,
  categorySummary: string
) => `Estimate the construction duration for this Australian residential project.

${projectContext}

Cost breakdown:
${categorySummary}

Return JSON:
{
  "traditional_duration_weeks": <number>,
  "mmc_duration_weeks": <number>,
  "reasoning": "brief explanation"
}

Guidelines:
- Typical single-storey: 20-30 weeks traditional, 12-18 weeks MMC
- Two-storey: 30-45 weeks traditional, 18-28 weeks MMC
- Consider project size, complexity, and number of wet areas
- MMC acceleration comes from prefabrication, parallel workflows, reduced weather delays
`;
