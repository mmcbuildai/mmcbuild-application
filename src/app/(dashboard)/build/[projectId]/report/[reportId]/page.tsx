import { redirect } from "next/navigation";
import Link from "next/link";
import { getDesignReport } from "@/app/(dashboard)/build/actions";
import { ReportDecisionsView } from "@/components/build/report-decisions-view";
import { OptimisationProgress } from "@/components/build/optimisation-progress";
import { ReportNextSteps } from "@/components/shared/report-next-steps";
import type { SpatialLayout } from "@/lib/build/spatial/types";
import { createClient } from "@/lib/supabase/server";
import {
  buildComplianceContext,
  checkSuggestionCompliance,
} from "@/lib/build/suggestion-compliance";
import type { PropertyProfile } from "@caistech/property-services-sdk";
import type { FeaturedProduct } from "@/lib/direct/featured-suppliers";

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
    plan_id: string | null;
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
    decision: "undecided" | "pursuing" | "considering" | "rejected" | null;
    decision_note: string | null;
    goal_alignment:
      | { goal: string; score: number; rationale: string }[]
      | null;
  }[];

  // Inline compliance check (SCRUM-174): deterministically flag suggestions that
  // would likely fail NCC for THIS site (bushfire/BAL, Type A/B, party wall),
  // using the authoritative property profile + the project questionnaire, so a
  // user is warned before pursuing a non-compliant MMC choice — not after a
  // separate Comply run. Advisory; links to the full Comply pass.
  const supabase = await createClient();
  const [{ data: projectRow }, { data: questionnaireRow }] = await Promise.all([
    supabase
      .from("projects")
      .select("property_profile")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("questionnaire_responses")
      .select("responses")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const complianceContext = buildComplianceContext(
    (questionnaireRow as { responses?: Record<string, unknown> } | null)
      ?.responses ?? null,
    ((projectRow as { property_profile?: PropertyProfile | null } | null)
      ?.property_profile ?? null) as PropertyProfile | null,
  );
  const suggestionsWithCompliance = suggestions.map((s) => ({
    ...s,
    complianceFlag: checkSuggestionCompliance({
      technologyCategory: s.technology_category,
      context: complianceContext,
    }),
  }));

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
          {/* Text-based optimisation report. The post-optimisation 3D explorer
              that used to sit here was removed — it duplicated the 3D the user
              already runs on the Build page ("See your design built in the 4
              MMC systems") before optimisation. */}
          <ReportDecisionsView
            check={check}
            suggestions={suggestionsWithCompliance}
            complyHref={`/comply/${projectId}`}
            projectId={projectId}
            featuredByCategory={
              (result as { featuredByCategory?: Record<string, FeaturedProduct[]> })
                .featuredByCategory
            }
          />
          <ReportNextSteps
            projectId={projectId}
            steps={[
              {
                title: "Get a cost estimate",
                description:
                  "Run MMC Quote on this project — traditional vs MMC costs, itemised.",
                href: `/quote/${projectId}`,
              },
              {
                title: "Check compliance",
                description:
                  "Run MMC Comply for an NCC compliance pass on this plan.",
                href: `/comply/${projectId}`,
              },
              {
                title: "Find trades & suppliers",
                description:
                  "Browse MMC Direct for verified trades and consultants.",
                href: "/direct",
              },
            ]}
          />
        </>
      ) : (
        <OptimisationProgress
          checkId={reportId}
          initialStatus={check.status}
          initialSummary={check.summary}
        />
      )}
    </div>
  );
}
