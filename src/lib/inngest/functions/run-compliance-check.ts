import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyRunComplete } from "@/lib/email/notify-run-complete";
import {
  analyseCompliance,
  generateSummary,
  runAgentAnalysis,
  type CrossCategoryDependency,
} from "@/lib/ai/claude";
import { retrieveContext, retrievePlanChunks } from "@/lib/comply/retriever";
import { enhancedRetrieve } from "@/lib/comply/enhanced-retriever";
import { COMPLIANCE_USER_CONTEXT_TEMPLATE } from "@/lib/ai/prompts/compliance-system";
import { NCC_CATEGORIES, CATEGORY_DEFAULT_DISCIPLINE, type ComplianceSectionResult, type NccCategory } from "@/lib/ai/types";
import {
  crossValidate,
  shouldCrossValidate,
  getValidationTier,
} from "@/lib/ai/validation/cross-validator";
import { EXECUTION_PHASES, getCategoryPhase } from "@/lib/ai/agent/compliance-agent";
import { getFewShotExamples } from "@/lib/ai/feedback/prompt-enricher";
import { calibrateConfidence } from "@/lib/ai/feedback/confidence-calibrator";
import { createReportVersion } from "@/lib/report-versions";
import { carryForwardWaivers } from "@/lib/comply/check-delta";

const ENABLE_CROSS_VALIDATION = process.env.ENABLE_CROSS_VALIDATION !== "false";
const CROSS_VALIDATION_TIER = parseInt(process.env.CROSS_VALIDATION_TIER ?? "2", 10);
const ENABLE_AGENTIC = process.env.ENABLE_AGENTIC_COMPLIANCE === "true";

interface AnalysisStepResult {
  result: ComplianceSectionResult;
  nccContext: string;
  chunkIds: string[];
  validationTier: number;
}

