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
import { renderPdfPage } from "@/lib/build/spatial/pdf-to-image";
import { extractSpatialLayout } from "@/lib/build/spatial/extractor";
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

    if (!planContent) {
      await step.run("update-status-error-no-content", async () => {
        const admin = createAdminClient();
        await admin
          .from("design_checks")
          .update({
            status: "error",
            summary: "No plan content found. Ensure the plan has been processed.",
          } as never)
          .eq("id", check.id);
      });
      return { checkId: check.id, error: "No plan content" };
    }

    // 3b. Extract spatial layout from plan PDF (for 3D viewer)
    const spatialLayout = await step.run("extract-spatial-layout", async () => {
      try {
        // Get the plan file URL from storage
        const { data: plan } = await db()
          .from("plans")
          .select("file_path")
          .eq("id", check.plan_id)
          .single();

        if (!plan?.file_path) return null;

        // Download the PDF from Supabase Storage
        const admin = createAdminClient();
        const { data: fileData } = await admin.storage
          .from("plans")
          .download(plan.file_path);

        if (!fileData) return null;

        // Render first page to image
        const pdfBuffer = Buffer.from(await fileData.arrayBuffer());
        const imageBase64 = await renderPdfPage(pdfBuffer, 1, 2.0);
        if (!imageBase64) return null;

        // Extract spatial data using Claude Vision
        const layout = await extractSpatialLayout(imageBase64, "image/png");

        // Store spatial layout on the design check
        if (layout) {
          await db()
            .from("design_checks")
            .update({ spatial_layout: layout })
            .eq("id", check.id);
        }

        return layout;
      } catch (err) {
        console.error("Spatial extraction failed (non-fatal):", err);
        return null;
      }
    }) as SpatialLayout | null;

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

      const result = await callModel("design_primary", {
        system: OPTIMISATION_SYSTEM_PROMPT + systemsContext,
        messages: [{ role: "user", content: OPTIMISATION_USER_PROMPT(planContent, spatialLayoutJson) }],
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
