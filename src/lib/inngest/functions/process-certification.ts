import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";

function guessImageMime(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "tiff" || ext === "tif") return "image/tiff";
  return "image/jpeg";
}

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
        .select("id, org_id, file_path, cert_type, issuer_name, issue_date, expiry_date")
        .eq("id", certificationId)
        .single();

      if (error || !data) {
        throw new Error(`Certification record not found for ${fileName}: ${error?.message}`);
      }

      return data as {
        id: string;
        org_id: string;
        file_path: string;
        cert_type: string;
        issuer_name: string | null;
        issue_date: string | null;
        expiry_date: string | null;
      };
    });

    // 2. Update status to processing
    await step.run("update-status-processing", async () => {
      const admin = createAdminClient();
      await admin
        .from("project_certifications")
        .update({ status: "processing" } as never)
        .eq("id", cert.id);
    });

    // 3. Download and process in a single step
    //    (avoids passing large file buffer between steps — Inngest has a 4MB step output limit)
    const processResult = await step.run("download-and-process", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from("engineering-certs")
        .download(filePath);

      if (error || !data) {
        throw new Error(`Failed to download file: ${error?.message}`);
      }

      const contentType = data.type;
      const isPdf =
        contentType === "application/pdf" ||
        fileName.toLowerCase().endsWith(".pdf");

      const { extractCertMetadata } = await import("@/lib/comply/cert-metadata");

      if (isPdf) {
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await admin
          .from("document_embeddings")
          .delete()
          .eq("source_type", "certification")
          .eq("source_id", cert.id);

        const { parsePdf } = await import("@/lib/pdf/parser");
        const { chunkText } = await import("@/lib/pdf/chunker");
        const { generateEmbeddings } = await import("@/lib/ai/openai");

        const parsed = await parsePdf(buffer);

        // OCR-style metadata extraction from the parsed text. Runs in parallel
        // with embedding work below.
        const metadataPromise = extractCertMetadata({
          orgId: cert.org_id,
          text: parsed.text,
        });

        const chunks = chunkText(parsed.text, {
          sourceType: "certification",
          sourceId: cert.id,
        });

        let chunkCount = 0;
        if (chunks.length > 0) {
          const embeddings = await generateEmbeddings(
            chunks.map((c) => c.content),
          );

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
            const { error } = await admin
              .from("document_embeddings")
              .insert(batch as never);
            if (error) {
              throw new Error(`Failed to insert embeddings batch ${i}: ${error.message}`);
            }
          }
          chunkCount = chunks.length;
        }

        const metadata = await metadataPromise;

        console.log(
          `[Certification] ${cert.id}: ${parsed.pageCount} pages, ${chunkCount} chunks embedded, metadata=${JSON.stringify(metadata)}`,
        );

        return {
          type: "pdf" as const,
          pageCount: parsed.pageCount,
          chunkCount,
          metadata,
        };
      } else {
        // Image cert: vision-extract metadata and store a marker embedding row.
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType =
          contentType && contentType.startsWith("image/")
            ? contentType
            : guessImageMime(fileName);

        await admin
          .from("document_embeddings")
          .delete()
          .eq("source_type", "certification")
          .eq("source_id", cert.id);

        const metadata = await extractCertMetadata({
          orgId: cert.org_id,
          imageBytes: buffer,
          imageMimeType: mimeType,
        });

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

        console.log(
          `[Certification] ${cert.id}: image, metadata=${JSON.stringify(metadata)}`,
        );

        return { type: "image" as const, metadata };
      }
    });

    // 4. Update status to ready and patch metadata fields the user left blank.
    //    Never overwrite user-provided values — OCR is a fill-the-gaps helper.
    await step.run("update-status-ready", async () => {
      const admin = createAdminClient();
      const update: Record<string, unknown> = { status: "ready" };
      const m = processResult.metadata;
      if (m) {
        if (!cert.issuer_name && m.issuer_name) update.issuer_name = m.issuer_name;
        if (!cert.issue_date && m.issue_date) update.issue_date = m.issue_date;
        if (!cert.expiry_date && m.expiry_date) update.expiry_date = m.expiry_date;
      }
      await admin
        .from("project_certifications")
        .update(update as never)
        .eq("id", cert.id);
    });

    return {
      certificationId: cert.id,
      type: cert.cert_type,
      processed: processResult.type,
    };
  }
);
