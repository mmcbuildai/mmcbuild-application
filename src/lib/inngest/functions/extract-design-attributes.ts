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
import {
  contentTypeForKind,
  decodedBase64Bytes,
  MIN_READABLE_PLAN_BYTES,
} from "@/lib/plans/file-kind";

const ATTRIBUTE_EXTRACTION_PROMPT = `You are a building-plan reader. From the supplied architectural plan, extract ONLY the high-level attributes a building-compliance questionnaire needs. Do NOT attempt full geometry — return a single compact JSON object and nothing else.

Return JSON in EXACTLY this shape (omit any field you cannot determine confidently — never guess):
{
  "storeys": <integer number of above-ground storeys>,
  "floor_area_m2": <total internal floor area in square metres, number>,
  "rooms": [{ "name": "<label as written on the plan>", "type": "<bedroom|bathroom|ensuite|laundry|wc|powder|kitchen|living|garage|stair|balcony|deck|pool|other>" }],
  "has_party_wall": <true if the dwelling shares a wall with an adjoining dwelling (attached/duplex/townhouse), else false>,
  "roof_material": "<e.g. concrete tile, terracotta tile, Colorbond metal, Zincalume, slate, asphalt shingle>",
  "wall_cladding": "<e.g. brick veneer, double brick, fibre cement, timber weatherboard, metal cladding, render, AAC/Hebel>",
  "ceiling_height_habitable_m": <floor-to-ceiling height of habitable rooms in metres, number>
}

Rules:
- The final message must contain ONLY the JSON object — no preamble, no markdown fences. Start with { and end with }.
- Keep "rooms" to the labelled rooms you can see; do not invent rooms.
- Leave a field out entirely if the plan does not clearly support it.`;

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

    // 3. Download the plan file (mirror processPlan's download).
    const fileBase64 = await step.run("download-plan-file", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from("plan-uploads")
        .download(plan.file_path);
      if (error || !data) {
        throw new Error(`Failed to download file: ${error?.message}`);
      }
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer).toString("base64");
    });

    // 4. One focused vision call → compact DesignAttributes JSON.
    const attributes = await step.run("extract-attributes", async () => {
      // Never send a blank/near-empty document to the model (CLAUDE.md rule):
      // it produces a misleading refusal. Fail fast → best-effort onFailure →
      // design_attributes stays null and the questionnaire falls back cleanly.
      if (decodedBase64Bytes(fileBase64) < MIN_READABLE_PLAN_BYTES) {
        throw new Error("No readable plan provided for attribute extraction");
      }
      const buffer = Buffer.from(fileBase64, "base64");

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
              // Small output — a compact attribute object, never prose — so the
              // JSON never truncates (the recent 4096-cap truncation lesson).
              maxTokens: 2048,
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
              maxTokens: 2048,
            });

      const text = result.text?.trim();
      if (!text) {
        throw new Error("Vision call returned no text for design attributes");
      }
      // extractJson throws a typed ModelNonJsonResponseError on a refusal/empty
      // response — that propagates to onFailure (best-effort), never to the user.
      return extractJson<DesignAttributes>(text);
    });

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
