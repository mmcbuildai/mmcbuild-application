"use client";

import { useState } from "react";
import { PlanViewer3D } from "./plan-viewer-3d";
import type { SpatialLayout, SuggestionOverlay } from "@/lib/build/spatial";

// Technology category → overlay colour mapping
const CATEGORY_COLOURS: Record<string, string> = {
  clt_mass_timber: "#14b8a6",     // teal
  prefabricated_panels: "#8b5cf6", // violet
  modular_systems: "#f59e0b",      // amber
  advanced_composites: "#ef4444",   // red
  "3d_printing": "#3b82f6",        // blue
  sip_panels: "#10b981",           // emerald
  steel_frame: "#6366f1",          // indigo
  default: "#14b8a6",              // teal fallback
};

interface PlanComparison3DProps {
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
  className?: string;
}

export function PlanComparison3D({
  layout,
  suggestions,
  className = "",
}: PlanComparison3DProps) {
  const [viewMode, setViewMode] = useState<"split" | "original" | "optimised">("split");

  // Build suggestion overlays
  const overlays: SuggestionOverlay[] = suggestions
    .filter((s) => s.affected_wall_ids && s.affected_wall_ids.length > 0)
    .map((s) => ({
      id: s.id,
      affected_wall_ids: s.affected_wall_ids || [],
      affected_room_ids: s.affected_room_ids || [],
      colour: CATEGORY_COLOURS[s.technology_category] || CATEGORY_COLOURS.default,
      label: s.suggested_alternative,
      description: s.suggested_alternative,
      technology_category: s.technology_category,
      estimated_cost_savings: s.estimated_cost_savings,
      estimated_time_savings: s.estimated_time_savings,
    }));

  return (
    <div className={className}>
      {/* View mode toggle */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-600">View:</span>
        {(["split", "original", "optimised"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`rounded-md px-3 py-2 text-sm capitalize min-h-[44px] md:min-h-0 md:py-1 ${
              viewMode === mode
                ? "bg-brand-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {mode}
          </button>
        ))}
        {overlays.length > 0 && (
          <span className="ml-auto text-xs text-zinc-500">
            {overlays.length} suggestion{overlays.length !== 1 ? "s" : ""} mapped to plan
          </span>
        )}
      </div>

      {/* Viewer(s) */}
      {viewMode === "split" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PlanViewer3D
            layout={layout}
            label="Original Plan"
            className="min-h-[300px] sm:min-h-[400px]"
          />
          <PlanViewer3D
            layout={layout}
            suggestions={overlays}
            label="With MMC Suggestions"
            className="min-h-[300px] sm:min-h-[400px]"
          />
        </div>
      ) : viewMode === "original" ? (
        <PlanViewer3D
          layout={layout}
          label="Original Plan"
          className="min-h-[400px] md:min-h-[500px]"
        />
      ) : (
        <PlanViewer3D
          layout={layout}
          suggestions={overlays}
          label="With MMC Suggestions"
          className="min-h-[400px] md:min-h-[500px]"
        />
      )}

      {/* Legend */}
      {overlays.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 rounded-lg border bg-white p-3">
          <span className="text-xs font-medium text-zinc-500 self-center">Legend:</span>
          {overlays.map((o) => (
            <div key={o.id} className="flex items-center gap-1.5">
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: o.colour, opacity: 0.7 }}
              />
              <span className="text-xs text-zinc-700">{o.label}</span>
              {o.estimated_cost_savings && (
                <span className="text-xs text-brandgreen-600">
                  -${(o.estimated_cost_savings / 1000).toFixed(0)}k
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
