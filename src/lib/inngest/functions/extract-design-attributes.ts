/**
 * Lightweight design-attribute extraction on plan upload.
 *
 * Most users run MMC Comply against their design BEFORE they ever run the
 * Build/3D module, so the questionnaire prefill (which reads the full 3D
 * `design_checks.spatial_layout`) has nothing to offer them. This function
 * runs ONE focused vision call on upload to pull just the handful of
 * questionnaire-relevant attributes (storeys, floor area, rooms, party wall,
 * roof material, wall cladding, habitable ceiling height) and stores them on
 * `plans.design_attributes`. The questionnaire prefill reads that as a fallback
 * (`buildDesignPrefillFromAttributes`).
 *
 * This is deliberately NOT the full geometry extraction — it's a compact
 * attribute object, capped at a small maxTokens so the JSON never truncates.
 *
 * Triggered by the SAME `plan/uploaded` event as `processPlan`; both run
 * independently. It is strictly best-effort: a failure here must NEVER block
 * the upload/ready path or surface an error to the user — `design_attributes`
 * stays null and the questionnaire simply falls back to "fill it in yourself".
 */

import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { callVisionModel } from "@/lib/build/spatial/vision-call";
import { extractJson } from "@/lib/ai/extract-json";
import type { DesignAttributes } from "@/lib/comply/questionnaire-prefill";
import type { PlanFileKind } from "@/lib/plans/file-kind";
import { contentTypeForKind, MIN_READABLE_PLAN_BYTES } from "@/lib/plans/file-kind";

const ATTRIBUTE_EXTRACTION_PROMPT = `You are an expert building-compliance plan reader. Read the ENTIRE supplied plan set thoroughly and extract every attribute below that the plan supports. Look across ALL of it: the title block and drawing notes, the BASIX / NatHERS / energy report, the structural & footing notes, the bushfire (BAL) assessment, the site plan (setbacks, boundaries), elevations, sections, the finishes/window/door schedules, and any general specification notes. Do NOT attempt full geometry or per-room lists — return ONE compact JSON object of scalar values and flags, and nothing else.

Take your time and be complete: if a value is printed or clearly shown ANYWHERE on the drawings (e.g. "Class 1a" in the title block, a soil classification on the footing plan, R-values in the BASIX commitments), extract it. But NEVER guess — if the plan does not clearly support a field, OMIT that field entirely.

For the categorical fields, return EXACTLY one of the listed option values (verbatim). For numbers, return the number only (no units).

Return JSON in EXACTLY this shape (every field optional — include only what the plan clearly supports):
{
  "storeys": <integer above-ground storeys>,
  "floor_area_m2": <total internal floor area, m2>,
  "wet_area_count": <integer count of bathrooms+ensuites+laundries+WCs+powder rooms across the whole plan>,
  "has_stairs": <true/false: internal stairs present>,
  "has_balcony_deck": <true/false: a balcony or deck present>,
  "has_swimming_pool": <true/false: a swimming pool present>,
  "has_party_wall": <true/false: shares a wall with an adjoining dwelling (attached/duplex/townhouse)>,
  "roof_material": "<concrete tile | terracotta tile | Colorbond metal | Zincalume | slate | asphalt shingle>",
  "wall_cladding": "<brick veneer | double brick | fibre cement | timber weatherboard | metal cladding | render | AAC/Hebel>",
  "ceiling_height_habitable_m": <floor-to-ceiling height of habitable rooms, m>,

  "building_typology": "<Single residential | Duplex | Townhouse | Apartment | Co-living / Boarding house | Hotel | Mixed use | Commercial>",
  "building_class": "<Class 1a | Class 1b | Class 2 | Class 3 | Class 10a | Class 10b>  (the NCC class of building, usually in the title block)",
  "construction_type": "<Type A | Type B | Type C>  (NCC construction type, if stated)",

  "soil_classification": "<A | S | M | M-D | H1 | H2 | E | P>  (AS 2870 site class, from the geotech / footing notes)",
  "footing_type": "<Strip footing | Pad footing | Raft slab | Waffle slab | Stiffened raft | Stumps/Piers | Screw piles>",
  "wind_classification": "<N1 | N2 | N3 | N4 | N5 | N6 | C1 | C2 | C3 | C4>  (AS 4055 site wind class, from structural notes)",
  "terrain_category": "<TC1 | TC2 | TC2.5 | TC3>",

  "dpc_type": "<Polyethylene membrane | Bituminous membrane | Chemical DPC | Not specified>",
  "has_sarking": <true/false: roof sarking specified>,
  "has_subfloor_ventilation": <true/false: subfloor ventilation specified>,
  "distance_to_boundary_m": <smallest setback of the building to a side/rear boundary, m, from the site plan>,

  "party_wall_frl": "<the fire-resistance level of the party/separating wall, e.g. 60/60/60>",
  "garage_location": "<Attached | Detached | Integrated/under main roof | Basement car park | N/A>",
  "smoke_alarm_type": "<Photoelectric (hardwired interconnected) | Photoelectric (battery) | Ionisation | Combined photo/ion>",

  "ceiling_height_non_habitable_m": <floor-to-ceiling height of non-habitable rooms (garage, store), m>,
  "has_exhaust_fans": <true/false: mechanical exhaust to wet areas specified>,
  "natural_ventilation_method": "<Openable windows | Openable windows + ceiling fans | Mechanical ventilation | Mixed mode>",

  "energy_pathway": "<DTS (Deemed-to-Satisfy) | NatHERS | JV3 (Verification)>",
  "insulation_ceiling_r": <ceiling/roof insulation R-value>,
  "insulation_wall_r": <external wall insulation R-value>,
  "insulation_floor_r": <floor insulation R-value>,
  "glazing_type": "<Single clear | Single tinted | Double glazed (clear) | Double glazed (low-e) | Triple glazed>",
  "hot_water_system": "<Electric storage | Electric heat pump | Gas storage | Gas instantaneous | Solar electric boost | Solar gas boost>",
  "has_solar_pv": <true/false: rooftop solar PV shown/specified>,
  "nathers_rating": <NatHERS star rating, 0-10>,

  "has_heating_appliance": <true/false: a fixed heating appliance (fireplace/heater) present>,
  "heating_type": "<Ducted gas | Ducted reverse cycle | Split system | Hydronic | Wood heater (open flue) | Wood heater (closed flue) | Electric panel>",

  "max_fall_height_m": <greatest fall height from a balcony/deck/window/level change requiring a barrier, m>,
  "has_step_free_entry": <true/false: a step-free (level) entry to the dwelling>,
  "accessible_bathroom": <true/false: an accessible/adaptable bathroom provided>,
  "min_door_width_mm": <narrowest internal door clear width, mm>,
  "min_corridor_width_mm": <narrowest corridor/hallway width, mm>
}

Rules:
- The final message must contain ONLY the JSON object — no preamble, no markdown fences. Start with { and end with }.
- Scalars and true/false flags ONLY — do NOT list individual rooms or repeat schedules (a long list overflows the response).
- For categorical fields use ONLY the exact option strings listed above. If the plan's value doesn't match one, OMIT the field.
- Leave a field out entirely if the plan does not clearly support it. Never guess.`;

