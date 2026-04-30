import { redirect } from "next/navigation";
import Link from "next/link";
import { getDesignReport } from "@/app/(dashboard)/build/actions";
import { DesignReport } from "@/components/build/design-report";
import { OptimisationProgress } from "@/components/build/optimisation-progress";
import { Plan3DReveal } from "@/components/build/plan-3d-reveal";
import type { SpatialLayout } from "@/lib/build/spatial/types";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ projectId: string; reportId: string }>;
}) {
  const { projectId, reportId } = await params;

  const result = await getDesignReport(reportId);

  if (result.error || !result.check) {
    redirect(`/build/${projectId}`);
  }

  const check = result.check as unknown as {
    id: string;
    project_id: string;
    status: string;
    summary: string | null;
    spatial_layout: SpatialLayout | null;
    completed_at: string | null;
  };

  const suggestions = (result.suggestions ?? []) as unknown as {
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
    affected_wall_ids: string[] | null;
    affected_room_ids: string[] | null;
  }[];

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link
          href={`/build/${projectId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Project
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Design Optimisation Report</h1>
      </div>

      {check.status === "completed" ? (
        <>
          {/* Existing text-based report */}
          <DesignReport check={check} suggestions={suggestions} />

          {/* 3D Plan Comparison Viewer — gated behind a click so the WebGL
              canvas only mounts when the user asks for it. Mapping IDs come
              from the AI optimisation step (SCRUM-161). */}
          {check.spatial_layout && (
            <Plan3DReveal
              layout={check.spatial_layout}
              suggestions={suggestions.map((s) => ({
                id: s.id,
                technology_category: s.technology_category,
                suggested_alternative: s.suggested_alternative,
                estimated_cost_savings: s.estimated_cost_savings,
                estimated_time_savings: s.estimated_time_savings,
                affected_wall_ids: s.affected_wall_ids ?? [],
                affected_room_ids: s.affected_room_ids ?? [],
              }))}
            />
          )}
        </>
      ) : (
        <OptimisationProgress
          checkId={reportId}
          initialStatus={check.status}
        />
      )}
    </div>
  );
}
