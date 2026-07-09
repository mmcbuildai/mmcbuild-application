import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyRunComplete } from "@/lib/email/notify-run-complete";
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
import { backfillWallsFromRooms } from "@/lib/build/spatial/full-house-extractor";
import { filterSuggestionsBySystems } from "@/lib/build/system-category-map";
import { buildDesignConstraints } from "@/lib/build/property-constraints";
import type { PropertyProfile } from "@caistech/property-services-sdk";
import { createReportVersion } from "@/lib/report-versions";

/**
 * Mark the in-flight design check as errored with the real failure reason.
 *
 * Extracted from the inline `onFailure` handler so the status write-back — the
 * exact logic whose absence left a run stuck at "processing" (2026-06-16) — is
 * unit-testable. Only touches a check still in `queued`/`processing`, so a later
 * completed run for the same project/plan is never clobbered. (Diagnostic
 * Integrity: surface the cause, don't hang.)
 */
export async function recordDesignOptimisationFailure(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string | undefined,
  planId: string | undefined,
  message: string
): Promise<void> {
  if (!projectId || !planId) return;
  const { data: check } = await admin
    .from("design_checks")
    .select("id")
    .eq("project_id", projectId)
    .eq("plan_id", planId)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!check) return;
  await admin
    .from("design_checks")
    .update({
      status: "error",
      summary: `Design optimisation failed: ${message.slice(0, 500)}`,
    } as never)
    .eq("id", (check as { id: string }).id);
}

export const runDesignOptimisation = inngest.createFunction(
  {
    id: "run-design-optimisation",
    name: "Run Design Optimisation",
    retries: 1,
    // Without this, a thrown step error (e.g. the model returning non-JSON, so
    // extractJson throws ModelNonJsonResponseError) left the check stuck at
    // "processing" forever — the UI spins and never shows why. Record the REAL
    // reason on the check so the user sees the cause (Diagnostic Integrity) and
    // the UI shows the error state. Mirrors run-compliance-check / process-plan.
    // (2026-06-16: this function was missed in the 2026-06-11 onFailure sweep,
    // which left a real run stuck at "processing".)
    onFailure: async ({ error, event }) => {
      const { projectId, planId } = event.data.event.data;
      await recordDesignOptimisationFailure(
        createAdminClient(),
        projectId,
        planId,
        error.message
      );
      console.error(`[runDesignOptimisation] Failed: ${error.message}`);
    },
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
          stage: "analyse",
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
        // The cached layout may predate the wall-backfill (or come from an
        // extractor run that under-populated `walls`), leaving the .dae a thin
        // shell. Backfill internal partitions from the room boundaries here too,
        // so existing projects get the full 3D model without re-uploading.
        layout.walls = backfillWallsFromRooms(
          layout.walls ?? [],
          layout.rooms ?? [],
        );
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

    // 3d. Load the authoritative property profile so the optimiser designs
    // WITHIN the site's ground-truth planning/site limits (height/setback
    // envelope, bushfire/flood/heritage overlays, terrain) instead of proposing
    // an alternative that would breach them. Degrades to null (no constraints)
    // when the site has no profile — the optimiser then runs exactly as before.
    const propertyProfile = await step.run("load-property-profile", async () => {
      const { data } = await db()
        .from("projects")
        .select("property_profile")
        .eq("id", projectId)
        .single();
      return ((data as { property_profile?: PropertyProfile | null } | null)
        ?.property_profile ?? null) as PropertyProfile | null;
    });

    await step.run("stage-suggest", async () => {
      await db()
        .from("design_checks")
        .update({ stage: "suggest" } as never)
        .eq("id", check.id);
    });

    // 4. Analyse design with AI
    const suggestions = await step.run("analyse-design", async () => {
      const systemsContext = selectedSystems
        ? `\n\nSELECTED CONSTRUCTION SYSTEMS:\nThe project owner has selected ONLY the following MMC systems: ${selectedSystems.join(", ")}.\nOnly produce suggestions for these selected systems. Do NOT suggest alternatives for construction systems the owner did not select — they were deliberately excluded and will not be shown.`
        : "";

      // Authoritative site limits — keep every suggested alternative within the
      // zone envelope + overlay requirements (empty string when no profile).
      const siteConstraints = buildDesignConstraints(propertyProfile);

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
        system: OPTIMISATION_SYSTEM_PROMPT + systemsContext + siteConstraints,
        messages: [{ role: "user", content: OPTIMISATION_USER_PROMPT(effectiveContent, spatialLayoutJson) }],
        // 4096 truncated a multi-suggestion response mid-array → the JSON came
        // back unparseable ("```json { \"suggestions\": [ … " then cut off),
        // failing the run at ~95% (Karen, 2026-06-25). 8192 matches the Comply
        // truncation fix; the suggestions array is the large output here.
        maxTokens: 8192,
        orgId: check.org_id,
        checkId: check.id,
      });

      const parsed = extractJson<DesignOptimisationResult>(result.text);
      // Narrow to the owner's selected systems so the report/export/summary only
      // show what they picked (Karen, 2026-07-03). The hard prompt above should
      // already keep the model on-selection; this is the guarantee. Filtering
      // here (not just at store time) keeps the executive summary and the
      // suggestion count consistent with what gets stored. Empty-result guard
      // inside the helper means a report is never left empty.
      return filterSuggestionsBySystems(parsed.suggestions, selectedSystems);
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

    await step.run("stage-compile", async () => {
      await db()
        .from("design_checks")
        .update({ stage: "compile" } as never)
        .eq("id", check.id);
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

    // Email the owner it's ready (so they can have left the page). Best-effort.
    await step.run("notify-owner", async () => {
      await notifyRunComplete("optimisation", check.id, true);
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
