import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/supabase/db";
import { callModel } from "@/lib/ai/models/router";
import { extractJson } from "@/lib/ai/extract-json";
import { getTechnologyLabel } from "@/lib/ai/types";
import {
  SUPPLIER_QUOTE_PROMPT,
  SUPPLIER_COMPARISON_SUMMARY_PROMPT,
} from "@/lib/ai/prompts/supplier-comparison-system";
import { computeVariantDeltas } from "@/lib/quote/supplier-comparison";

// SCRUM-172 — the multi-supplier fan-out. One AI price-call per selected
// supplier product produces a like-for-like installed cost; the priced rows get
// a delta-vs-lowest and a short procurement summary. Mirrors the honest-error /
// AI-router discipline of run-cost-estimation: every model call goes through
// callModel, failures are surfaced (not masked), and the run is marked `error`
// so the UI stops polling.

interface ComparisonRow {
  id: string;
  org_id: string;
  project_id: string;
  technology_category: string;
  region: string | null;
}

interface VariantRow {
  id: string;
  supplier_name: string;
  product_name: string;
  sku: string | null;
  summary: string | null;
  base_price_estimate: number | null;
  lead_time_days: number | null;
}

interface PricedFields {
  quantity: number | null;
  unit: string | null;
  unit_rate: number | null;
  estimated_total: number | null;
  confidence: number;
  notes: string | null;
}

