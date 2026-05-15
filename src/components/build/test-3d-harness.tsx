"use client";

import { useState } from "react";
import { Loader2, FileText, Image as ImageIcon } from "lucide-react";
import { PlanComparison3D } from "./plan-comparison-3d";
import {
  extractTest3D,
  type Test3DResult,
} from "@/app/(dashboard)/build/test-3d/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  detectPlanKind,
  contentTypeForKind,
  ACCEPTED_PLAN_ACCEPT_ATTR,
} from "@/lib/plans/file-kind";

type Phase = "idle" | "uploading" | "extracting";

const MAX_BYTES = 50 * 1024 * 1024;

export function Test3DHarness() {
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Test3DResult | null>(null);
  const [showJson, setShowJson] = useState(false);

  const isPdf = file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf");
  // DWG/RVT/SKP/DOC/DOCX get converted to PDF before extraction, so the page
  // override applies to them too. Only true image files (PNG/JPG) have no
  // page concept.
  const hasPages =
    isPdf ||
    !!file?.name.toLowerCase().match(/\.(dwg|rvt|skp|doc|docx)$/);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    if (file.size > MAX_BYTES) {
      setResult({
        layout: null,
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 50 MB.`,
      });
      return;
    }

    const kind = detectPlanKind(file.name, file.type);
    if (!kind) {
      setResult({
        layout: null,
        error: `Unsupported file type: ${file.name}`,
      });
      return;
    }

    setResult(null);
    setPhase("uploading");

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setResult({ layout: null, error: "Not authenticated" });
        setPhase("idle");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        setResult({ layout: null, error: "Profile not found" });
        setPhase("idle");
        return;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${profile.org_id}/test-3d/${Date.now()}_${safeName}`;

      // Browsers don't set a MIME type for DWG / RVT / SKP / DOC. The
      // File.type is empty (or application/octet-stream) and the Supabase
      // Storage bucket policy checks the File's underlying .type — the
      // upload() contentType option does NOT override that check. So we
      // re-wrap the file's bytes as a Blob with the explicit MIME type
      // so the bucket allowlist sees the correct value.
      const contentType = contentTypeForKind(kind, file.name);
      const typedBlob = new Blob([await file.arrayBuffer()], {
        type: contentType,
      });

      const { error: storageError } = await supabase.storage
        .from("plan-uploads")
        .upload(storagePath, typedBlob, {
          contentType,
        });

      if (storageError) {
        setResult({
          layout: null,
          error: `Upload failed: ${storageError.message}`,
        });
        setPhase("idle");
        return;
      }

      setPhase("extracting");

      const res = await extractTest3D({
        storagePath,
        fileName: file.name,
        pageInput: page.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      setResult({
        layout: null,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setPhase("idle");
    }
  }

  function reset() {
    setFile(null);
    setPage("");
    setResult(null);
    setShowJson(false);
  }

  const busy = phase !== "idle";

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border bg-white p-4 space-y-4"
      >
        <div>
          <label className="block text-sm font-medium mb-1">
            Plan file (PDF, PNG, JPG, RVT, SKP, DWG, DOC, DOCX — max 50&nbsp;MB)
          </label>
          <input
            type="file"
            accept={ACCEPTED_PLAN_ACCEPT_ATTR}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
            className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm hover:file:bg-zinc-200"
            disabled={busy}
          />
          {file && (
            <p className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
              {isPdf ? (
                <FileText className="h-3.5 w-3.5" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
              <span>
                {file.name} · {(file.size / 1024).toFixed(0)} KB ·{" "}
                {file.type || "unknown type"}
              </span>
            </p>
          )}
        </div>

        {hasPages && (
          <div>
            <label className="block text-sm font-medium mb-1">
              PDF page (blank = auto-detect floor plan page)
            </label>
            <input
              type="number"
              min={1}
              value={page}
              onChange={(e) => setPage(e.target.value)}
              placeholder="auto"
              className="w-32 rounded border px-2 py-1 text-sm"
              disabled={busy}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Auto-detect uses Haiku to scan up to the first 15 pages and pick
              the first floor plan it finds. For RVT/SKP/DOC/DWG, this applies
              to the converted PDF.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={!file || busy}>
            {phase === "uploading" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading to storage…
              </>
            ) : phase === "extracting" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Extracting…
              </>
            ) : (
              "Upload & Render"
            )}
          </Button>
          {(file || result) && !busy && (
            <Button type="button" variant="outline" onClick={reset}>
              Reset
            </Button>
          )}
        </div>
      </form>

      {result?.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-2">
          <div>
            <strong className="block mb-1">Failed</strong>
            {result.error}
          </div>
          {result.convertedFrom && (
            <p className="text-xs">
              Converted from <code>{result.convertedFrom}</code> to PDF via
              CloudConvert before extraction.
            </p>
          )}
          {result.pdfPageCount != null && (
            <p className="text-xs">
              PDF has {result.pdfPageCount} pages.
            </p>
          )}
          {result.classifications && result.classifications.length > 0 && (
            <details open className="text-xs">
              <summary className="cursor-pointer font-medium">
                Page classifications ({result.classifications.length}) —
                what the classifier labeled each page as
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
                {result.classifications.map((c) => (
                  <span key={c.pageNumber} className="font-mono">
                    p{c.pageNumber}: {c.type} ({Math.round(c.confidence * 100)}
                    %)
                  </span>
                ))}
              </div>
              <p className="mt-2">
                If none of these are <code>floor_plan_ground</code> or{" "}
                <code>floor_plan_upper</code>, the classifier didn&apos;t
                recognise any page as a floor plan. Try entering a specific
                page number in the PDF page field above to force one as the
                floor plan.
              </p>
            </details>
          )}
        </div>
      )}

      {result && !result.error && !result.layout && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Extractor returned no layout. The image may not be a recognisable
          floor plan, or the AI couldn&apos;t parse it. Check server logs for
          details.
        </div>
      )}

      {result?.layout && (
        <>
          <div className="space-y-1 text-xs text-zinc-600">
            {result.convertedFrom && (
              <p>
                Converted from <code>{result.convertedFrom}</code> to PDF via
                CloudConvert before extraction.
              </p>
            )}
            {result.detectedPage != null && (
              <p>Auto-detected floor plan on page {result.detectedPage}.</p>
            )}
            {result.pageUsed != null && result.detectedPage == null && (
              <p>Used PDF page {result.pageUsed}.</p>
            )}
            {result.pdfPageCount != null && (
              <p>PDF has {result.pdfPageCount} pages total.</p>
            )}
            {result.elevationsExtracted != null &&
              result.elevationsExtracted > 0 && (
                <p>
                  Inspected{" "}
                  <strong>{result.elevationsExtracted}</strong> elevation
                  page(s)
                  {result.layout.roof
                    ? " — roof + cladding merged into layout"
                    : " — but no roof or cladding data was extracted (model may have been unable to read the page)"}
                  .
                </p>
              )}
            {result.sectionPage != null && (
              <p>
                Inspected section page{" "}
                <strong>{result.sectionPage}</strong>
                {result.layout.storey_details &&
                result.layout.storey_details.length > 0
                  ? ` — ${result.layout.storey_details.length} storey heights merged`
                  : " — no storey heights extracted"}
                .
              </p>
            )}
            {result.schedulePage != null && (
              <p>
                Inspected schedule page{" "}
                <strong>{result.schedulePage}</strong>
                {result.layout.materials &&
                Object.keys(result.layout.materials).length > 0
                  ? " — material defaults merged"
                  : " — no material defaults extracted"}
                .
              </p>
            )}
            {result.layout.roof && (
              <p>
                Roof: <strong>{result.layout.roof.form}</strong>, pitch{" "}
                {result.layout.roof.pitch_deg?.toFixed(1)}°, eave{" "}
                {result.layout.roof.eave_overhang_m?.toFixed(2)} m.
              </p>
            )}
            {result.classifications && result.classifications.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-zinc-500 hover:text-zinc-700">
                  Page classifications ({result.classifications.length})
                </summary>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
                  {result.classifications.map((c) => (
                    <span key={c.pageNumber} className="font-mono text-[10px]">
                      p{c.pageNumber}: {c.type}
                    </span>
                  ))}
                </div>
              </details>
            )}
          </div>

          <div className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">3D render</h2>
            <PlanComparison3D layout={result.layout} suggestions={[]} />
          </div>

          <div className="rounded-lg border bg-white">
            <button
              type="button"
              onClick={() => setShowJson((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-left hover:bg-zinc-50 rounded-lg"
            >
              <span>
                {showJson ? "Hide" : "Show"} extracted JSON
              </span>
              <span className="text-xs font-normal text-zinc-500">
                {result.layout.walls.length} walls ·{" "}
                {result.layout.rooms.length} rooms ·{" "}
                {result.layout.openings?.length ?? 0} openings · confidence{" "}
                {Math.round((result.layout.confidence ?? 0) * 100)}%
              </span>
            </button>
            {showJson && (
              <pre className="border-t bg-zinc-50 p-4 text-xs overflow-auto max-h-96">
                {JSON.stringify(result.layout, null, 2)}
              </pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}