export const runComplianceCheck = inngest.createFunction(
  {
    id: "run-compliance-check",
    name: "Run Compliance Check",
    retries: 1,
    // Without this, a thrown step error left the check stuck at "processing"
    // forever (the UI spins, never showing why). Record the REAL reason on the
    // check so the user sees the cause (Diagnostic Integrity) and the UI shows
    // the error state. Mirrors process-plan's onFailure. (2026-06-11)
    //
    // Hardened 2026-06-20 (Karen live incident): a #49 parallel-pipeline run
    // FAILED in Inngest but the row stayed "processing" (infinite spinner). The
    // handler must NEVER throw or silently no-op — wrap everything, extract the
    // event payload defensively (SDK failure-event nesting varies), target the
    // actual queued/processing row, and log every branch so a future silent
    // failure is visible. The reaper cron is the backstop for jobs that are
    // LOST entirely and never reach this handler.
    onFailure: async ({ error, event }) => {
      try {
        const ev = event as unknown as {
          data?: {
            event?: { data?: { projectId?: string; planId?: string } };
            projectId?: string;
            planId?: string;
          };
        };
        const orig = ev?.data?.event?.data ?? ev?.data ?? {};
        const projectId = orig.projectId;
        const planId = orig.planId;
        if (!projectId || !planId) {
          console.error(
            `[runComplianceCheck.onFailure] missing projectId/planId; cannot flip row. err=${error.message}`
          );
          return;
        }
        const admin = createAdminClient();
        const { data: check, error: lookupErr } = await admin
          .from("compliance_checks")
          .select("id")
          .eq("project_id", projectId)
          .eq("plan_id", planId)
          .in("status", ["queued", "processing"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lookupErr || !check) {
          console.error(
            `[runComplianceCheck.onFailure] no queued/processing check for project=${projectId} plan=${planId} (lookupErr=${lookupErr?.message}). err=${error.message}`
          );
          return;
        }
        const { error: updErr } = await admin
          .from("compliance_checks")
          .update({
            status: "error",
            summary: `Compliance check failed: ${error.message.slice(0, 500)}`,
            progress_current: null,
            completed_at: new Date().toISOString(),
          } as never)
          .eq("id", (check as { id: string }).id);
        if (updErr) {
          console.error(
            `[runComplianceCheck.onFailure] update failed for check ${(check as { id: string }).id}: ${updErr.message}`
          );
        } else {
          console.error(
            `[runComplianceCheck.onFailure] check ${(check as { id: string }).id} -> error: ${error.message}`
          );
        }
      } catch (e) {
        console.error(
          `[runComplianceCheck.onFailure] handler threw: ${(e as Error).message}`
        );
      }
    },
  },
  { event: "compliance/check.requested" },
  async ({ event, step }) => {
    const { projectId, planId, questionnaireData, recheckCategories } =
      event.data;
    // A scoped re-check carries a non-empty subset of NCC category keys; only
    // those are re-analysed, the rest are carried forward from the parent.
    const scopedCategories =
      Array.isArray(recheckCategories) && recheckCategories.length > 0
        ? new Set(recheckCategories)
        : null;

    // 1. Load compliance check record
    const check = await step.run("load-check", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("compliance_checks")
        .select("id, org_id, plan_id, questionnaire_id, parent_check_id")
        .eq("project_id", projectId)
        .eq("plan_id", planId)
        .eq("status", "queued")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        throw new Error(`Compliance check not found: ${error?.message}`);
      }

      // parent_check_id is added by migration 00064 and may not yet be in the
      // generated Supabase types — cast through unknown.
      return data as unknown as {
        id: string;
        org_id: string;
        plan_id: string;
        questionnaire_id: string | null;
        parent_check_id: string | null;
      };
    });

    // 2. Update status to processing
    await step.run("update-status-processing", async () => {
      const admin = createAdminClient();
      await admin
        .from("compliance_checks")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
        } as never)
        .eq("id", check.id);
    });

    // 3. Load plan text
    const planContent = await step.run("load-plan-content", async () => {
      return await retrievePlanChunks(check.org_id, check.plan_id);
    });

    // 4. Build project context from questionnaire
    const projectContext = await step.run("build-context", async () => {
      const q = questionnaireData as Record<string, string | number | boolean>;
      return COMPLIANCE_USER_CONTEXT_TEMPLATE(q);
    });

    // 4b. Load certifications on file
    const certContext = await step.run("load-certifications", async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("project_certifications")
        .select("cert_type, file_name, issuer_name, issue_date, status")
        .eq("project_id", projectId)
        .eq("status", "ready");

      if (!data || data.length === 0) return "";

      const lines = (data as { cert_type: string; file_name: string; issuer_name: string | null; issue_date: string | null }[])
        .map((c) => {
          let line = `- ${c.cert_type}: ${c.file_name}`;
          if (c.issuer_name) line += ` (by ${c.issuer_name})`;
          if (c.issue_date) line += ` [${c.issue_date}]`;
          return line;
        });

      return `\n\nENGINEERING CERTIFICATIONS ON FILE:\n${lines.join("\n")}`;
    });

    // 4c. Load selected construction systems
    const systemsContext = await step.run("load-selected-systems", async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("projects")
        .select("selected_systems")
        .eq("id", projectId)
        .single();
      const systems = (data as { selected_systems: string[] | null } | null)?.selected_systems;
      if (!Array.isArray(systems) || systems.length === 0) return "";
      return `\n\nSELECTED CONSTRUCTION SYSTEMS:\nThe project uses the following MMC systems: ${systems.join(", ")}.\nFocus compliance analysis on NCC clauses relevant to these construction methods (e.g. fire rating for CLT, bracing for steel frame).`;
    });

    const fullContext = projectContext + certContext + systemsContext;

    // 5. Determine which categories to analyse
    const categoriesToAnalyse = await step.run("select-categories", async () => {
      const q = questionnaireData as Record<string, string>;
      const categories = NCC_CATEGORIES.map((c) => c.key);

      const skip: NccCategory[] = [];

      if (!q.bal_rating || q.bal_rating === "N/A" || q.bal_rating === "BAL-LOW") {
        skip.push("bushfire");
      }

      if (q.has_swimming_pool !== "true" && q.has_heating_appliance !== "true") {
        skip.push("ancillary");
      }

      const buildingClass = q.building_class ?? "";
      if (buildingClass.startsWith("Class 10")) {
        skip.push("livable_housing", "health_amenity", "safe_movement");
      }

      const applicable = categories.filter((c) => !skip.includes(c));
      // Scoped re-check: restrict to the requested domains (still honouring the
      // skip rules above). Other domains are carried forward, not re-analysed.
      return scopedCategories
        ? applicable.filter((c) => scopedCategories.has(c))
        : applicable;
    });

    // 6. Analysis — agentic (phased parallel) or standard (sequential)
    let analysisResults: AnalysisStepResult[];

    if (ENABLE_AGENTIC) {
      analysisResults = await runAgenticPipeline(
        step, categoriesToAnalyse, check, planContent, fullContext
      );
    } else {
      analysisResults = await runStandardPipeline(
        step, categoriesToAnalyse, check, planContent, fullContext
      );
    }

    // 7. Cross-validation for tier 1/2 categories (if enabled)
    const validatedResults: Array<{
      result: ComplianceSectionResult;
      chunkIds: string[];
      validationTier: number;
      agreementScore: number | null;
      secondaryModel: string | null;
      wasReconciled: boolean;
    }> = [];

    // Cross-validate the eligible categories in parallel batches — independent
    // per category, same batching as the analysis above so no single step risks
    // the function timeout.
    const valPairs = categoriesToAnalyse.map((category, i) => ({
      category,
      analysis: analysisResults[i],
    }));
    const valBatches = chunk(valPairs, ANALYSIS_CONCURRENCY);
    for (let b = 0; b < valBatches.length; b++) {
      const batchValidated = await step.run(`cross-validate-${b}`, async () => {
        return await Promise.all(
          valBatches[b].map(async ({ category, analysis }) => {
            if (
              ENABLE_CROSS_VALIDATION &&
              shouldCrossValidate(category, CROSS_VALIDATION_TIER, analysis.result)
            ) {
              const validation = await crossValidate(
                category as NccCategory,
                analysis.result,
                planContent,
                fullContext,
                analysis.nccContext,
                { orgId: check.org_id, checkId: check.id }
              );
              return {
                result: validation.reconciled,
                chunkIds: analysis.chunkIds,
                validationTier: analysis.validationTier,
                agreementScore: validation.agreement_score,
                secondaryModel: validation.secondary_model,
                wasReconciled: validation.was_reconciled,
              };
            }
            return {
              result: analysis.result,
              chunkIds: analysis.chunkIds,
              validationTier: analysis.validationTier,
              agreementScore: null as number | null,
              secondaryModel: null as string | null,
              wasReconciled: false,
            };
          })
        );
      });
      validatedResults.push(...batchValidated);
    }

    const allResults = validatedResults.map((v) => v.result);

    // 8. Store findings with validation metadata
    await step.run("store-findings", async () => {
      const admin = createAdminClient();
      let sortOrder = 0;

      for (let i = 0; i < validatedResults.length; i++) {
        const v = validatedResults[i];
        for (const finding of v.result.findings) {
          await admin.from("compliance_findings").insert({
            check_id: check.id,
            ncc_section: finding.ncc_section,
            category: finding.category,
            title: finding.title,
            description: finding.description,
            recommendation: finding.recommendation,
            severity: finding.severity,
            confidence: finding.confidence,
            ncc_citation: finding.ncc_citation,
            page_references: finding.page_references,
            sort_order: sortOrder++,
            validation_tier: v.validationTier,
            agreement_score: v.agreementScore,
            secondary_model: v.secondaryModel,
            was_reconciled: v.wasReconciled,
            source_chunk_ids: v.chunkIds,
            responsible_discipline: finding.responsible_discipline
              ?? CATEGORY_DEFAULT_DISCIPLINE[finding.category] ?? "builder",
            remediation_action: finding.remediation_action ?? finding.recommendation,
            review_status: "pending",
          } as never);
        }
      }
    });

    // 8a. Scoped re-check: carry forward the findings for every domain we did
    // NOT re-analyse, verbatim (including their resolution state), so the new
    // report is COMPLETE — freshly re-verified domains + unchanged domains. Only
    // runs on a scoped re-check chained to a parent. Best-effort within its own
    // step: a failure here must never fail the whole check.
    if (scopedCategories && check.parent_check_id) {
      await step.run("carry-forward-unchecked-findings", async () => {
        try {
          const admin = createAdminClient();
          const { data: parentFindings, error: pErr } = await admin
            .from("compliance_findings")
            .select("*")
            .eq("check_id", check.parent_check_id as string);
          if (pErr || !parentFindings) {
            console.error(
              `[runComplianceCheck.carry-forward-unchecked] parent load failed: ${pErr?.message}`,
            );
            return { carried: 0 };
          }

          // Continue the sort order after the freshly-analysed findings.
          const { count } = await admin
            .from("compliance_findings")
            .select("id", { count: "exact", head: true })
            .eq("check_id", check.id);
          let sortOrder = count ?? 0;

          let carried = 0;
          for (const r of parentFindings as Record<string, unknown>[]) {
            // Domains we re-analysed already have fresh findings — skip them.
            if (scopedCategories.has(r.category as string)) continue;
            const { error: insErr } = await admin
              .from("compliance_findings")
              .insert({
                check_id: check.id,
                ncc_section: r.ncc_section,
                category: r.category,
                title: r.title,
                description: r.description,
                recommendation: r.recommendation,
                severity: r.severity,
                confidence: r.confidence,
                ncc_citation: r.ncc_citation,
                page_references: r.page_references,
                sort_order: sortOrder++,
                validation_tier: r.validation_tier,
                agreement_score: r.agreement_score,
                secondary_model: r.secondary_model,
                was_reconciled: r.was_reconciled,
                source_chunk_ids: r.source_chunk_ids,
                responsible_discipline: r.responsible_discipline,
                remediation_action: r.remediation_action,
                review_status: r.review_status,
                // Preserve the carried-forward domain's resolution state — it was
                // NOT re-checked, so its last-known verdict stands.
                resolution_type: r.resolution_type,
                resolution_note: r.resolution_note,
                waiver_reason: r.waiver_reason,
                resolved_by: r.resolved_by,
                resolved_at: r.resolved_at,
              } as never);
            if (insErr) {
              console.error(
                `[runComplianceCheck.carry-forward-unchecked] insert failed: ${insErr.message}`,
              );
            } else {
              carried++;
            }
          }
          console.log(
            `[runComplianceCheck.carry-forward-unchecked] carried ${carried} findings from parent ${check.parent_check_id}`,
          );
          return { carried };
        } catch (e) {
          console.error(
            `[runComplianceCheck.carry-forward-unchecked] threw (non-fatal): ${(e as Error).message}`,
          );
          return { carried: 0 };
        }
      });
    }

    // 8b. Carry parent WAIVERS forward (Comply Phase 3 re-check).
    // A finding the builder WAIVED in the parent check must not reappear as a
    // fresh open item in this re-check — auto-apply the parent's waiver to the
    // matching child finding (matched by ncc_section + category). Resolutions
    // via updated_drawings/evidence do NOT carry: those re-verify by this check.
    //
    // Best-effort: a failure here must NEVER fail the whole check. The worst
    // case is a waived item re-shows as open, which the builder can re-waive.
    if (check.parent_check_id) {
      await step.run("carry-forward-waivers", async () => {
        try {
          const admin = createAdminClient();

          const { data: parentWaived, error: parentErr } = await admin
            .from("compliance_findings")
            .select("ncc_section, category, resolution_type, waiver_reason, resolved_by")
            .eq("check_id", check.parent_check_id as string)
            .eq("resolution_type", "waiver");

          if (parentErr) {
            console.error(
              `[runComplianceCheck.carry-forward-waivers] parent load failed: ${parentErr.message}`
            );
            return { carried: 0 };
          }
          if (!parentWaived || parentWaived.length === 0) {
            return { carried: 0 };
          }

          const { data: childFindings, error: childErr } = await admin
            .from("compliance_findings")
            .select("id, ncc_section, category")
            .eq("check_id", check.id);

          if (childErr || !childFindings) {
            console.error(
              `[runComplianceCheck.carry-forward-waivers] child load failed: ${childErr?.message}`
            );
            return { carried: 0 };
          }

          const carryForwards = carryForwardWaivers(
            parentWaived as unknown as {
              ncc_section: string;
              category: string;
              resolution_type: string | null;
              waiver_reason: string | null;
              resolved_by: string | null;
            }[],
            childFindings as unknown as {
              id: string;
              ncc_section: string;
              category: string;
            }[]
          );

          const nowIso = new Date().toISOString();
          let carried = 0;
          for (const cf of carryForwards) {
            const { error: updErr } = await admin
              .from("compliance_findings")
              .update({
                resolution_type: "waiver",
                waiver_reason: cf.waiverReason,
                resolved_by: cf.resolvedBy,
                resolved_at: nowIso,
              } as never)
              .eq("id", cf.childFindingId);
            if (updErr) {
              console.error(
                `[runComplianceCheck.carry-forward-waivers] update failed for finding ${cf.childFindingId}: ${updErr.message}`
              );
            } else {
              carried++;
            }
          }

          console.log(
            `[runComplianceCheck.carry-forward-waivers] carried ${carried}/${carryForwards.length} waivers from parent ${check.parent_check_id}`
          );
          return { carried };
        } catch (e) {
          console.error(
            `[runComplianceCheck.carry-forward-waivers] threw (non-fatal): ${(e as Error).message}`
          );
          return { carried: 0 };
        }
      });
    }

    // 9. Generate summary
    const summary = await step.run("generate-summary", async () => {
      return await generateSummary(allResults, fullContext, {
        orgId: check.org_id,
        checkId: check.id,
      });
    });

    // 10. Update check as completed
    await step.run("update-status-completed", async () => {
      const admin = createAdminClient();
      await admin
        .from("compliance_checks")
        .update({
          status: "completed",
          summary: summary.summary,
          overall_risk: summary.overall_risk,
          completed_at: new Date().toISOString(),
          progress_current: null,
        } as never)
        .eq("id", check.id);
    });

    // Email the owner it's ready (so they can have left the page). Best-effort.
    await step.run("notify-owner", async () => {
      await notifyRunComplete("comply", check.id, true);
    });

    // 11. Save report version
    await step.run("save-report-version", async () => {
      const admin = createAdminClient();
      const { data: findings } = await admin
        .from("compliance_findings")
        .select("*")
        .eq("check_id", check.id)
        .order("sort_order", { ascending: true });

      await createReportVersion({
        projectId,
        orgId: check.org_id,
        module: "comply",
        sourceId: check.id,
        reportData: {
          summary: summary.summary,
          overall_risk: summary.overall_risk,
          findings: findings ?? [],
        },
      });
    });

    return {
      checkId: check.id,
      totalFindings: allResults.reduce((sum, s) => sum + s.findings.length, 0),
      overallRisk: summary.overall_risk,
    };
  }
);

