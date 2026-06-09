"use client";

import { useState } from "react";
import { Loader2, FileText, Image as ImageIcon } from "lucide-react";
import { PlanComparison3D } from "./plan-comparison-3d";
import { SystemExplorerView } from "./system-explorer-view";
import { BuildSequence } from "./build-sequence";
import {
  enqueueTest3D,
  getTest3DStatus,
} from "@/app/(dashboard)/build/test-3d/actions";
import type { Test3DResult } from "@/lib/build/test-3d-runner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  detectPlanKind,
  contentTypeForKind,
  ACCEPTED_PLAN_ACCEPT_ATTR,
  ANTHROPIC_PDF_MAX_BYTES,
  planTooLargeMessage,
} from "@/lib/plans/file-kind";

type Phase = "idle" | "uploading" | "extracting";
type ViewMode = "system-explorer" | "build-sequence" | "standard";

// 32 MB, matching Anthropic's document ceiling. The old 50 MB cap let through
// files the extractor could never process (the Gladesville 36 MB plan).
const MAX_BYTES = ANTHROPIC_PDF_MAX_BYTES;

export function Test3DHarness() {
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Test3DResult | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("system-explorer");

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
        error: planTooLargeMessage(file.size),
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

      const enqueueRes = await enqueueTest3D({
        storagePath,
        fileName: file.name,
        pageInput: page.trim() || undefined,
      });
      if ("error" in enqueueRes) {
        setResult({ layout: null, error: enqueueRes.error });
        setPhase("idle");
        return;
      }

      // Poll every 2s until done / error. Inngest can take several minutes
      // for large multi-drawing DWGs (CloudConvert ~240s + sheet decomposition
      // + per-tile vision extraction, e.g. MH01) — cap the wait at 10 minutes
      // so a hung job doesn't spin forever but a genuinely slow doc-set still
      // has room to finish.
      const POLL_INTERVAL_MS = 2000;
      const MAX_POLL_ATTEMPTS = 300; // 10 minutes
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const status = await getTest3DStatus(enqueueRes.jobId);
        if (status.status === "done") {
          setResult(status.result);
          setPhase("idle");
          return;
        }
        if (status.status === "error") {
          setResult({ layout: null, error: status.error });
          setPhase("idle");
          return;
        }
        if (
          status.status === "not_found" ||
          status.status === "unauthorised"
        ) {
          setResult({
            layout: null,
            error: `Job state lost (${status.status}). Please retry.`,
          });
          setPhase("idle");
          return;
        }
      }
      setResult({
        layout: null,
        error: "Extraction did not complete within 10 minutes. Check Inngest dashboard for run state.",
      });
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
            Plan file (PDF, PNG, JPG, RVT, SKP, DWG, DOC, DOCX — max 32&nbsp;MB; compress larger PDFs)
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

      {/* Layout exists but is empty (zero walls / zero bounds). Most common
          on multi-drawing title-block sheets where the page classifier
          picked a non-floor-plan page and the extractor returned a no-op
          layout. Surface explicitly instead of mounting blank canvases. */}
      {result?.layout &&
        result.layout.walls.length === 0 &&
        result.layout.rooms.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
            <div>
              <strong className="block mb-1">No floor plan geometry extracted</strong>
              The extractor returned 0 walls and 0 rooms. This usually means
              the page that was inspected isn&apos;t a single floor-plan view —
              common with CAD-exported PDFs where each sheet contains multiple
              drawings (plan + elevations + section on one title-block).
              Try a single-drawing PDF or use the page-number input above to
              target a specific floor-plan page.
            </div>
            {result.decomposer && (
              <div className="rounded border border-amber-300 bg-amber-100/60 p-2 text-xs">
                <div className="font-medium mb-1">
                  Tier 2 sheet decomposer:{" "}
                  <code>{result.decomposer.status}</code>
                </div>
                {result.decomposer.status === "skipped-gate-off" && (
                  <div>
                    Fallback gate <code>ENABLE_SHEET_DECOMPOSITION</code> is not
                    set to <code>&quot;true&quot;</code> on this deploy. Set it
                    on Vercel and redeploy to enable.
                  </div>
                )}
                {result.decomposer.status === "skipped-not-needed" && (
                  <div>
                    Standard extractor returned a non-empty layout, so the
                    fallback was bypassed.
                  </div>
                )}
                {(result.decomposer.status === "ran-success" ||
                  result.decomposer.status === "ran-failed") && (
                  <div className="space-y-1">
                    <div>
                      Drawings detected:{" "}
                      <code>{result.decomposer.drawingsDetected ?? 0}</code> ·
                      Candidates tried:{" "}
                      <code>{result.decomposer.attempts?.length ?? 0}</code>
                    </div>
                    {result.decomposer.error && (
                      <div>
                        Error: <code>{result.decomposer.error}</code>
                      </div>
                    )}
                    {result.decomposer.attempts &&
                      result.decomposer.attempts.length > 0 && (
                        <ul className="list-disc pl-5 space-y-0.5">
                          {result.decomposer.attempts.map((a, i) => (
                            <li key={i} className="font-mono">
                              {a.candidate.type} (
                              {Math.round(a.candidate.confidence * 100)}%) →{" "}
                              {a.outcome.kind === "rejected" &&
                                `rejected as ${a.outcome.detectedAs}`}
                              {a.outcome.kind === "extracted" &&
                                `${a.outcome.walls} walls / ${a.outcome.rooms} rooms (conf ${Math.round(a.outcome.confidence * 100)}%)`}
                              {a.outcome.kind === "error" &&
                                `error: ${a.outcome.message}`}
                            </li>
                          ))}
                        </ul>
                      )}
                  </div>
                )}
              </div>
            )}
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

          {result.layout.walls.length > 0 ? (
            <div className="rounded-lg border bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">3D render</h2>
                <div className="flex items-center gap-1 rounded-md border bg-zinc-50 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode("system-explorer")}
                    className={`rounded px-2.5 py-1 transition-colors ${
                      viewMode === "system-explorer"
                        ? "bg-white shadow-sm font-medium text-zinc-900"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    System Explorer
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("build-sequence")}
                    className={`rounded px-2.5 py-1 transition-colors ${
                      viewMode === "build-sequence"
                        ? "bg-white shadow-sm font-medium text-zinc-900"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    Build Sequence
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("standard")}
                    className={`rounded px-2.5 py-1 transition-colors ${
                      viewMode === "standard"
                        ? "bg-white shadow-sm font-medium text-zinc-900"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    Standard
                  </button>
                </div>
              </div>

              {/* Explain the three views — switch with the tabs above */}
              <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50/70 px-3 py-2.5 text-xs text-zinc-600">
                <p className="mb-1 font-medium text-zinc-800">
                  Three views of the same extracted plan — switch with the tabs
                  above:
                </p>
                <ul className="space-y-1">
                  <li>
                    <span className="font-medium text-zinc-800">
                      System Explorer
                    </span>{" "}
                    — the same footprint built four ways (Traditional,
                    Panelised, Volumetric, 3D-printed) side by side. Each render
                    expresses how that system is built (brick · factory panels
                    with seams · craned modules · printed concrete layers), with
                    cost / time / labour metrics and pros &amp; cons. The
                    Traditional card has a brick-veneer ↔ double-brick toggle.
                  </li>
                  <li>
                    <span className="font-medium text-zinc-800">
                      Build Sequence
                    </span>{" "}
                    — an animated walkthrough of the build as a process: site
                    set-out → slab + service stubs → crane set-up → modules
                    craned into place one by one → stitch &amp; weatherproof →
                    finish. Press Play or scrub the timeline. (Volumetric
                    first.)
                  </li>
                  <li>
                    <span className="font-medium text-zinc-800">Standard</span> —
                    the plain extracted 3D model with the before / after
                    optimisation comparison.
                  </li>
                </ul>
              </div>

              {viewMode === "system-explorer" ? (
                <SystemExplorerView layout={result.layout} />
              ) : viewMode === "build-sequence" ? (
                <BuildSequence layout={result.layout} />
              ) : (
                <PlanComparison3D layout={result.layout} suggestions={[]} />
              )}
            </div>
          ) : null}

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
