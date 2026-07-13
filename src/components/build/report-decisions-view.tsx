"use client";

import { useState } from "react";
import { DesignReport } from "./design-report";
import { PlanComparison3D } from "./plan-comparison-3d";
import type { SpatialLayout } from "@/lib/build/spatial/types";
import type { SuggestionDecision } from "@/app/(dashboard)/build/actions";
import type { SuggestionComplianceFlag } from "@/lib/build/suggestion-compliance";
import type { FeaturedProduct } from "@/lib/direct/featured-suppliers";
import type { GoalAlignment } from "@/lib/ai/types";

// SCRUM-169: holds the live decision map for the report so the "With MMC
// Suggestions" 3D view reflects the user's curated set — rejected suggestions
// drop out of the render, "considering" ones are faded — and updates live as
// they toggle a decision on a card below.

interface Suggestion {
  id: string;
  technology_category: string;
  current_approach: string;
  suggested_alternative: string;
  benefits: string;
  estimated_time_savings: number | null;
  estimated_cost_savings: number | null;
  estimated_waste_reduction: number | null;
  implementation_complexity: string;
  confidence: number;
  sort_order: number;
  decision?: SuggestionDecision | null;
  decision_note?: string | null;
  affected_wall_ids?: string[] | null;
  affected_room_ids?: string[] | null;
  complianceFlag?: SuggestionComplianceFlag | null;
  goal_alignment?: GoalAlignment[] | null;
}

interface ReportDecisionsViewProps {
  check: {
    id: string;
    summary: string | null;
    completed_at: string | null;
    spatial_layout?: SpatialLayout | null;
  };
  suggestions: Suggestion[];
  complyHref?: string;
  projectId?: string;
  featuredByCategory?: Record<string, FeaturedProduct[]>;
}

export function ReportDecisionsView({
  check,
  suggestions,
  complyHref,
  projectId,
  featuredByCategory,
}: ReportDecisionsViewProps) {
  const [decisions, setDecisions] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      suggestions.map((s) => [s.id, s.decision ?? "undecided"]),
    ),
  );

  const layout = (check.spatial_layout ?? null) as SpatialLayout | null;
  const hasGeometry =
    !!layout &&
    Array.isArray(layout.walls) &&
    layout.walls.length > 0 &&
    suggestions.some((s) => (s.affected_wall_ids?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      {hasGeometry && layout && (
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Your curated MMC design</h3>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            The &ldquo;With MMC Suggestions&rdquo; view reflects your decisions
            below — <span className="font-medium">rejected</span> suggestions drop
            out of the render, and <span className="font-medium">considering</span>{" "}
            ones are shown faded. Toggle a decision on any card to update it live.
          </p>
          <PlanComparison3D
            layout={layout}
            decisions={decisions}
            suggestions={suggestions
              .filter((s) => (s.affected_wall_ids?.length ?? 0) > 0)
              .map((s) => ({
                id: s.id,
                technology_category: s.technology_category,
                suggested_alternative: s.suggested_alternative,
                estimated_cost_savings: s.estimated_cost_savings,
                estimated_time_savings: s.estimated_time_savings,
                affected_wall_ids: s.affected_wall_ids ?? undefined,
                affected_room_ids: s.affected_room_ids ?? undefined,
              }))}
          />
        </div>
      )}

      <DesignReport
        check={check}
        suggestions={suggestions}
        complyHref={complyHref}
        projectId={projectId}
        featuredByCategory={featuredByCategory}
        onDecisionChange={(id, d) =>
          setDecisions((prev) => ({ ...prev, [id]: d }))
        }
      />
    </div>
  );
}
