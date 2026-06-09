"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Layers, Loader2, AlertCircle, PlayCircle, Box } from "lucide-react";
import { BuildSequence } from "./build-sequence";
import { SystemExplorerView } from "./system-explorer-view";
import { PlanComparison3D } from "./plan-comparison-3d";
import { SystemSelectChips } from "./system-select-chips";
import { startProjectSystemPreview } from "@/app/(dashboard)/build/actions";
import { getTest3DStatus } from "@/app/(dashboard)/build/test-3d/actions";
import type { SpatialLayout } from "@/lib/build/spatial";

type Phase = "idle" | "working" | "ready" | "error";
type ViewMode = "build-sequence" | "system-explorer" | "plan-comparison";

// Hard ceiling on the poll loop. Without it, a job stuck at status='processing'
// (e.g. a worker killed mid-step) makes the panel re-poll every 2.5s forever —
// the browser tab eventually dies after spinning for minutes. Matches the
// /build/test-3d harness cap (10 min) so a genuinely slow DWG → PDF → vision
// extraction still has room to finish, but a hung job always resolves to an
// error the user can act on instead of an infinite spinner.
const MAX_POLL_MS = 10 * 60 * 1000;

const PREVIEW_VIEWS: Array<{ key: ViewMode; label: string; Icon: typeof Box }> = [
  { key: "build-sequence", label: "Build Sequence", Icon: PlayCircle },
  { key: "system-explorer", label: "Compare Systems", Icon: Layers },
  { key: "plan-comparison", label: "Standard Model", Icon: Box },
];

/**
 * Pre-selection build-sequence preview for the project Build page.
 *
 * Lets the user watch their already-uploaded plan built as a step-by-step
 * sequence in each MMC system BEFORE they choose a construction system below —
 * so the choice is informed by seeing how each system actually goes together.
 * Runs the same extraction pipeline as /build/test-3d against the project's
 * plan (no re-upload), then mounts the Build Sequence storyboard.
 */
export function SystemPreviewPanel({
  projectId,
  planId,
  initialSystems,
  hasDownstreamReports,
}: {
  projectId: string;
  planId: string;
  initialSystems: string[];
  hasDownstreamReports: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [layout, setLayout] = useState<SpatialLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("build-sequence");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Stop the poll loop on unmount so it doesn't keep calling the server action
  // (and setState) after the user navigates away.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // On a successful extraction, refresh server components so the Design
  // Optimisation gate unlocks (the build page re-checks hasPlanLayout). This
  // is a soft refresh — the panel keeps its rendered 3D.
  const markReady = useCallback(
    (l: SpatialLayout) => {
      setLayout(l);
      setPhase("ready");
      router.refresh();
    },
    [router],
  );

  const poll = useCallback((jobId: string) => {
    const deadline = Date.now() + MAX_POLL_MS;
    const tick = async () => {
      if (Date.now() > deadline) {
        setError(
          "The preview is taking longer than expected and timed out. The job may still be processing in the background — refresh this page in a minute, or try again.",
        );
        setPhase("error");
        return;
      }
      const status = await getTest3DStatus(jobId);
      if (status.status === "done") {
        if (status.result.layout) {
          markReady(status.result.layout);
        } else {
          // Prefer the extractor's specific reason (e.g. the file-too-large
          // guard) over the generic fallback — otherwise an actionable
          // message is silently replaced with "no readable floor plan".
          setError(
            status.result.error ||
              "We couldn't reconstruct a 3D model from this plan — no readable floor plan / wall geometry was found.",
          );
          setPhase("error");
        }
        return;
      }
      if (status.status === "error") {
        setError(status.error || "Preview failed.");
        setPhase("error");
        return;
      }
      if (
        status.status === "not_found" ||
        status.status === "unauthorised"
      ) {
        setError("Preview job not found.");
        setPhase("error");
        return;
      }
      // queued | processing → keep polling
      pollRef.current = setTimeout(tick, 2500);
    };
    pollRef.current = setTimeout(tick, 2000);
  }, [markReady]);

  const start = useCallback(async () => {
    // Clear any in-flight poll chain so a retry can't run two loops at once.
    if (pollRef.current) clearTimeout(pollRef.current);
    setPhase("working");
    setError(null);
    const res = await startProjectSystemPreview(planId);
    if ("error" in res) {
      setError(res.error);
      setPhase("error");
      return;
    }
    if ("layout" in res) {
      markReady(res.layout);
      return;
    }
    poll(res.jobId);
  }, [planId, poll, markReady]);

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Layers className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
          <div>
            <p className="text-base font-medium text-zinc-900">
              See your design built in the 4 MMC systems
            </p>
            <p className="mt-0.5 text-sm text-zinc-500">
              Watch your uploaded plan built as a step-by-step sequence in each
              system — Traditional (timber frame &amp; cladding, or block),
              Volumetric, Panelised (incl. SIP), and 3D concrete printing. See
              how they work, then choose your preferred system for design
              optimisation below.
            </p>
          </div>
        </div>
        {(phase === "idle" || phase === "working") && (
          <button
            type="button"
            onClick={start}
            disabled={phase === "working"}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === "working" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Building preview…
              </>
            ) : (
              "Show my design"
            )}
          </button>
        )}
      </div>

      {phase === "working" && (
        <p className="border-t px-4 py-3 text-xs text-zinc-500">
          Reconstructing your floor plan in 3D. This takes around 30 seconds to
          a couple of minutes the first time, depending on the plan — it&apos;s
          cached after that.
        </p>
      )}

      {phase === "error" && error && (
        <div className="border-t bg-red-50 px-4 py-4">
          <div className="flex items-start gap-2 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-medium">
                We can&apos;t process this design
              </p>
              <p className="mt-1 text-red-700">{error}</p>
              <p className="mt-2 text-red-700">
                MMC Build needs a readable plan it can reconstruct in 3D. Please
                fix the issue in your design and re-upload it — common causes are
                a scanned/image-only PDF with no vector geometry, a plan set with
                no floor-plan sheet, or a CAD export with the geometry in model
                space only. Design Optimisation stays locked until a valid design
                extracts.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href={`/comply/${projectId}/upload`}
                  className="inline-flex min-h-[44px] items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Re-upload your design
                </Link>
                <button
                  type="button"
                  onClick={start}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "ready" && layout && (
        <div className="border-t p-4">
          <div role="tablist" aria-label="Preview view" className="flex flex-wrap gap-2">
            {PREVIEW_VIEWS.map(({ key, label, Icon }) => {
              const selected = key === view;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setView(key)}
                  className={`flex min-h-[44px] items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? "border-teal-600 bg-teal-50 text-teal-700"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            {view === "build-sequence" ? (
              <BuildSequence layout={layout} />
            ) : view === "system-explorer" ? (
              <SystemExplorerView layout={layout} />
            ) : (
              <PlanComparison3D layout={layout} suggestions={[]} />
            )}
          </div>

          <SystemSelectChips
            projectId={projectId}
            initialSystems={initialSystems}
            hasDownstreamReports={hasDownstreamReports}
          />
        </div>
      )}
    </div>
  );
}