/** File kinds that have a direct vision path (PDF read natively, image rasterised). */
function hasVisionPath(kind: PlanFileKind): boolean {
  return kind === "pdf" || kind === "image";
}

export const extractDesignAttributes = inngest.createFunction(
  {
    id: "extract-design-attributes",
    name: "Extract Plan Design Attributes",
    retries: 1,
    onFailure: async ({ error, event }) => {
      // Best-effort only: this extraction must never block the upload/ready
      // path or surface an error to the user. Swallow everything — the
      // questionnaire simply falls back to "fill it in yourself" when
      // design_attributes stays null.
      try {
        const planId = event?.data?.event?.data?.planId;
        console.error(
          `[extractDesignAttributes] best-effort extraction failed${
            planId ? ` for plan ${planId}` : ""
          }: ${error?.message}`,
        );
      } catch {
        // Never throw from onFailure.
      }
    },
  },
  // Triggered on a fresh upload AND by the backfill event for existing plans.
  [{ event: "plan/uploaded" }, { event: "plan/attributes.requested" }],
  async ({ event, step }) => {
    // event.data is a union of the two triggers — the backfill carries only
    // planId, the upload carries projectId/fileName/uploadedBy. Read defensively.
    const data = event.data as {
      projectId?: string;
      fileName?: string;
      uploadedBy?: string;
      planId?: string;
    };
    const { projectId, fileName, uploadedBy, planId: eventPlanId } = data;

    // 1. Find the plan record (mirror processPlan's find-plan-record step).
    const plan = await step.run("find-plan-record", async () => {
      const admin = createAdminClient();

      type PlanRow = {
        id: string;
        org_id: string;
        file_path: string;
        file_name: string;
        file_kind?: PlanFileKind | null;
      };

      if (eventPlanId) {
        const { data, error } = await admin
          .from("plans")
          .select("*")
          .eq("id", eventPlanId)
          .single();
        if (error || !data) {
          throw new Error(
            `Plan record not found for ID ${eventPlanId}: ${error?.message}`,
          );
        }
        return data as unknown as PlanRow;
      }

      // No planId → the upload path, which always carries these. (The backfill
      // path always supplies planId and returns above.)
      if (!projectId || !fileName || !uploadedBy) {
        throw new Error(
          "plan/uploaded event missing projectId/fileName/uploadedBy",
        );
      }

      const { data, error } = await admin
        .from("plans")
        .select("*")
        .eq("project_id", projectId)
        .eq("file_name", fileName)
        .eq("created_by", uploadedBy)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        throw new Error(
          `Plan record not found for ${fileName}: ${error?.message}`,
        );
      }
      return data as unknown as PlanRow;
    });

    const kind: PlanFileKind = plan.file_kind ?? "pdf";

    // 2. Skip kinds with no direct vision path (DWG/RVT/SKP/DOC). These need a
    //    CloudConvert pass and land in manual_review; design_attributes stays
    //    null and the questionnaire falls back to "fill it in yourself".
    if (!hasVisionPath(kind)) {
      return { planId: plan.id, skipped: true, reason: `no vision path for kind=${kind}` };
    }

    // 3. Download + extract in ONE step. The PDF bytes must NEVER be RETURNED
    //    from a step.run: Inngest memoizes every step's output, and a ~1MB+ PDF
    //    (base64 ~1.4MB) exceeds the step-output size limit → "output_too_large"
    //    — which failed every real plan before the vision call even ran
    //    (2026-06-22). Keep the bytes inside the step; return only the small
    //    attribute object. processPlan downloads + ingests in one step for the
    //    same reason. Returns null when the file is genuinely missing (orphaned
    //    record) → the caller skips cleanly (no throw, no retry-storm).
    const attributes = await step.run("download-and-extract", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from("plan-uploads")
        .download(plan.file_path);
      if (error || !data) {
        console.error(
          `[extractDesignAttributes] file missing for plan ${plan.id} (${plan.file_path}): ${error?.message} — skipping`,
        );
        return null;
      }
      const buffer = Buffer.from(await data.arrayBuffer());

      // Never send a blank/near-empty document to the model (CLAUDE.md rule).
      if (buffer.byteLength < MIN_READABLE_PLAN_BYTES) {
        throw new Error("No readable plan provided for attribute extraction");
      }

      const result =
        kind === "pdf"
          ? await callVisionModel("plan_vision", {
              system: ATTRIBUTE_EXTRACTION_PROMPT,
              messages: [
                {
                  role: "user",
                  content:
                    "Read this plan and return ONLY the compact attribute JSON object described in the instructions.",
                },
              ],
              pdf: { data: buffer },
              maxTokens: 8192,
            })
          : await callVisionModel("plan_vision", {
              system: ATTRIBUTE_EXTRACTION_PROMPT,
              messages: [
                {
                  role: "user",
                  content:
                    "Read this plan and return ONLY the compact attribute JSON object described in the instructions.",
                },
              ],
              images: [
                {
                  data: buffer,
                  mimeType: contentTypeForKind(kind, plan.file_name),
                },
              ],
              maxTokens: 8192,
            });

      const text = result.text?.trim();
      if (!text) {
        throw new Error("Vision call returned no text for design attributes");
      }
      // extractJson throws a typed ModelNonJsonResponseError on a refusal/empty
      // response — that propagates to onFailure (best-effort), never to the user.
      return extractJson<DesignAttributes>(text);
    });

    if (attributes === null) {
      return { planId: plan.id, skipped: true, reason: "file not found in storage" };
    }

    // 5. Persist the compact attribute object on the plan row.
    await step.run("store-design-attributes", async () => {
      const admin = createAdminClient();
      const { error } = await admin
        .from("plans")
        .update({ design_attributes: attributes } as never)
        .eq("id", plan.id);
      if (error) {
        throw new Error(`Failed to store design_attributes: ${error.message}`);
      }
    });

    return { planId: plan.id, extracted: true };
  },
);
