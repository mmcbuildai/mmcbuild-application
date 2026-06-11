import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/lib/supabase/db";
import { retrievePlanChunks } from "@/lib/comply/retriever";
import { callModel } from "@/lib/ai/models/router";
import { extractJson } from "@/lib/ai/extract-json";
import {
  OPTIMISATION_SYSTEM_PROMPT,
  OPTIMISATION_USER_PROMPT,
  OPTIMISATION_SUMMARY_PROMPT,
} from "@/lib/ai/prompts/optimisation-system";
import type { DesignOptimisationResult } from "@/lib/ai/types";
import type { SpatialLayout } from "@/lib/build/spatial/types";
import { createReportVersion } from "@/lib/report-versions";

export const runDesignOptimisation = inngest.createFunction(
  {
    id: "run-design-optimisation",
    name: "Run Design Optimisation",
    retries: 1,
  },
  { event: "design/optimisation.requested" },
  async ({ event, step }) => {
    const { projectId, planId } = event.data;

    // 1. Load design check record
    const check = await step.run("load-check", async () => {
      const { data, error } = await db()
        .from("design_checks")
        .select("id, org_id, plan_id")
        .eq("project_id", projectId)
        .eq("plan_id", planId)
        .eq("status", "queued")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        throw new Error(`Design check not found: ${error?.message}`);
      }

      return data as { id: string; org_id: string; plan_id: string };
    });

    // 2. Update status to processing
    await step.run("update-status-processing", async () => {
      await db()
        .from("design_checks")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
        } as never)
        .eq("id", check.id);
    });

    // 3. Load plan content (reuses Comply's retriever)
    const planContent = await step.run("load-plan-content", async () => {
      return await retrievePlanChunks(check.org_id, check.plan_id);
    });

    // NOTE: a null planContent is NOT a hard failure on its own. DWG / CAD
    // plans render in 3D but usually have no extractable text layer, so the RAG
    // retriever returns nothing. The real dead-end check is the both-missing
    // guard after the layout load below. (TH01, 2026-06-11: a DWG that rendered
    // fine in Build failed optimisation with a bogus "No plan content".)

    // 3b. Spatial layout for the 3D viewer + COLLADA export.
    //
    // PRIMARY path: reuse the layout already extracted on the project page. The
    // hard gate means the user must run "See your design built in the 4 MMC
    // systems" (the test-3d extractor) before Design Optimisation unlocks, so a
    // completed test_3d_jobs row for this plan almost always exists. Reusing it
    // avoids a second, costly extraction and keeps the report's 3D identical to
    // the preview's. (Karen 2026-06-07: extraction happens on the project page.)
    const cachedLayout = (await step.run("reuse-project-page-layout", async () => {
      const { data: plan } = await db()
        .from("plans")
        .select("file_path")
        .eq("id", check.plan_id)
        .single();
      const filePath = (plan as { file_path?: string | null } | null)?.file_path;
      if (!filePath) return null;

      const { data: doneRow } = await db()
        .from("test_3d_jobs")
        .select("result")
        .eq("org_id", check.org_id)
        .eq("storage_path", filePath)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const layout =
        (doneRow as { result?: { layout?: SpatialLayout | null } | null } | null)
          ?.result?.layout ?? null;
      if (layout) {
        await db()
          .from("design_checks")
          .update({ spatial_layout: layout })
          .eq("id", check.id);
      }
      return layout;
    })) as SpatialLayout | null;

    // No second extraction. Design Optimisation analyses the original design
    // (plan text/specs via RAG) + this one extracted version + the selected MMC
    // system — it never re-extracts, so there is only ever ONE extracted design
    // (the project-page one), not two that could disagree. If no extraction
    // exists (shouldn't happen — the gate requires the preview first), the
    // optimisation still runs text-only with spatial_layout left null.
    const spatialLayout = cachedLayout;

    // 3b-guard. Only dead-end when there is NOTHING to analyse — no text AND no
    // geometry. A DWG that rendered in 3D has a layout but usually no text
    // chunks (vector CAD has no text layer); analyse from the layout + selected
    // systems in that case rather than erroring. (Karen/TH01, 2026-06-11.)
    if (!planContent && !spatialLayout) {
      await step.run("update-status-error-no-input", async () => {
        const admin = createAdminClient();
        await admin
          .from("design_checks")
          .update({
            status: "error",
            summary:
              'We couldn\'t read anything analysable from this plan — no extractable text and no 3D geometry. Re-run "See your design built in the 4 MMC systems" to generate the 3D model first, then try the optimisation again.',
          } as never)
          .eq("id", check.id);
      });
      return { checkId: check.id, error: "No analysable input (no text, no layout)" };
    }

    // 3c. Load selected construction systems
    const selectedSystems = await step.run("load-selected-systems", async () => {
      const { data } = await db()
        .from("projects")
        .select("selected_systems")
        .eq("id", projectId)
        .single();
      const systems = (data as { selected_systems: string[] | null } | null)?.selected_systems;
      return Array.isArray(systems) && systems.length > 0 ? systems : null;
    });

    // 4. Analyse design with AI
    const suggestions = await step.run("analyse-design", async () => {
      const systemsContext = selectedSystems
        ? `\n\nSELECTED CONSTRUCTION SYSTEMS:\nThe project owner has selected the following MMC systems of interest: ${selectedSystems.join(", ")}.\nPrioritise suggestions for these systems, but still include other opportunities if relevant.`
        : "";

      // Pass a compact spatial layout into the prompt so the AI can map
      // suggestions to specific walls / rooms by ID. Strip out anything we
      // don't need for that mapping to keep token usage in check.
      const spatialLayoutJson = spatialLayout
        ? JSON.stringify({
            walls: spatialLayout.walls.map((w) => ({ id: w.id, type: w.type, material: w.material })),
            rooms: spatialLayout.rooms.map((r) => ({ id: r.id, name: r.name, type: r.type, area_m2: r.area_m2 })),
            storeys: spatialLayout.storeys,
          })
        : null;

      // planContent is null for a DWG/CAD plan with no text layer — fall back
      // to a layout-driven instruction so the analysis still runs on the
      // geometry + selected systems rather than dead-ending.
      const effectiveContent =
        planContent ??
        "No text specification could be extracted from this plan (e.g. a CAD/DWG drawing with no text layer). Analyse the design using the spatial layout below and the selected MMC construction systems.";

      const result = await callModel("design_primary", {
        system: OPTIMISATION_SYSTEM_PROMPT + systemsContext,
        messages: [{ role: "user", content: OPTIMISATION_USER_PROMPT(effectiveContent, spatialLayoutJson) }],
        maxTokens: 4096,
        orgId: check.org_id,
        checkId: check.id,
      });

      const parsed = extractJson<DesignOptimisationResult>(result.text);
      return parsed.suggestions;
    });

    // 5. Store suggestions (with spatial mapping when present)
    await step.run("store-suggestions", async () => {
      const validWallIds = new Set(spatialLayout?.walls.map((w) => w.id) ?? []);
      const validRoomIds = new Set(spatialLayout?.rooms.map((r) => r.id) ?? []);

      for (let i = 0; i < suggestions.length; i++) {
        const s = suggestions[i];

        // Filter the AI's wall/room IDs to ones that actually exist in the
        // spatial layout. The AI occasionally fabricates IDs — discard those
        // rather than write invalid references to the DB.
        const wallIds = (s.affected_wall_ids ?? []).filter((id) => validWallIds.has(id));
        const roomIds = (s.affected_room_ids ?? []).filter((id) => validRoomIds.has(id));

        await db().from("design_suggestions").insert({
          check_id: check.id,
          technology_category: s.technology_category,
          current_approach: s.current_approach,
          suggested_alternative: s.suggested_alternative,
          benefits: s.benefits,
          estimated_time_savings: s.estimated_time_savings,
          estimated_cost_savings: s.estimated_cost_savings,
          estimated_waste_reduction: s.estimated_waste_reduction,
          implementation_complexity: s.implementation_complexity,
          confidence: s.confidence,
          sort_order: i,
          affected_wall_ids: wallIds.length ? wallIds : null,
          affected_room_ids: roomIds.length ? roomIds : null,
        } as never);
      }
    });

    // 6. Generate executive summary
    const summary = await step.run("generate-summary", async () => {
      const suggestionsText = suggestions
        .map(
          (s, i) =>
            `${i + 1}. [${s.technology_category}] Replace "${s.current_approach}" with "${s.suggested_alternative}" — ` +
            `Time: -${s.estimated_time_savings}%, Cost: -${s.estimated_cost_savings}%, Waste: -${s.estimated_waste_reduction}% ` +
            `(Complexity: ${s.implementation_complexity}, Confidence: ${Math.round(s.confidence * 100)}%)`
        )
        .join("\n");

      const result = await callModel("summary", {
        system: "You are a concise technical writer for Australian construction reports.",
        messages: [{ role: "user", content: OPTIMISATION_SUMMARY_PROMPT(suggestionsText) }],
        maxTokens: 2048,
        orgId: check.org_id,
        checkId: check.id,
      });

      return result.text;
    });

    // 7. Update status to completed
    await step.run("update-status-completed", async () => {
      await db()
        .from("design_checks")
        .update({
          status: "completed",
          summary,
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", check.id);
    });

    // 8. Save report version
    await step.run("save-report-version", async () => {
      const { data: allSuggestions } = await db()
        .from("design_suggestions")
        .select("*")
        .eq("check_id", check.id)
        .order("sort_order", { ascending: true });

      await createReportVersion({
        projectId,
        orgId: check.org_id,
        module: "build",
        sourceId: check.id,
        reportData: {
          summary,
          suggestions: allSuggestions ?? [],
        },
      });
    });

    return {
      checkId: check.id,
      totalSuggestions: suggestions.length,
    };
  }
);
