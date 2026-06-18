import { redirect } from "next/navigation";
import Link from "next/link";
import { getCostReport, getHoldingCostVariables } from "@/app/(dashboard)/quote/actions";
import { CostReport } from "@/components/quote/cost-report";
import { EstimationProgress } from "@/components/quote/estimation-progress";
import { RunEstimateButton } from "@/components/quote/run-estimate-button";
import { ReportNextSteps } from "@/components/shared/report-next-steps";

export default async function CostReportPage({
  params,
}: {
  params: Promise<{ projectId: string; reportId: string }>;
}) {
  const { projectId, reportId } = await params;

  const result = await getCostReport(reportId);

  if (result.error || !result.estimate) {
    redirect(`/quote/${projectId}`);
  }

  const estimate = result.estimate as unknown as {
    id: string;
    project_id: string;
    plan_id: string | null;
    status: string;
    summary: string | null;
    total_traditional: number | null;
    total_mmc: number | null;
    total_savings_pct: number | null;
    region: string | null;
    completed_at: string | null;
    traditional_duration_weeks: number | null;
    mmc_duration_weeks: number | null;
  };

  const lineItems = (result.lineItems ?? []) as unknown as {
    id: string;
    cost_category: string;
    element_description: string;
    quantity: number | null;
    unit: string | null;
    traditional_rate: number | null;
    traditional_total: number | null;
    mmc_rate: number | null;
    mmc_total: number | null;
    mmc_alternative: string | null;
    savings_pct: number | null;
    source: string;
    confidence: number;
    sort_order: number;
    rate_source_name: string | null;
    rate_source_detail: string | null;
  }[];

  // Treat a run that produced line items as complete even if the status field
  // never flipped to "completed" — the job stores line items BEFORE the final
  // status update (summary/duration steps run in between), so a late-step
  // failure left finished estimates showing as processing/error ("completed in
  // the log, incomplete in the UI"). Line items present = a real result to show.
  const isComplete = estimate.status === "completed" || lineItems.length > 0;

  const holdingCostVariables = isComplete
    ? await getHoldingCostVariables(reportId)
    : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href={`/quote/${projectId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Project
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Cost Estimation Report</h1>
      </div>

      {isComplete ? (
        <>
          <CostReport
            estimate={estimate}
            lineItems={lineItems}
            holdingCostVariables={holdingCostVariables}
          />
          <ReportNextSteps
            projectId={projectId}
            steps={[
              {
                title: "Optimise the design",
                description:
                  "Run MMC Build for design suggestions and the 3D model.",
                href: `/build/${projectId}`,
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
        <div className="space-y-4">
          <EstimationProgress
            estimateId={reportId}
            initialStatus={estimate.status}
            initialSummary={estimate.summary}
          />
          {/* A failed run is a dead end without this — let the user re-run
              explicitly (a fresh estimate) rather than staring at a spinner. */}
          {estimate.status === "error" && estimate.plan_id && (
            <div className="rounded-lg border border-dashed p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                This estimate didn&apos;t finish. You can run it again.
              </p>
              <RunEstimateButton
                projectId={projectId}
                planId={estimate.plan_id}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
