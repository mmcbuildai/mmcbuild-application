import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestPlan, ingestPlanFromText } from "@/lib/comply/ingestion";
import {
  cloudConvertInputFormat,
  requiresPdfConversion,
  type PlanFileKind,
} from "@/lib/plans/file-kind";
import {
  classifyIngestOutcome,
  type IngestOutcome,
} from "@/lib/plans/ingest-outcome";

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

      // Ingest a PDF, and if it yields NOTHING, try reading it with vision.
      //
      // A drawing exported from CAD is a picture of words — room names and
      // dimensions are line-work, not characters — so text extraction returns
      // zero chunks and every downstream feature has no input. Karen's 36.9MB
      // DWG (2026-08-04) produced 0 chunks where a working PDF produces 28.
      //
      // Ordered text-first deliberately: extracted text is exact, a vision
      // transcription is a model's reading of a picture, and we prefer the
      // exact one whenever it exists. That ordering is also the cost control —
      // a normal text PDF never reaches the model. On any vision failure we
      // return the original empty result, which classifyIngestOutcome turns
      // into an honest manual_review rather than a false "ready".
      const ingestPdfWithVisionFallback = async (pdfBuffer: Buffer) => {
        const direct = await ingestPlan(
          plan.org_id,
          plan.id,
          pdfBuffer,
          "pdf",
          plan.file_name,
        );
        if (direct.chunkCount > 0) return direct;

        const { readPlanTextViaVision } = await import(
          "@/lib/plans/vision-text-fallback"
        );
        console.warn(
          `[processPlan] ${plan.id}: text extraction produced no chunks — reading the drawing with vision.`,
        );
        const vision = await readPlanTextViaVision(pdfBuffer, plan.file_name);
        if ("error" in vision) {
          console.warn(
            `[processPlan] ${plan.id}: vision fallback did not produce text: ${vision.error}`,
          );
          return direct;
        }
        return await ingestPlanFromText({
          orgId: plan.org_id,
          planId: plan.id,
          text: vision.text,
          pageCount: direct.pageCount || 1,
        });
      };

      try {
        if (kind === "dwg") {
          const { convertDwg, convertViaCloudConvert } = await import(
            "@/lib/plans/dwg-converter"
          );
          const {
            extractLayersFromDxf,
            dxfToSearchableText,
            dxfTooLargeToParse,
          } = await import("@/lib/plans/dxf-extractor");

          // DWG → PDF → standard PDF text ingestion. The single fallback for
          // every case where the preferred DXF-layer path can't produce
          // searchable content, so a DWG never dead-ends at manual_review while
          // a usable PDF render exists. Mirrors the 3D extractor's "DXF first,
          // PDF fallback" shape so both code paths handle a DWG the same way.
          // (2026-06-11 — consolidation.)
          const ingestDwgViaPdf = async (reason: string) => {
            console.warn(
              `[processPlan] DWG ${plan.id}: ${reason} — trying DWG → PDF text ingestion.`,
            );
            const pdf = await convertViaCloudConvert(
              sourceBuffer,
              plan.file_name,
              "dwg",
              "pdf",
            );
            if ("error" in pdf) {
              return {
                pageCount: 0,
                chunkCount: 0,
                manualReview: true,
                errorMessage: `${reason}; DWG → PDF fallback also failed: ${pdf.error}`,
              };
            }
            return await ingestPdfWithVisionFallback(pdf.buffer);
          };

          // 1. Preferred: DWG → DXF (preserves CAD layers + text annotations).
          const conv = await convertDwg(sourceBuffer, plan.file_name, "dxf");
          if ("error" in conv) {
            return await ingestDwgViaPdf(
              `DWG → DXF conversion failed: ${conv.error}`,
            );
          }

          // 2. Guard the parse against OOM on a huge DXF — parseSync on a giant
          //    DXF OOM-kills the whole invocation (an uncatchable 500, not a
          //    throw). Skip the parse and fall back to PDF. (Karen, 2026-06-11.)
          if (dxfTooLargeToParse(conv.buffer.length)) {
            return await ingestDwgViaPdf(
              `DXF is ${(conv.buffer.length / 1024 / 1024).toFixed(1)}MB — over the parse cap`,
            );
          }

          // 3. Extract CAD layers → searchable text + store extracted_layers.
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

          // 4. DXF parsed but yielded no readable layers → PDF fallback.
          return await ingestDwgViaPdf("DXF produced no readable CAD layers");
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
          return await ingestPdfWithVisionFallback(conv.buffer);
        }

        // Native PDF gets the vision fallback too — a scanned or vector-only
        // PDF is the same defect wearing a different extension. Images keep the
        // plain path: callVisionModel takes a PDF, and a photo of a plan is a
        // different problem with a different answer (see noContentMessage).
        if (kind === "pdf") return await ingestPdfWithVisionFallback(sourceBuffer);

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

    // 4. Update status from what ingestion ACTUALLY produced.
    //
    //    This used to read `result.manualReview ? "manual_review" : "ready"`,
    //    so a plan that extracted ZERO chunks was marked ready with no error —
    //    indistinguishable, to the user and to us, from one that extracted
    //    everything. Karen's 36.9MB DWG (2026-08-04) is the reported case: the
    //    upload genuinely had no problems, the reading did, and nothing said
    //    so. classifyIngestOutcome applies the repo's own rule — a job
    //    reporting done is not proof of success — and names the cause in the
    //    user's terms. It is format-agnostic on purpose: a scanned PDF and an
    //    unreadable image fail identically.
    await step.run("update-status-final", async () => {
      const admin = createAdminClient();
      const classified = classifyIngestOutcome(
        result as IngestOutcome,
        plan.file_kind ?? "pdf",
      );
      await admin
        .from("plans")
        .update({
          status: classified.status,
          page_count: result.pageCount,
        } as never)
        .eq("id", plan.id);

      // Record WHY a plan landed in manual_review (cleared on success) so the
      // reason shows on the plan card instead of only in function logs.
      // Best-effort + separate from the status write: pre-migration (no
      // error_message column) this errors silently and never fails the run.
      const errorMessage = classified.errorMessage;
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
