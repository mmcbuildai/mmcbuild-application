import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyseCompliance, generateSummary } from "@/lib/ai/claude";
import { retrieveContext, retrievePlanChunks } from "@/lib/comply/retriever";
import { COMPLIANCE_USER_CONTEXT_TEMPLATE } from "@/lib/ai/prompts/compliance-system";
import { NCC_CATEGORIES, type ComplianceSectionResult, type NccCategory } from "@/lib/ai/types";

export const runComplianceCheck = inngest.createFunction(
  {
    id: "run-compliance-check",
    name: "Run Compliance Check",
    retries: 1,
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
      const q = questionnaireData as Record<string, string | number>;
      return COMPLIANCE_USER_CONTEXT_TEMPLATE({
        buildingClass: String(q.building_class ?? "Class 1a"),
        constructionType: String(q.construction_type ?? "Type C"),
        storeys: Number(q.storeys ?? 1),
        floorArea: Number(q.floor_area ?? 0),
        climateZone: Number(q.climate_zone ?? 6),
        balRating: String(q.bal_rating ?? "N/A"),
        siteConditions: String(q.site_conditions ?? "Not specified"),
        services: String(q.services ?? "Not specified"),
        specialRequirements: String(q.special_requirements ?? "None"),
      });
    });

    // 5. Determine which categories to analyse
    const categoriesToAnalyse = await step.run("select-categories", async () => {
      const q = questionnaireData as Record<string, string>;
      const categories = NCC_CATEGORIES.map((c) => c.key);

      // Skip bushfire if BAL is N/A
      if (!q.bal_rating || q.bal_rating === "N/A" || q.bal_rating === "BAL-LOW") {
        return categories.filter((c) => c !== "bushfire");
      }

      return categories;
    });

    // 6. Run analysis per category (sequential to manage rate limits)
    const allResults: ComplianceSectionResult[] = [];

    for (const category of categoriesToAnalyse) {
      const result = await step.run(
        `analyse-${category}`,
        async () => {
          // Retrieve relevant NCC context via RAG (includes system KB documents)
          const nccDocs = await retrieveContext(
            `NCC ${category.replace(/_/g, " ")} requirements Australian residential`,
            {
              orgId: check.org_id,
              sourceType: "ncc_volume",
              matchThreshold: 0.5,
              matchCount: 5,
              includeSystem: true,
            }
          );

          const nccContext = nccDocs
            .map((d) => d.content)
            .join("\n\n---\n\n");

          return await analyseCompliance(
            category as NccCategory,
            planContent,
            projectContext,
            nccContext
          );
        }
      );

      allResults.push(result);
    }

    // 7. Store findings
    await step.run("store-findings", async () => {
      const admin = createAdminClient();
      let sortOrder = 0;

      for (const section of allResults) {
        for (const finding of section.findings) {
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
          } as never);
        }
      }
    });

    // 8. Generate summary
    const summary = await step.run("generate-summary", async () => {
      return await generateSummary(allResults, projectContext);
    });

    // 9. Update check as completed
    await step.run("update-status-completed", async () => {
      const admin = createAdminClient();
      await admin
        .from("compliance_checks")
        .update({
          status: "completed",
          summary: summary.summary,
          overall_risk: summary.overall_risk,
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", check.id);
    });

    return {
      checkId: check.id,
      totalFindings: allResults.reduce((sum, s) => sum + s.findings.length, 0),
      overallRisk: summary.overall_risk,
    };
  }
);
