import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyRunComplete } from "@/lib/email/notify-run-complete";
import { db } from "@/lib/supabase/db";
import { retrievePlanChunks } from "@/lib/comply/retriever";
import { callModel } from "@/lib/ai/models/router";
import {
  COST_SUMMARY_PROMPT,
} from "@/lib/ai/prompts/cost-estimation-system";
import {
  COST_EXECUTION_PHASES,
  COST_CATEGORIES,
  getCostCategoryLabel,
  type CostCategory,
  type CostCategoryResult,
} from "@/lib/ai/types";
import {
  runCostAgent,
  type CostDependency,
} from "@/lib/ai/agent/cost-estimation-agent";
import { createReportVersion } from "@/lib/report-versions";

/**
 * Run `fn` over `items` with at most `limit` in flight at once. Used for the
 * merged services+finishes+external phase: those categories run in parallel for
 * speed, but callModel has no rate-limit backoff, so an unbounded Promise.all of
 * 9 large-context calls could trip the provider's tokens-per-minute limit and
 * fail categories (back to empty items). 5 keeps burst load near the previously
 * proven-safe max while still cutting wall-clock vs the old 3 sequential phases.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

export const runCostEstimation = inngest.createFunction(
  {
    id: "run-cost-estimation",
    name: "Run Cost Estimation",
    retries: 1,
  },
  { event: "cost/estimation.requested" },
  async ({ event, step }) => {
    const { projectId, planId } = event.data;
    let estimateId: string | null = null;

    try {

    // 1. Load cost estimate record
    const estimate = await step.run("load-estimate", async () => {
      const { data, error } = await db()
        .from("cost_estimates")
        .select("id, org_id, plan_id, region")
        .eq("project_id", projectId)
        .eq("plan_id", planId)
        .eq("status", "queued")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        throw new Error(`Cost estimate not found: ${error?.message}`);
      }

      return data as { id: string; org_id: string; plan_id: string; region: string | null };
    });

    estimateId = estimate.id;

    // 2. Update status to processing
    await step.run("update-processing", async () => {
      await db()
        .from("cost_estimates")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
          stage: "extract",
        })
        .eq("id", estimate.id);
    });

    // 3. Load plan content
    const planContent = await step.run("load-plan-content", async () => {
      return await retrievePlanChunks(estimate.org_id, estimate.plan_id);
    });

    if (!planContent) {
      await step.run("update-error-no-content", async () => {
        await db()
          .from("cost_estimates")
          .update({
            status: "error",
            summary: "No plan content found. Ensure the plan has been processed.",
          })
          .eq("id", estimate.id);
      });
      return { estimateId: estimate.id, error: "No plan content" };
    }

    // 4. Build project context from questionnaire
    const projectContext = await step.run("load-project-context", async () => {
      const admin = createAdminClient();
      const { data: qr } = await admin
        .from("questionnaire_responses")
        .select("responses")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!qr) return "No questionnaire data available.";

      const r = (qr as { responses: Record<string, unknown> }).responses;
      const lines: string[] = [];
      if (r.floor_area) lines.push(`Floor area: ${r.floor_area} sqm`);
      if (r.storeys) lines.push(`Storeys: ${r.storeys}`);
      if (r.climate_zone) lines.push(`Climate zone: ${r.climate_zone}`);
      if (r.building_class) lines.push(`Building class: ${r.building_class}`);
      if (r.roof_material) lines.push(`Roof: ${r.roof_material}`);
      if (r.wall_cladding) lines.push(`Cladding: ${r.wall_cladding}`);
      if (r.soil_classification) lines.push(`Soil: ${r.soil_classification}`);
      if (r.footing_type) lines.push(`Footings: ${r.footing_type}`);
      if (r.wet_area_count) lines.push(`Wet areas: ${r.wet_area_count}`);
      if (r.has_swimming_pool === "true") lines.push("Has swimming pool");
      if (r.has_solar_pv === "true") lines.push("Has solar PV");
      if (estimate.region) lines.push(`Region/State: ${estimate.region}`);

      return lines.length > 0
        ? `PROJECT DETAILS:\n${lines.join("\n")}`
        : "No detailed project context available.";
    });

    // 4b. Load selected construction systems
    const systemsContext = await step.run("load-selected-systems", async () => {
      const { data } = await db()
        .from("projects")
        .select("selected_systems")
        .eq("id", projectId)
        .single();
      const systems = (data as { selected_systems: string[] | null } | null)?.selected_systems;
      if (!Array.isArray(systems) || systems.length === 0) return "";
      return `\nSelected construction systems: ${systems.join(", ")}. Pre-populate MMC cost items with rates appropriate for these systems.`;
    });

    const fullProjectContext = projectContext + systemsContext;

    // 4c. Gross floor area + flags — the cost driver for the MMC whole-module
    // build-up (computeMmcBuildup). MMC is priced as one module-supply rate per
    // m² + site works, NOT per traditional trade.
    const buildupInputs = await step.run("load-gfa", async () => {
      const admin = createAdminClient();
      const { data: qr } = await admin
        .from("questionnaire_responses")
        .select("responses")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      const r =
        (qr as { responses: Record<string, unknown> } | null)?.responses ?? {};
      const num = (v: unknown) => {
        const n =
          typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
        return Number.isFinite(n) ? n : 0;
      };
      const gfa = num(r.floor_area) + num(r.upper_floor_area);
      const landscaping =
        r.has_landscaping === "true" || r.has_landscaping === true;
      return { gfa, landscaping };
    });

    // 4d. Live MMC market rates (the "Market Rate (sourced 2026, ±15%)" rows),
    // keyed by element so admin edits flow through to the build-up.
    const mmcRateMap = await step.run("load-mmc-rates", async () => {
      const { data } = await db()
        .from("cost_reference_rates")
        .select("element, base_rate")
        .eq("source_id", "00000000-0000-0000-0000-000000000002");
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as { element: string; base_rate: number }[]) {
        map[row.element] = row.base_rate;
      }
      return map;
    });

    // Per-stage signal for the progress UI (cost_estimates.stage).
    await step.run("stage-pricing", async () => {
      await db()
        .from("cost_estimates")
        .update({ stage: "price" })
        .eq("id", estimate.id);
    });

    // 5. Phased parallel agentic execution
    const resultMap = new Map<string, CostCategoryResult>();
    const priorResults = new Map<string, CostCategoryResult>();
    const allDependencies: CostDependency[] = [];

    // Determine active categories (all standard categories for now)
    const activeCategories = COST_CATEGORIES
      .map((c) => c.key)
      .filter((c) => c !== "contingency") as CostCategory[];

    // Group into phases
    const phases: CostCategory[][] = [];
    for (const phase of COST_EXECUTION_PHASES) {
      const activeInPhase = phase.filter((c) =>
        activeCategories.includes(c) && c !== "contingency"
      );
      if (activeInPhase.length > 0) phases.push(activeInPhase);
    }

    for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
      const phaseCategories = phases[phaseIdx];

      const phaseResults = await step.run(
        `agent-phase-${phaseIdx}`,
        async () => {
          const results = await mapWithConcurrency(
            phaseCategories,
            5,
            async (category) => {
              const agentResult = await runCostAgent(
                category,
                planContent,
                fullProjectContext,
                {
                  orgId: estimate.org_id,
                  estimateId: estimate.id,
                  projectId,
                  planId: estimate.plan_id,
                  priorResults,
                  dependencies: allDependencies,
                }
              );

              console.log(
                `[CostAgent] ${category}: ${agentResult.result.line_items.length} items ` +
                  `in ${agentResult.iterations} iterations`
              );

              return {
                category,
                result: agentResult.result,
                dependencies: agentResult.dependencies,
              };
            }
          );

          return results;
        }
      );

      // Accumulate results
      for (const pr of phaseResults) {
        resultMap.set(pr.category, pr.result);
        priorResults.set(pr.category, pr.result);
        allDependencies.push(...pr.dependencies);
      }
    }

    // 6. Calculate totals for contingency
    const allItems = [...resultMap.values()].flatMap((r) => r.line_items);
    const totalTraditional = allItems.reduce((sum, li) => sum + (li.traditional_total ?? 0), 0);
    const totalMmc = allItems.reduce(
      (sum, li) => sum + (li.mmc_total ?? li.traditional_total ?? 0), 0
    );
    const avgConfidence =
      allItems.length > 0
        ? allItems.reduce((sum, li) => sum + li.confidence, 0) / allItems.length
        : 0.7;

    // 7. Contingency phase
    const contingencyResult = await step.run("agent-contingency", async () => {
      const { COST_CONTINGENCY_PROMPT } = await import("@/lib/ai/prompts/cost-estimation-system");

      const result = await callModel("cost_primary", {
        system: "You are an expert Australian quantity surveyor calculating contingency allowances.",
        messages: [{
          role: "user",
          content: COST_CONTINGENCY_PROMPT(totalTraditional, totalMmc, avgConfidence),
        }],
        maxTokens: 1024,
        orgId: estimate.org_id,
        checkId: estimate.id,
      });

      const { extractJson } = await import("@/lib/ai/extract-json");
      return extractJson<CostCategoryResult>(result.text);
    });

    resultMap.set("contingency", contingencyResult);

    // Whole-module MMC build-up. Replaces the per-trade mmc_rate guesses (which
    // produced nonsense — SIP -194%, pods -177%) with a deterministic module-
    // supply + site-works model anchored on gross floor area. When GFA is
    // unknown we can't build it up, so we fall back to the legacy per-trade sum.
    const { computeMmcBuildup } = await import("@/lib/quote/mmc-buildup");
    const mmcBuildup =
      buildupInputs.gfa > 0
        ? computeMmcBuildup(buildupInputs.gfa, mmcRateMap, {
            landscaping: buildupInputs.landscaping,
          })
        : null;

    // 8. Store all line items
    await step.run("store-line-items", async () => {
      let sortOrder = 0;
      // Detect if provenance columns exist by trying one insert with them
      let hasProvenanceCols = true;

      for (const [, categoryResult] of resultMap) {
        for (const li of categoryResult.line_items) {
          const baseRow = {
            estimate_id: estimate.id,
            cost_category: li.cost_category,
            element_description: li.element_description,
            quantity: li.quantity,
            unit: li.unit,
            traditional_rate: li.traditional_rate,
            traditional_total: li.traditional_total,
            // Under the whole-module model the traditional trades carry NO MMC
            // figure — the MMC side is the separate build-up below.
            mmc_rate: mmcBuildup ? null : li.mmc_rate,
            mmc_total: mmcBuildup ? null : li.mmc_total,
            mmc_alternative: mmcBuildup ? null : li.mmc_alternative,
            savings_pct: mmcBuildup ? null : li.savings_pct,
            source: li.source,
            confidence: li.confidence,
            sort_order: sortOrder++,
          };

          if (hasProvenanceCols) {
            const { error } = await db().from("cost_line_items").insert({
              ...baseRow,
              rate_source_name: li.rate_source_name ?? null,
              rate_source_detail: li.rate_source_detail ?? null,
            });
            if (error?.message?.includes("rate_source_name") || error?.message?.includes("column")) {
              // Provenance columns don't exist yet — fall back to base insert
              hasProvenanceCols = false;
              await db().from("cost_line_items").insert(baseRow);
            }
          } else {
            await db().from("cost_line_items").insert(baseRow);
          }
        }
      }
    });

    // 8b. Store the MMC build-up as its own line items — disjoint from the
    // traditional trades (traditional_total null, mmc_total set), so the report
    // and totals treat them as the MMC side, not a per-trade alternative.
    if (mmcBuildup) {
      await step.run("store-mmc-buildup", async () => {
        let sortOrder = 100000; // render after the traditional trades
        for (const l of mmcBuildup.lines) {
          await db()
            .from("cost_line_items")
            .insert({
              estimate_id: estimate.id,
              cost_category: l.cost_category,
              element_description: l.element_description,
              quantity: l.quantity,
              unit: l.unit,
              traditional_rate: null,
              traditional_total: null,
              mmc_rate: l.rate,
              mmc_total: l.mmc_total,
              mmc_alternative: null,
              savings_pct: null,
              source: "reference",
              confidence: 0.85,
              sort_order: sortOrder++,
              rate_source_name: "Market Rate (sourced 2026, +/-15%)",
              rate_source_detail:
                l.cost_category === "mmc_margin"
                  ? "Builder margin on the MMC cost base."
                  : "Market rate (sourced 2026); +/-15% allowance for price creep.",
            } as never);
        }
      });
    }

    // 9. Calculate final totals
    const allFinalItems = [...resultMap.values()].flatMap((r) => r.line_items);
    const finalTraditional = allFinalItems.reduce(
      (sum, li) => sum + (li.traditional_total ?? 0), 0
    );
    // Whole-module model: MMC total is the build-up, not a per-trade sum. Legacy
    // fallback only when GFA was unknown (no build-up).
    const finalMmc = mmcBuildup
      ? mmcBuildup.total
      : allFinalItems.reduce(
          (sum, li) => sum + (li.mmc_total ?? li.traditional_total ?? 0), 0
        );
    const savingsPct = finalTraditional > 0
      ? Math.round(((finalTraditional - finalMmc) / finalTraditional) * 100)
      : 0;

    await step.run("stage-compile", async () => {
      await db()
        .from("cost_estimates")
        .update({ stage: "compile" })
        .eq("id", estimate.id);
    });

    // 10. Generate summary
    const summary = await step.run("generate-summary", async () => {
      const catSummaries = [...resultMap.entries()]
        .map(([cat, result]) => {
          const trad = result.line_items.reduce((s, li) => s + (li.traditional_total ?? 0), 0);
          return `${getCostCategoryLabel(cat)}: $${Math.round(trad).toLocaleString()} (${result.line_items.length} items)`;
        })
        .join("\n");

      // MMC side described as the whole-module build-up, not per-trade.
      const mmcBreakdown = mmcBuildup
        ? `\n\nMMC build-up (${Math.round(buildupInputs.gfa)} m² @ whole-module model):\n` +
          mmcBuildup.lines
            .map((l) => `- ${l.element_description}: $${Math.round(l.mmc_total).toLocaleString()}`)
            .join("\n")
        : "";

      const summaryInput = `Total Traditional (per-trade): $${Math.round(finalTraditional).toLocaleString()}\nTotal MMC (factory module + site works): $${Math.round(finalMmc).toLocaleString()}\nSavings: ${savingsPct}%\n\nTraditional breakdown by trade:\n${catSummaries}${mmcBreakdown}`;

      const result = await callModel("summary", {
        system: "You are a concise technical writer for Australian construction cost reports.",
        messages: [{ role: "user", content: COST_SUMMARY_PROMPT(summaryInput) }],
        maxTokens: 2048,
        orgId: estimate.org_id,
        checkId: estimate.id,
      });

      return result.text;
    });

    // 11. Estimate construction duration
    const durations = await step.run("estimate-duration", async () => {
      const { COST_DURATION_PROMPT } = await import("@/lib/ai/prompts/cost-estimation-system");

      const catSummary = [...resultMap.entries()]
        .map(([cat, result]) => {
          const trad = result.line_items.reduce((s, li) => s + (li.traditional_total ?? 0), 0);
          return `${getCostCategoryLabel(cat)}: $${Math.round(trad).toLocaleString()} (${result.line_items.length} items)`;
        })
        .join("\n");

      try {
        const result = await callModel("cost_primary", {
          system: "You are an expert Australian construction scheduler estimating project durations.",
          messages: [{ role: "user", content: COST_DURATION_PROMPT(fullProjectContext, catSummary) }],
          maxTokens: 1024,
          orgId: estimate.org_id,
          checkId: estimate.id,
        });

        const { extractJson } = await import("@/lib/ai/extract-json");
        const parsed = extractJson<{
          traditional_duration_weeks: number;
          mmc_duration_weeks: number;
          reasoning: string;
        }>(result.text);

        return {
          traditional_duration_weeks: parsed.traditional_duration_weeks,
          mmc_duration_weeks: parsed.mmc_duration_weeks,
        };
      } catch (err) {
        console.warn("[CostEstimation] Duration estimation failed, using defaults:", err);
        return {
          traditional_duration_weeks: 26,
          mmc_duration_weeks: 16,
        };
      }
    });

    // 12. Update completed
    await step.run("update-completed", async () => {
      await db()
        .from("cost_estimates")
        .update({
          status: "completed",
          summary,
          total_traditional: Math.round(finalTraditional),
          total_mmc: Math.round(finalMmc),
          total_savings_pct: savingsPct,
          traditional_duration_weeks: durations.traditional_duration_weeks,
          mmc_duration_weeks: durations.mmc_duration_weeks,
          completed_at: new Date().toISOString(),
        })
        .eq("id", estimate.id);
    });

    // Email the owner it's ready (so they can have left the page). Best-effort.
    await step.run("notify-owner", async () => {
      await notifyRunComplete("quote", estimate.id, true);
    });

    // 13. Save report version
    await step.run("save-report-version", async () => {
      const { data: lineItems } = await db()
        .from("cost_line_items")
        .select("*")
        .eq("estimate_id", estimate.id)
        .order("sort_order", { ascending: true });

      await createReportVersion({
        projectId,
        orgId: estimate.org_id,
        module: "quote",
        sourceId: estimate.id,
        reportData: {
          summary,
          total_traditional: Math.round(finalTraditional),
          total_mmc: Math.round(finalMmc),
          total_savings_pct: savingsPct,
          traditional_duration_weeks: durations.traditional_duration_weeks,
          mmc_duration_weeks: durations.mmc_duration_weeks,
          region: estimate.region,
          line_items: lineItems ?? [],
        },
      });
    });

    return {
      estimateId: estimate.id,
      totalLineItems: allFinalItems.length,
      totalTraditional: Math.round(finalTraditional),
      totalMmc: Math.round(finalMmc),
      savingsPct,
    };

    } catch (err) {
      // Ensure the estimate is marked as error so the UI stops polling
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[CostEstimation] Fatal error: ${errorMsg}`);

      if (estimateId) {
        await step.run("update-error-fatal", async () => {
          await db()
            .from("cost_estimates")
            .update({
              status: "error",
              summary: `Cost estimation failed: ${errorMsg.slice(0, 500)}`,
            })
            .eq("id", estimateId);
        });
      }

      throw err; // Re-throw so Inngest records the failure
    }
  }
);
