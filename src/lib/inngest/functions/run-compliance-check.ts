import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
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
    onFailure: async ({ error, event }) => {
      const admin = createAdminClient();
      const { projectId, planId } = event.data.event.data;
      if (!projectId || !planId) return;
      const { data: check } = await admin
        .from("compliance_checks")
        .select("id")
        .eq("project_id", projectId)
        .eq("plan_id", planId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (check) {
        await admin
          .from("compliance_checks")
          .update({
            status: "error",
            summary: `Compliance check failed: ${error.message.slice(0, 500)}`,
            progress_current: null,
          } as never)
          .eq("id", (check as { id: string }).id);
      }
      console.error(`[runComplianceCheck] Failed: ${error.message}`);
    },
  },
  { event: "compliance/check.requested" },
  async ({ event, step }) => {
    const { projectId, planId, questionnaireData } = event.data;

    // 1. Load compliance check record
    const check = await step.run("load-check", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("compliance_checks")
        .select("id, org_id, plan_id, questionnaire_id")
        .eq("project_id", projectId)
        .eq("plan_id", planId)
        .eq("status", "queued")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        throw new Error(`Compliance check not found: ${error?.message}`);
      }

      return data as { id: string; org_id: string; plan_id: string; questionnaire_id: string | null };
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

      return categories.filter((c) => !skip.includes(c));
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

    for (let i = 0; i < categoriesToAnalyse.length; i++) {
      const category = categoriesToAnalyse[i];
      const analysis = analysisResults[i];

      if (
        ENABLE_CROSS_VALIDATION &&
        shouldCrossValidate(category, CROSS_VALIDATION_TIER, analysis.result)
      ) {
        const validation = await step.run(
          `validate-${category}`,
          async () => {
            return await crossValidate(
              category as NccCategory,
              analysis.result,
              planContent,
              fullContext,
              analysis.nccContext,
              { orgId: check.org_id, checkId: check.id }
            );
          }
        );

        validatedResults.push({
          result: validation.reconciled,
          chunkIds: analysis.chunkIds,
          validationTier: analysis.validationTier,
          agreementScore: validation.agreement_score,
          secondaryModel: validation.secondary_model,
          wasReconciled: validation.was_reconciled,
        });
      } else {
        validatedResults.push({
          result: analysis.result,
          chunkIds: analysis.chunkIds,
          validationTier: analysis.validationTier,
          agreementScore: null,
          secondaryModel: null,
          wasReconciled: false,
        });
      }
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

/**
 * Standard pipeline: sequential analysis with enhanced RAG.
 */
async function runStandardPipeline(
  step: Parameters<Parameters<typeof inngest.createFunction>[2]>[0]["step"],
  categories: NccCategory[],
  check: { id: string; org_id: string },
  planContent: string,
  fullContext: string
): Promise<AnalysisStepResult[]> {
  const results: AnalysisStepResult[] = [];

  for (const category of categories) {
    const completedSoFar = results.map((r) => r.result.category);

    // Report progress before starting this domain
    await step.run(`progress-${category}`, async () => {
      const admin = createAdminClient();
      await admin.from("compliance_checks").update({
        progress_current: category,
        progress_completed: completedSoFar,
      } as never).eq("id", check.id);
    });

    const stepResult = await step.run(`analyse-${category}`, async () => {
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

      // Enrich prompt with few-shot examples from positive feedback
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

      // Calibrate confidence based on historical accuracy
      result = await calibrateConfidence(result, check.org_id);

      return {
        result,
        nccContext,
        chunkIds: nccRetrieval.chunkIds,
        validationTier: getValidationTier(category),
      };
    });

    results.push(stepResult);
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
