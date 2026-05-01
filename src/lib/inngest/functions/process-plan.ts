import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestPlan, ingestPlanFromText } from "@/lib/comply/ingestion";

export const processPlan = inngest.createFunction(
  {
    id: "process-plan",
    name: "Process Plan Upload",
    retries: 2,
    onFailure: async ({ error, event }) => {
      const admin = createAdminClient();
      const { projectId, fileName, uploadedBy, planId } = event.data.event.data;

      if (planId) {
        await admin
          .from("plans")
          .update({ status: "error" } as never)
          .eq("id", planId);
      } else if (projectId && fileName && uploadedBy) {
        const { data: plan } = await admin
          .from("plans")
          .select("id")
          .eq("project_id", projectId)
          .eq("file_name", fileName)
          .eq("created_by", uploadedBy)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (plan) {
          await admin
            .from("plans")
            .update({ status: "error" } as never)
            .eq("id", plan.id);
        }
      }

      console.error(`[processPlan] Failed: ${error.message}`);
    },
  },
  { event: "plan/uploaded" },
  async ({ event, step }) => {
    const { projectId, fileName, uploadedBy, planId: eventPlanId } = event.data;

    // 1. Find the plan record. Selected with "*" because file_kind is a
    //    column added by migration 00039 and not yet in generated types.
    const plan = await step.run("find-plan-record", async () => {
      const admin = createAdminClient();

      type PlanRow = {
        id: string;
        org_id: string;
        file_path: string;
        file_name: string;
        file_kind?: "pdf" | "image" | "dwg" | null;
      };

      if (eventPlanId) {
        const { data, error } = await admin
          .from("plans")
          .select("*")
          .eq("id", eventPlanId)
          .single();

        if (error || !data) {
          throw new Error(`Plan record not found for ID ${eventPlanId}: ${error?.message}`);
        }
        return data as unknown as PlanRow;
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
        throw new Error(`Plan record not found for ${fileName}: ${error?.message}`);
      }

      return data as unknown as PlanRow;
    });

    // 2. Update status to processing
    await step.run("update-status-processing", async () => {
      const admin = createAdminClient();
      await admin
        .from("plans")
        .update({ status: "processing" } as never)
        .eq("id", plan.id);
    });

    // 3. Download, parse, chunk, and embed in a single step
    //    (avoids passing large file buffers between steps — Inngest has a 4MB step output limit)
    //
    //    DWG files are converted to DXF via CloudConvert here. DXF preserves
    //    layer structure, block references, and text annotations. We parse
    //    those into a structured payload (stored in plans.extracted_layers)
    //    AND derive a searchable text representation that goes through the
    //    same chunk + embed pipeline as native PDFs. If conversion fails the
    //    plan falls back to manual_review status with the file still stored.
    const result = await step.run("download-and-ingest", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from("plan-uploads")
        .download(plan.file_path);

      if (error || !data) {
        throw new Error(`Failed to download file: ${error?.message}`);
      }

      const arrayBuffer = await data.arrayBuffer();
      const sourceBuffer: Buffer = Buffer.from(arrayBuffer);
      const kind: "pdf" | "image" | "dwg" = plan.file_kind ?? "pdf";

      if (kind === "dwg") {
        const { convertDwg } = await import("@/lib/plans/dwg-converter");
        const conv = await convertDwg(sourceBuffer, plan.file_name, "dxf");
        if ("error" in conv) {
          console.warn(
            `[processPlan] DWG conversion failed for ${plan.id}: ${conv.error}. Falling back to manual_review.`,
          );
          return { pageCount: 0, chunkCount: 0, manualReview: true };
        }

        const { extractLayersFromDxf, dxfToSearchableText } = await import(
          "@/lib/plans/dxf-extractor"
        );
        const extracted = extractLayersFromDxf(conv.buffer);

        if (extracted) {
          await admin
            .from("plans")
            .update({ extracted_layers: extracted } as never)
            .eq("id", plan.id);

          const searchableText = dxfToSearchableText(extracted);
          // Drive the embedding pipeline through ingestPlan with kind=pdf and
          // a text-only payload synthesised from the DXF. parsePdf isn't run
          // for this path; ingestPlan only chunks/embeds the text we provide.
          return await ingestPlanFromText({
            orgId: plan.org_id,
            planId: plan.id,
            text: searchableText,
            pageCount: 1,
          });
        }

        // DXF parse failed — keep the file but flag it.
        return { pageCount: 0, chunkCount: 0, manualReview: true };
      }

      return await ingestPlan(plan.org_id, plan.id, sourceBuffer, kind, plan.file_name);
    });

    // 4. Update status: DWG/manual-review files are stored only; everything
    //    else is marked ready once chunks are embedded.
    await step.run("update-status-final", async () => {
      const admin = createAdminClient();
      await admin
        .from("plans")
        .update({
          status: result.manualReview ? "manual_review" : "ready",
          page_count: result.pageCount,
        } as never)
        .eq("id", plan.id);
    });

    return {
      planId: plan.id,
      pageCount: result.pageCount,
      chunkCount: result.chunkCount,
    };
  }
);
