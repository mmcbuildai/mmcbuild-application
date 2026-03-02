import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestPlan } from "@/lib/comply/ingestion";

export const processCertification = inngest.createFunction(
  {
    id: "process-certification",
    name: "Process Certification Upload",
    retries: 1,
    onFailure: async ({ error, event }) => {
      const admin = createAdminClient();
      const certId = event.data.event.data.certificationId;
      if (certId) {
        await admin
          .from("project_certifications")
          .update({
            status: "error",
            error_message: error.message ?? "Unknown processing error",
          } as never)
          .eq("id", certId);
      }
    },
  },
  { event: "certification/uploaded" },
  async ({ event, step }) => {
    const { certificationId, fileName, filePath } = event.data;

    // 1. Load certification record
    const cert = await step.run("load-cert-record", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("project_certifications")
        .select("id, org_id, file_path, cert_type")
        .eq("id", certificationId)
        .single();

      if (error || !data) {
        throw new Error(`Certification record not found for ${fileName}: ${error?.message}`);
      }

      return data as { id: string; org_id: string; file_path: string; cert_type: string };
    });

    // 2. Update status to processing
    await step.run("update-status-processing", async () => {
      const admin = createAdminClient();
      await admin
        .from("project_certifications")
        .update({ status: "processing" } as never)
        .eq("id", cert.id);
    });

    // 3. Download file from storage
    const fileData = await step.run("download-file", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from("engineering-certs")
        .download(filePath);

      if (error || !data) {
        throw new Error(`Failed to download file: ${error?.message}`);
      }

      const arrayBuffer = await data.arrayBuffer();
      return {
        base64: Buffer.from(arrayBuffer).toString("base64"),
        contentType: data.type,
      };
    });

    // 4. Process based on file type
    const isPdf = fileData.contentType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      // Parse PDF, chunk, and embed (reuse plan ingestion with "certification" source type)
      await step.run("ingest-certification-pdf", async () => {
        const buffer = Buffer.from(fileData.base64, "base64");
        const admin = createAdminClient();

        // Delete any existing embeddings for this certification
        await admin
          .from("document_embeddings")
          .delete()
          .eq("source_type", "certification")
          .eq("source_id", cert.id);

        // Use the same ingestion pipeline but with certification source type
        // ingestPlan uses source_type "plan" internally, so we do it manually here
        const { parsePdf } = await import("@/lib/pdf/parser");
        const { chunkText } = await import("@/lib/pdf/chunker");
        const { generateEmbeddings } = await import("@/lib/ai/openai");

        const parsed = await parsePdf(buffer);
        const chunks = chunkText(parsed.text, {
          sourceType: "certification",
          sourceId: cert.id,
        });

        if (chunks.length === 0) {
          return { pageCount: parsed.pageCount, chunkCount: 0 };
        }

        const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

        const rows = chunks.map((chunk, i) => ({
          org_id: cert.org_id,
          source_type: "certification" as const,
          source_id: cert.id,
          chunk_index: chunk.chunk_index,
          content: chunk.content,
          metadata: { ...chunk.metadata, cert_type: cert.cert_type },
          embedding: JSON.stringify(embeddings[i].embedding),
        }));

        for (let i = 0; i < rows.length; i += 50) {
          const batch = rows.slice(i, i + 50);
          const { error } = await admin.from("document_embeddings").insert(batch as never);
          if (error) {
            throw new Error(`Failed to insert embeddings batch ${i}: ${error.message}`);
          }
        }

        console.log(
          `[Certification] ${cert.id}: ${parsed.pageCount} pages, ${chunks.length} chunks embedded`
        );

        return { pageCount: parsed.pageCount, chunkCount: chunks.length };
      });
    } else {
      // Image file: store a single metadata chunk (no text extraction)
      await step.run("store-image-metadata", async () => {
        const admin = createAdminClient();

        await admin
          .from("document_embeddings")
          .delete()
          .eq("source_type", "certification")
          .eq("source_id", cert.id);

        await admin.from("document_embeddings").insert({
          org_id: cert.org_id,
          source_type: "certification",
          source_id: cert.id,
          chunk_index: 0,
          content: `Engineering certification: ${cert.cert_type} (image file: ${fileName})`,
          metadata: {
            cert_type: cert.cert_type,
            file_name: fileName,
            is_image: true,
          },
        } as never);
      });
    }

    // 5. Update status to ready
    await step.run("update-status-ready", async () => {
      const admin = createAdminClient();
      await admin
        .from("project_certifications")
        .update({ status: "ready" } as never)
        .eq("id", cert.id);
    });

    return {
      certificationId: cert.id,
      type: cert.cert_type,
      processed: isPdf ? "pdf" : "image",
    };
  }
);
