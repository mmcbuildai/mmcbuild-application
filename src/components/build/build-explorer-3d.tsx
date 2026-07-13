"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Box, Layers, PlayCircle } from "lucide-react";
import { SystemExplorerView } from "./system-explorer-view";
import { BuildSequence } from "./build-sequence";
import { PlanComparison3D } from "./plan-comparison-3d";
import type { SpatialLayout } from "@/lib/build/spatial";

type ViewMode = "system-explorer" | "build-sequence" | "plan-comparison";

interface BuildExplorer3DProps {
  layout: SpatialLayout;
  suggestions: Array<{
    id: string;
    technology_category: string;
    suggested_alternative: string;
    estimated_cost_savings: number | null;
    estimated_time_savings: number | null;
    affected_wall_ids?: string[];
    affected_room_ids?: string[];
  }>;
}

const VIEWS: Array<{
  key: ViewMode;
  label: string;
  blurb: string;
  Icon: typeof Box;
}> = [
  {
    key: "system-explorer",
    label: "System Explorer",
    blurb:
      "Compare the four MMC systems (Traditional, Panelised, Volumetric, 3D-printed) side by side on your footprint — each with indicative cost / time / labour and pros & cons.",
    Icon: Layers,
  },
  {
    key: "build-sequence",
    label: "Build Sequence",
    blurb:
      "Watch the build as a process — site set-out → slab → system assembly → stitch & weatherproof → finish. Press Play or scrub the timeline.",
    Icon: PlayCircle,
  },
  {
    key: "plan-comparison",
    label: "Plan Comparison",
    blurb:
      "The extracted 3D model of your building with the recommended MMC optimisations mapped onto the walls.",
    Icon: Box,
  },
];

/**
 * Click-gated 3D build explorer for the per-project Design Optimisation Report.
 *
 * Mounts the WebGL canvas only after the user opens the panel, so the heavy
 * three.js scene never loads on the initial report render. Surfaces the same
 * three views as the /build/test-3d harness, fed by the project's real
 * extracted spatial layout and AI optimisation suggestions.
 */
export function BuildExplorer3D({ layout, suggestions }: BuildExplorer3DProps) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<ViewMode>("system-explorer");

  const overlayCount = suggestions.filter(
    (s) => (s.affected_wall_ids?.length ?? 0) > 0,
  ).length;

  const active = VIEWS.find((v) => v.key === view) ?? VIEWS[0];

  return (
    <div className="rounded-lg border bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left hover:bg-zinc-50"
      >
        <div className="flex items-center gap-3">
          <Box className="h-5 w-5 shrink-0 text-brand-600" />
          <div>
            <p className="text-base font-medium text-zinc-900">
              {expanded
                ? "Hide 3D build explorer"
                : "Explore your building in 3D"}
            </p>
            <p className="text-xs text-zinc-500">
              {overlayCount > 0
                ? `Compare MMC systems · watch the build sequence · ${overlayCount} suggestion${overlayCount === 1 ? "" : "s"} mapped to walls`
                : "Compare MMC systems · watch the build sequence · see the recommended mix"}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
        )}
      </button>

      {expanded && (
        <div className="border-t p-4">
          {/* View toggle — wraps on mobile, ≥44px tap targets */}
          <div
            role="tablist"
            aria-label="3D view"
            className="flex flex-wrap gap-2"
          >
            {VIEWS.map(({ key, label, Icon }) => {
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
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-zinc-500">{active.blurb}</p>

          <div className="mt-4">
            {view === "system-explorer" ? (
              <SystemExplorerView layout={layout} />
            ) : view === "build-sequence" ? (
              <BuildSequence layout={layout} />
            ) : (
              <PlanComparison3D layout={layout} suggestions={suggestions} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
