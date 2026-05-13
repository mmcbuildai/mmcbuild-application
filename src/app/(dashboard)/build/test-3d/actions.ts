"use server";

import { createClient } from "@/lib/supabase/server";
import { extractSpatialLayout } from "@/lib/build/spatial/extractor";
import { renderPdfPage } from "@/lib/build/spatial/pdf-to-image";
import { findFloorPlanPage } from "@/lib/build/spatial/page-classifier";
import { convertViaCloudConvert } from "@/lib/plans/dwg-converter";
import {
  detectPlanKind,
  cloudConvertInputFormat,
  requiresPdfConversion,
  type PlanFileKind,
} from "@/lib/plans/file-kind";
import type { SpatialLayout } from "@/lib/build/spatial/types";

export type Test3DResult = {
  layout: SpatialLayout | null;
  detectedPage?: number;
  totalPagesInspected?: number;
  pageUsed?: number;
  kind?: PlanFileKind;
  convertedFrom?: PlanFileKind;
  error?: string;
};

export async function extractTest3D(input: {
  storagePath: string;
  fileName: string;
  pageInput?: string;
}): Promise<Test3DResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { layout: null, error: "Unauthorised" };

  const { storagePath, fileName, pageInput } = input;
  const kind = detectPlanKind(fileName, null);
  if (!kind) {
    return { layout: null, error: `Unsupported file type: ${fileName}` };
  }

  const { data: fileBlob, error: dlError } = await supabase.storage
    .from("plan-uploads")
    .download(storagePath);

  if (dlError || !fileBlob) {
    return {
      layout: null,
      kind,
      error: `Storage download failed: ${dlError?.message ?? "unknown"}`,
    };
  }

  const sourceBuffer = Buffer.from(await fileBlob.arrayBuffer());

  try {
    let pdfBuffer: Buffer | null = null;
    let convertedFrom: PlanFileKind | undefined;
    let directImage: {
      base64: string;
      mediaType: "image/png" | "image/jpeg";
    } | null = null;

    if (kind === "pdf") {
      pdfBuffer = sourceBuffer;
    } else if (kind === "image") {
      const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "webp") {
        return {
          layout: null,
          kind,
          error:
            "WebP not supported by the current extractor (media-type mismatch). Convert to PNG or JPG and re-upload.",
        };
      }
      const mediaType: "image/png" | "image/jpeg" =
        ext === "png" ? "image/png" : "image/jpeg";
      directImage = {
        base64: sourceBuffer.toString("base64"),
        mediaType,
      };
    } else if (requiresPdfConversion(kind) || kind === "dwg") {
      const inputFormat =
        kind === "dwg" ? "dwg" : cloudConvertInputFormat(kind, fileName);
      if (!inputFormat) {
        return {
          layout: null,
          kind,
          error: `No CloudConvert input format for kind: ${kind}`,
        };
      }
      const conv = await convertViaCloudConvert(
        sourceBuffer,
        fileName,
        inputFormat,
        "pdf",
      );
      if ("error" in conv) {
        return {
          layout: null,
          kind,
          error: `CloudConvert ${kind} → PDF failed: ${conv.error}`,
        };
      }
      pdfBuffer = conv.buffer;
      convertedFrom = kind;
    } else {
      return {
        layout: null,
        kind,
        error: `Unsupported kind in harness: ${kind}`,
      };
    }

    if (pdfBuffer) {
      const requestedPage =
        pageInput && pageInput.trim() !== "" ? Number(pageInput.trim()) : null;
      let pageNumber = requestedPage;
      let detectedPage: number | undefined;
      let totalPagesInspected: number | undefined;

      if (pageNumber == null) {
        const pick = await findFloorPlanPage(pdfBuffer);
        pageNumber = pick.pageNumber ?? 1;
        detectedPage = pick.pageNumber ?? 1;
        totalPagesInspected = pick.totalPagesRendered;
      }

      const imageBase64 = await renderPdfPage(pdfBuffer, pageNumber, 2.0);
      if (!imageBase64) {
        return {
          layout: null,
          kind,
          convertedFrom,
          error: `Failed to render PDF page ${pageNumber}`,
        };
      }
      const layout = await extractSpatialLayout(imageBase64, "image/png");
      return {
        layout,
        detectedPage,
        totalPagesInspected,
        pageUsed: pageNumber,
        kind,
        convertedFrom,
      };
    }

    if (directImage) {
      const layout = await extractSpatialLayout(
        directImage.base64,
        directImage.mediaType,
      );
      return { layout, kind };
    }

    return { layout: null, kind, error: "Unreachable code path" };
  } catch (err) {
    console.error("[test-3d] extract failed:", err);
    return {
      layout: null,
      kind,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
