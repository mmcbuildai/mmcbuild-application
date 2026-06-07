"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2, AlertCircle, PlayCircle, Box } from "lucide-react";
import { BuildSequence } from "./build-sequence";
import { SystemExplorerView } from "./system-explorer-view";
import { PlanComparison3D } from "./plan-comparison-3d";
import { startProjectSystemPreview } from "@/app/(dashboard)/build/actions";
import { getTest3DStatus } from "@/app/(dashboard)/build/test-3d/actions";
import type { SpatialLayout } from "@/lib/build/spatial";

type Phase = "idle" | "working" | "ready" | "error";
type ViewMode = "build-sequence" | "system-explorer" | "plan-comparison";

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
export function SystemPreviewPanel({ planId }: { planId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [layout, setLayout] = useState<SpatialLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("build-sequence");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

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
    const tick = async () => {
      const status = await getTest3DStatus(jobId);
      if (status.status === "done") {
        if (status.result.layout) {
          markReady(status.result.layout);
        } else {
          setError(
            "We couldn't reconstruct a 3D layout from this plan. The build-sequence preview needs a readable floor plan.",
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
        {phase !== "ready" && (
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
            ) : phase === "error" ? (
              "Try again"
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
        <div className="flex items-start gap-2 border-t px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
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
        </div>
      )}
    </div>
  );
}
