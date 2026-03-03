import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return createAdminClient() as unknown as any; }

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
      if (r.framing_material) lines.push(`Framing: ${r.framing_material}`);
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
          const results = await Promise.all(
            phaseCategories.map(async (category) => {
              const agentResult = await runCostAgent(
                category,
                planContent,
                projectContext,
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
            })
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
            mmc_rate: li.mmc_rate,
            mmc_total: li.mmc_total,
            mmc_alternative: li.mmc_alternative,
            savings_pct: li.savings_pct,
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

    // 9. Calculate final totals
    const allFinalItems = [...resultMap.values()].flatMap((r) => r.line_items);
    const finalTraditional = allFinalItems.reduce(
      (sum, li) => sum + (li.traditional_total ?? 0), 0
    );
    const finalMmc = allFinalItems.reduce(
      (sum, li) => sum + (li.mmc_total ?? li.traditional_total ?? 0), 0
    );
    const savingsPct = finalTraditional > 0
      ? Math.round(((finalTraditional - finalMmc) / finalTraditional) * 100)
      : 0;

    // 10. Generate summary
    const summary = await step.run("generate-summary", async () => {
      const catSummaries = [...resultMap.entries()]
        .map(([cat, result]) => {
          const trad = result.line_items.reduce((s, li) => s + (li.traditional_total ?? 0), 0);
          const mmc = result.line_items.reduce(
            (s, li) => s + (li.mmc_total ?? li.traditional_total ?? 0), 0
          );
          return `${getCostCategoryLabel(cat)}: Traditional $${Math.round(trad).toLocaleString()}, MMC $${Math.round(mmc).toLocaleString()} (${result.line_items.length} items)`;
        })
        .join("\n");

      const summaryInput = `Total Traditional: $${Math.round(finalTraditional).toLocaleString()}\nTotal MMC: $${Math.round(finalMmc).toLocaleString()}\nSavings: ${savingsPct}%\n\nBreakdown by category:\n${catSummaries}`;

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
          messages: [{ role: "user", content: COST_DURATION_PROMPT(projectContext, catSummary) }],
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