export const runSupplierComparison = inngest.createFunction(
  {
    id: "run-supplier-comparison",
    name: "Run Supplier Comparison Quote",
    retries: 1,
    onFailure: async ({ event }) => {
      // Terminal failure after retries — ensure the run is flagged so the UI
      // stops polling and shows an honest error rather than spinning forever.
      const comparisonId = (
        event.data.event.data as { comparisonId?: string }
      )?.comparisonId;
      if (!comparisonId) return;
      await db()
        .from("supplier_quote_comparisons")
        .update({
          status: "error",
          summary:
            "Supplier comparison failed to complete. Please try again, or request quotes manually.",
        })
        .eq("id", comparisonId);
    },
  },
  { event: "quote/supplier-comparison.requested" },
  async ({ event, step }) => {
    const { comparisonId } = event.data as { comparisonId: string };

    try {
      // 1. Load the comparison run
      const comparison = await step.run("load-comparison", async () => {
        const { data, error } = await db()
          .from("supplier_quote_comparisons")
          .select("id, org_id, project_id, technology_category, region")
          .eq("id", comparisonId)
          .single();
        if (error || !data) {
          throw new Error(`Comparison not found: ${error?.message}`);
        }
        return data as ComparisonRow;
      });

      // 2. Mark processing
      await step.run("update-processing", async () => {
        await db()
          .from("supplier_quote_comparisons")
          .update({ status: "processing" })
          .eq("id", comparisonId);
      });

      // 3. Load the seeded variants (one per selected supplier product)
      const variants = await step.run("load-variants", async () => {
        const { data } = await db()
          .from("supplier_quote_variants")
          .select(
            "id, supplier_name, product_name, sku, summary, base_price_estimate, lead_time_days",
          )
          .eq("comparison_id", comparisonId)
          .order("sort_order", { ascending: true });
        return (data ?? []) as VariantRow[];
      });

      if (variants.length === 0) {
        await step.run("update-no-variants", async () => {
          await db()
            .from("supplier_quote_comparisons")
            .update({
              status: "error",
              summary: "No suppliers were selected for this comparison.",
            })
            .eq("id", comparisonId);
        });
        return { comparisonId, error: "No variants" };
      }

      // 4. Build the project pricing context (GFA + key drivers)
      const projectContext = await step.run("load-context", async () => {
        const admin = createAdminClient();
        const { data: qr } = await admin
          .from("questionnaire_responses")
          .select("responses")
          .eq("project_id", comparison.project_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const r =
          (qr as { responses: Record<string, unknown> } | null)?.responses ??
          {};
        const num = (v: unknown) => {
          const n =
            typeof v === "string"
              ? parseFloat(v)
              : typeof v === "number"
                ? v
                : NaN;
          return Number.isFinite(n) ? n : 0;
        };
        const gfa = num(r.floor_area) + num(r.upper_floor_area);

        const lines: string[] = [];
        if (gfa > 0) lines.push(`Gross floor area: ${gfa} sqm`);
        if (r.storeys) lines.push(`Storeys: ${r.storeys}`);
        if (r.building_class) lines.push(`Building class: ${r.building_class}`);
        if (r.soil_classification)
          lines.push(`Soil: ${r.soil_classification}`);
        if (r.footing_type) lines.push(`Footings: ${r.footing_type}`);
        if (comparison.region) lines.push(`Region/State: ${comparison.region}`);

        return lines.length > 0
          ? `PROJECT DETAILS:\n${lines.join("\n")}`
          : "No detailed project context available.";
      });

      const categoryLabel = getTechnologyLabel(comparison.technology_category);

      // 5. Price each variant — one call per supplier. ≤3 variants, so run
      //    sequentially: safest for the provider's tokens-per-minute limit and
      //    the wall-clock cost is trivial. A failed call degrades to an
      //    unpriced row (honest "manual quote" note), never a fake figure.
      const priced = await step.run("price-variants", async () => {
        const out: (PricedFields & { id: string })[] = [];
        for (const v of variants) {
          try {
            const result = await callModel("cost_primary", {
              system:
                "You are an expert Australian quantity surveyor pricing a single building component from one supplier's product for a specific project. Return ONLY JSON.",
              messages: [
                {
                  role: "user",
                  content: SUPPLIER_QUOTE_PROMPT(projectContext, categoryLabel, v),
                },
              ],
              maxTokens: 800,
              orgId: comparison.org_id,
              checkId: comparison.id,
            });

            const parsed = extractJson<PricedFields>(result.text);
            const total =
              typeof parsed.estimated_total === "number" &&
              Number.isFinite(parsed.estimated_total)
                ? parsed.estimated_total
                : null;
            out.push({
              id: v.id,
              quantity: parsed.quantity ?? null,
              unit: parsed.unit ?? null,
              unit_rate: parsed.unit_rate ?? null,
              estimated_total: total,
              confidence:
                typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
              notes: parsed.notes ?? null,
            });
          } catch (err) {
            console.error(
              `[SupplierComparison] pricing failed for "${v.product_name}":`,
              err instanceof Error ? err.message : String(err),
            );
            out.push({
              id: v.id,
              quantity: null,
              unit: null,
              unit_rate: null,
              estimated_total: null,
              confidence: 0,
              notes:
                "Automated pricing unavailable for this supplier — request a manual quote.",
            });
          }
        }
        return out;
      });

      // 6. Compute delta-vs-lowest across the priced set (single source of the
      //    "lowest" flag + deltas — the pure helper the tests cover).
      const withDeltas = computeVariantDeltas(priced);

      // 7. Persist each variant's price + delta
      await step.run("store-variant-prices", async () => {
        for (const v of withDeltas) {
          await db()
            .from("supplier_quote_variants")
            .update({
              quantity: v.quantity,
              unit: v.unit,
              unit_rate: v.unit_rate,
              estimated_total: v.estimated_total,
              confidence: v.confidence,
              notes: v.notes,
              delta_vs_lowest_pct: v.delta_vs_lowest_pct,
              is_lowest: v.is_lowest,
            })
            .eq("id", v.id);
        }
      });

      // 8. Procurement summary (best-effort — never fails the run)
      const summary = await step.run("generate-summary", async () => {
        const byId = new Map(variants.map((v) => [v.id, v]));
        const priceable = withDeltas.filter((v) => v.estimated_total != null);
        if (priceable.length === 0) {
          return "Automated pricing was unavailable for the selected suppliers. Request manual quotes from each and compare.";
        }
        const rows = withDeltas
          .map((v) => {
            const meta = byId.get(v.id);
            const name = `${meta?.supplier_name ?? "Supplier"} — ${meta?.product_name ?? ""}`;
            const price =
              v.estimated_total != null
                ? `$${Math.round(v.estimated_total).toLocaleString()}`
                : "no automated price";
            const rel = v.is_lowest
              ? " (lowest)"
              : v.delta_vs_lowest_pct != null
                ? ` (+${v.delta_vs_lowest_pct}% vs lowest)`
                : "";
            const lead =
              meta?.lead_time_days != null
                ? `, ${meta.lead_time_days}d lead time`
                : "";
            return `${name}: ${price}${rel}${lead}`;
          })
          .join("\n");

        try {
          const result = await callModel("summary", {
            system:
              "You are a concise construction procurement adviser for an Australian builder.",
            messages: [
              {
                role: "user",
                content: SUPPLIER_COMPARISON_SUMMARY_PROMPT(categoryLabel, rows),
              },
            ],
            maxTokens: 512,
            orgId: comparison.org_id,
            checkId: comparison.id,
          });
          return result.text;
        } catch {
          return `Compared ${priceable.length} supplier quote(s) for ${categoryLabel}. See the table below for per-supplier pricing, lead times and the delta against the lowest.`;
        }
      });

      // 9. Complete
      await step.run("update-completed", async () => {
        await db()
          .from("supplier_quote_comparisons")
          .update({
            status: "completed",
            summary,
            completed_at: new Date().toISOString(),
          })
          .eq("id", comparisonId);
      });

      return {
        comparisonId,
        pricedVariants: withDeltas.filter((v) => v.estimated_total != null)
          .length,
        totalVariants: variants.length,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[SupplierComparison] Fatal error: ${errorMsg}`);
      await step.run("update-error-fatal", async () => {
        await db()
          .from("supplier_quote_comparisons")
          .update({
            status: "error",
            summary: `Supplier comparison failed: ${errorMsg.slice(0, 300)}`,
          })
          .eq("id", comparisonId);
      });
      throw err; // Re-throw so Inngest records the failure
    }
  },
);
