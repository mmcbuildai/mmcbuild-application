import { redirect } from "next/navigation";
import Link from "next/link";
import { getCostReport, getHoldingCostVariables } from "@/app/(dashboard)/quote/actions";
import { CostReport } from "@/components/quote/cost-report";
import { EstimationProgress } from "@/components/quote/estimation-progress";

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

  const holdingCostVariables = estimate.status === "completed"
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

      {estimate.status === "completed" ? (
        <CostReport
          estimate={estimate}
          lineItems={lineItems}
          holdingCostVariables={holdingCostVariables}
        />
      ) : (
        <EstimationProgress
          estimateId={reportId}
          initialStatus={estimate.status}
        />
      )}
    </div>
  );
}