/** Per-step parallelism cap. callModel has no rate-limit backoff, so this also
 * bounds burst token usage. A batch is also the unit of one Inngest step, so it
 * must finish inside the function timeout — keep it small. */
const ANALYSIS_CONCURRENCY = 5;

/** Split into fixed-size batches. Each batch is one Inngest step (own timeout +
 * retry), so a slow category can't blow the whole pipeline's single budget. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Standard pipeline: analyse the NCC categories in parallel batches. They are
 * independent — each does its own RAG retrieval + analysis — so concurrency is
 * safe and removes the sequential bottleneck (14 categories one-at-a-time was
 * the ~16-minute run Karen saw). Each batch is its own step (Promise.all within),
 * mirroring the cost pipeline's phased parallelism so no single step risks the
 * function timeout.
 */
async function runStandardPipeline(
  step: Parameters<Parameters<typeof inngest.createFunction>[2]>[0]["step"],
  categories: NccCategory[],
  check: { id: string; org_id: string },
  planContent: string,
  fullContext: string
): Promise<AnalysisStepResult[]> {
  const batches = chunk(categories, ANALYSIS_CONCURRENCY);
  const results: AnalysisStepResult[] = [];

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const completedSoFar = results.map((r) => r.result.category);

    await step.run(`progress-batch-${b}`, async () => {
      const admin = createAdminClient();
      await admin
        .from("compliance_checks")
        .update({
          progress_current: batch.map((c) => c).join(", "),
          progress_completed: completedSoFar,
        } as never)
        .eq("id", check.id);
    });

    const batchResults = await step.run(`analyse-batch-${b}`, async () => {
      return await Promise.all(
        batch.map(async (category) => {
          const nccRetrieval = await enhancedRetrieve({
            orgId: check.org_id,
            category: category as string,
            projectContext: fullContext,
            sourceType: "ncc_volume",
            matchThreshold: 0.5,
            matchCount: 8,
            includeSystem: true,
            topK: 8,
            checkId: check.id,
          });

          const certDocs = await retrieveContext(
            `${category.replace(/_/g, " ")} certification engineering`,
            {
              orgId: check.org_id,
              sourceType: "certification",
              matchThreshold: 0.6,
              matchCount: 3,
            }
          );

          const nccContext = [
            ...nccRetrieval.documents.map((d) => d.content),
            ...certDocs.map((d) => `[FROM CERTIFICATION] ${d.content}`),
          ].join("\n\n---\n\n");

          const fewShotExamples = await getFewShotExamples(
            category as string,
            check.org_id
          );

          let result = await analyseCompliance(
            category as NccCategory,
            planContent,
            fullContext,
            nccContext,
            { orgId: check.org_id, checkId: check.id, fewShotExamples }
          );

          result = await calibrateConfidence(result, check.org_id);

          return {
            result,
            nccContext,
            chunkIds: nccRetrieval.chunkIds,
            validationTier: getValidationTier(category),
          };
        })
      );
    });

    results.push(...batchResults);
  }

  return results;
}

