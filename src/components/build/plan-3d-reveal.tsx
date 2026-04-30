"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Box } from "lucide-react";
import { PlanComparison3D } from "./plan-comparison-3d";
import type { SpatialLayout } from "@/lib/build/spatial";

interface Plan3DRevealProps {
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

export function Plan3DReveal({ layout, suggestions }: Plan3DRevealProps) {
  const [expanded, setExpanded] = useState(false);

  const overlayCount = suggestions.filter(
    (s) => (s.affected_wall_ids?.length ?? 0) > 0
  ).length;

  return (
    <div className="rounded-lg border bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 rounded-lg"
      >
        <div className="flex items-center gap-3">
          <Box className="h-5 w-5 text-teal-600" />
          <div>
            <p className="text-sm font-medium text-zinc-900">
              {expanded
                ? "Hide 3D revolving view"
                : "Show 3D revolving view of your building with the recommended MMC mix"}
            </p>
            <p className="text-xs text-zinc-500">
              {overlayCount > 0
                ? `${overlayCount} suggestion${overlayCount === 1 ? "" : "s"} mapped to walls`
                : "Drag to rotate · scroll to zoom · right-drag to pan"}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-zinc-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        )}
      </button>

      {expanded && (
        <div className="border-t p-4">
          <PlanComparison3D layout={layout} suggestions={suggestions} />
        </div>
      )}
    </div>
  );
}
