import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestPlan, ingestPlanFromText } from "@/lib/comply/ingestion";
import {
  cloudConvertInputFormat,
  requiresPdfConversion,
  type PlanFileKind,
} from "@/lib/plans/file-kind";

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
        file_kind?: PlanFileKind | null;
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
      const kind: PlanFileKind = plan.file_kind ?? "pdf";

      // Text extraction + embedding is a Comply-search enhancement, NOT a
      // prerequisite for project setup. It must never hard-fail the plan: a
      // throw here propagates to onFailure → status "error", which blocks
      // activation even though the file is stored and the geometry is extracted
      // separately by the eager test-3d job. Observed failures include
      // pdf-parse@1.1.1 throwing "bad XRef entry" on malformed PDFs and embed
      // errors on DWG-derived text. On ANY such failure, keep the file and fall
      // back to manual_review (a usable, activatable state). (SCRUM-272)
      try {
        if (kind === "dwg") {
          const { convertDwg } = await import("@/lib/plans/dwg-converter");
          const conv = await convertDwg(sourceBuffer, plan.file_name, "dxf");
          if ("error" in conv) {
            console.warn(
              `[processPlan] DWG conversion failed for ${plan.id}: ${conv.error}. Falling back to manual_review.`,
            );
            return {
              pageCount: 0,
              chunkCount: 0,
              manualReview: true,
              errorMessage: `DWG → DXF conversion failed: ${conv.error}`,
            };
          }

          const {
            extractLayersFromDxf,
            dxfToSearchableText,
            dxfTooLargeToParse,
            DXF_TOO_LARGE_MESSAGE,
          } = await import("@/lib/plans/dxf-extractor");

          // Bail BEFORE the memory-heavy parse on an oversized DXF. parseSync on
          // a giant DXF OOM-kills the whole invocation (an uncatchable 500 HTML
          // page, not a throw), which would skip this very try/catch and strand
          // the plan in "error". Storing it as manual_review keeps the file
          // usable and tells the user exactly what to do. (Karen, 2026-06-11.)
          if (dxfTooLargeToParse(conv.buffer.length)) {
            console.warn(
              `[processPlan] DXF for ${plan.id} is ` +
                `${(conv.buffer.length / 1024 / 1024).toFixed(1)}MB — over the parse ` +
                `cap; storing as manual_review without parsing.`,
            );
            return {
              pageCount: 0,
              chunkCount: 0,
              manualReview: true,
              errorMessage: DXF_TOO_LARGE_MESSAGE,
            };
          }

          const extracted = extractLayersFromDxf(conv.buffer);

          if (extracted) {
            await admin
              .from("plans")
              .update({ extracted_layers: extracted } as never)
              .eq("id", plan.id);

            const searchableText = dxfToSearchableText(extracted);
            return await ingestPlanFromText({
              orgId: plan.org_id,
              planId: plan.id,
              text: searchableText,
              pageCount: 1,
            });
          }

          // DXF parse failed — keep the file but flag it.
          return {
            pageCount: 0,
            chunkCount: 0,
            manualReview: true,
            errorMessage: "Couldn't read CAD layers from the converted DXF.",
          };
        }

        // RVT / SKP / DOC / DOCX → convert to PDF via CloudConvert, then run
        // the standard PDF ingestion path. Conversion failures fall back to
        // manual_review with the original file still in storage.
        if (requiresPdfConversion(kind)) {
          const inputFormat = cloudConvertInputFormat(kind, plan.file_name);
          if (!inputFormat) {
            return {
              pageCount: 0,
              chunkCount: 0,
              manualReview: true,
              errorMessage: `Unsupported file type for conversion: ${kind}`,
            };
          }
          const { convertViaCloudConvert } = await import(
            "@/lib/plans/dwg-converter"
          );
          const conv = await convertViaCloudConvert(
            sourceBuffer,
            plan.file_name,
            inputFormat,
            "pdf",
          );
          if ("error" in conv) {
            console.warn(
              `[processPlan] ${kind} conversion failed for ${plan.id}: ${conv.error}. Falling back to manual_review.`,
            );
            return {
              pageCount: 0,
              chunkCount: 0,
              manualReview: true,
              errorMessage: `${kind} → PDF conversion failed: ${conv.error}`,
            };
          }
          return await ingestPlan(
            plan.org_id,
            plan.id,
            conv.buffer,
            "pdf",
            plan.file_name,
          );
        }

        return await ingestPlan(
          plan.org_id,
          plan.id,
          sourceBuffer,
          kind,
          plan.file_name,
        );
      } catch (ingestErr) {
        const reason =
          ingestErr instanceof Error ? ingestErr.message : String(ingestErr);
        console.error(
          `[processPlan] ingest failed for ${plan.id} (kind=${kind}); keeping file as manual_review:`,
          ingestErr,
        );
        return {
          pageCount: 0,
          chunkCount: 0,
          manualReview: true,
          errorMessage: `Processing failed: ${reason}`,
        };
      }
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

      // Record WHY a plan landed in manual_review (cleared on success) so the
      // reason shows on the plan card instead of only in function logs.
      // Best-effort + separate from the status write: pre-migration (no
      // error_message column) this errors silently and never fails the run.
      const errorMessage =
        (result as { errorMessage?: string }).errorMessage ?? null;
      const { error: msgErr } = await admin
        .from("plans")
        .update({ error_message: errorMessage } as never)
        .eq("id", plan.id);
      if (msgErr) {
        console.warn(
          `[processPlan] could not record error_message for ${plan.id} (column may be missing):`,
          msgErr.message,
        );
      }
    });

    return {
      planId: plan.id,
      pageCount: result.pageCount,
      chunkCount: result.chunkCount,
    };
  }
);