/**
 * Agentic pipeline: phased parallel execution with tool-using agents.
 * Categories in the same phase run concurrently via Promise.all.
 * Agent has access to prior phase findings for cross-category awareness.
 */
async function runAgenticPipeline(
  step: Parameters<Parameters<typeof inngest.createFunction>[2]>[0]["step"],
  categories: NccCategory[],
  check: { id: string; org_id: string },
  planContent: string,
  fullContext: string
): Promise<AnalysisStepResult[]> {
  const resultMap = new Map<string, AnalysisStepResult>();
  const priorResults = new Map<string, ComplianceSectionResult>();
  const allDependencies: CrossCategoryDependency[] = [];

  // Group categories by phase
  const phases: NccCategory[][] = [];
  for (const phase of EXECUTION_PHASES) {
    const activeInPhase = phase.filter((c) => categories.includes(c));
    if (activeInPhase.length > 0) phases.push(activeInPhase);
  }

  // Execute phases sequentially, categories within each phase in parallel
  for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
    const phaseCategories = phases[phaseIdx];

    // Report progress: show first category in phase as current
    await step.run(`progress-phase-${phaseIdx}-start`, async () => {
      const admin = createAdminClient();
      await admin.from("compliance_checks").update({
        progress_current: phaseCategories[0],
        progress_completed: [...resultMap.keys()],
      } as never).eq("id", check.id);
    });

    const phaseResults = await step.run(
      `agent-phase-${phaseIdx}`,
      async () => {
        const results = await Promise.all(
          phaseCategories.map(async (category) => {
            // Enhanced RAG retrieval
            const nccRetrieval = await enhancedRetrieve({
              orgId: check.org_id,
              category: category as string,
              projectContext: fullContext,
              sourceType: "ncc_volume",
              matchThreshold: 0.5,
              matchCount: 8,
              includeSystem: true,
              topK: 8,
              checkId: check.id,
            });

            const certDocs = await retrieveContext(
              `${category.replace(/_/g, " ")} certification engineering`,
              {
                orgId: check.org_id,
                sourceType: "certification",
                matchThreshold: 0.6,
                matchCount: 3,
              }
            );

            const nccContext = [
              ...nccRetrieval.documents.map((d) => d.content),
              ...certDocs.map((d) => `[FROM CERTIFICATION] ${d.content}`),
            ].join("\n\n---\n\n");

            // Run agentic analysis with tool access
            const agentResult = await runAgentAnalysis(
              category as NccCategory,
              planContent,
              fullContext,
              nccContext,
              {
                orgId: check.org_id,
                checkId: check.id,
                priorResults,
                dependencies: allDependencies,
              }
            );

            console.log(
              `[Agent] ${category}: ${agentResult.result.findings.length} findings ` +
                `in ${agentResult.iterations} iterations, ` +
                `${agentResult.dependencies.length} dependencies flagged`
            );

            return {
              category,
              stepResult: {
                result: agentResult.result,
                nccContext,
                chunkIds: nccRetrieval.chunkIds,
                validationTier: getValidationTier(category),
              } as AnalysisStepResult,
              dependencies: agentResult.dependencies,
            };
          })
        );

        return results;
      }
    );

    // Report progress after phase completes
    const completedSoFar = [...resultMap.keys(), ...phaseCategories];
    await step.run(`progress-phase-${phaseIdx}`, async () => {
      const admin = createAdminClient();
      await admin.from("compliance_checks").update({
        progress_current: null,
        progress_completed: completedSoFar,
      } as never).eq("id", check.id);
    });

    // Store phase results for next phase's cross-category access
    for (const pr of phaseResults) {
      resultMap.set(pr.category, pr.stepResult);
      priorResults.set(pr.category, pr.stepResult.result);
      allDependencies.push(...pr.dependencies);
    }
  }

  // Dependency resolution: re-analyze categories flagged by agents
  const categoriesToReanalyse = new Set<NccCategory>();
  for (const dep of allDependencies) {
    if (categories.includes(dep.target_category as NccCategory)) {
      categoriesToReanalyse.add(dep.target_category as NccCategory);
    }
  }

  if (categoriesToReanalyse.size > 0) {
    console.log(
      `[Agent] Re-analyzing ${categoriesToReanalyse.size} categories due to dependencies: ` +
        [...categoriesToReanalyse].join(", ")
    );

    await step.run("agent-dependency-resolution", async () => {
      const reResults = await Promise.all(
        [...categoriesToReanalyse].map(async (category) => {
          const existing = resultMap.get(category)!;

          const agentResult = await runAgentAnalysis(
            category,
            planContent,
            fullContext,
            existing.nccContext,
            {
              orgId: check.org_id,
              checkId: check.id,
              priorResults,
              dependencies: [],
            }
          );

          return {
            category,
            stepResult: {
              ...existing,
              result: agentResult.result,
            },
          };
        })
      );

      for (const rr of reResults) {
        resultMap.set(rr.category, rr.stepResult);
      }

      return reResults.length;
    });
  }

  // Return results in the original category order
  return categories.map((c) => resultMap.get(c)!);
}
