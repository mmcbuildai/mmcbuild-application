import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getComplianceReport,
  getActionableFindingsForCheck,
} from "../../../actions";
import { getProjectContributors } from "@/app/(dashboard)/projects/actions";
import { ComplianceReport } from "@/components/comply/compliance-report";
import { CheckProgress } from "@/components/comply/check-progress";
import { WorkflowTabs } from "@/components/comply/workflow-tabs";
import { CheckDeltaPanel } from "@/components/comply/check-delta-panel";
import { computeCheckDelta } from "@/lib/comply/check-delta";
import type { RemediationResponse } from "@/components/comply/finding-review-card";

export default async function CheckPage({
  params,
}: {
  params: Promise<{ projectId: string; checkId: string }>;
}) {
  const { projectId, checkId } = await params;

  const result = await getComplianceReport(checkId);

  if (result.error || !result.check) {
    redirect(`/comply/${projectId}`);
  }

  const check = result.check as unknown as {
    id: string;
    project_id: string;
    status: string;
    summary: string | null;
    overall_risk: "low" | "medium" | "high" | "critical" | null;
    completed_at: string | null;
    progress_current: string | null;
    progress_completed: string[] | null;
    parent_check_id: string | null;
    version: number | null;
  };

  const findings = (result.findings ?? []) as unknown as {
    id: string;
    ncc_section: string;
    category: string;
    title: string;
    description: string;
    recommendation: string | null;
    severity: "compliant" | "advisory" | "non_compliant" | "critical";
    confidence: number;
    ncc_citation: string | null;
    page_references: number[] | null;
    sort_order: number;
    responsible_discipline: string | null;
    assigned_contributor_id: string | null;
    remediation_action: string | null;
    review_status: string | null;
    rejection_reason: string | null;
    amended_description: string | null;
    amended_action: string | null;
    amended_discipline: string | null;
    sent_at: string | null;
    remediation_status: string | null;
    remediation_responded_at: string | null;
    responses?: RemediationResponse[];
  }[];

  // Detect workflow findings (review_status IS NOT NULL) vs legacy
  const hasWorkflow = findings.some((f) => f.review_status != null);

  // Actionable items drive the Phase-2 open-items board CTA.
  const hasActionable = findings.some(
    (f) => f.severity === "non_compliant" || f.severity === "critical"
  );

  // Load contributors if workflow findings exist
  const contributors = hasWorkflow
    ? await getProjectContributors(projectId)
    : [];

  // Phase 3: if this check is a re-check (chained to a parent), compute the
  // v1 -> v2 delta over the ACTIONABLE findings of both checks.
  let delta:
    | ReturnType<
        typeof computeCheckDelta<{
          id: string;
          ncc_section: string;
          category: string;
          title: string;
        }>
      >
    | null = null;
  if (check.status === "completed" && check.parent_check_id) {
    const [parentActionable, childActionable] = await Promise.all([
      getActionableFindingsForCheck(check.parent_check_id),
      getActionableFindingsForCheck(check.id),
    ]);
    delta = computeCheckDelta(
      parentActionable.map((f) => ({
        id: f.id,
        ncc_section: f.ncc_section,
        category: f.category,
        title: f.title,
      })),
      childActionable.map((f) => ({
        id: f.id,
        ncc_section: f.ncc_section,
        category: f.category,
        title: f.title,
      }))
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={`/comply/${projectId}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            &larr; Back to Comply
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Compliance Report</h1>
        </div>
        {check.status === "completed" && hasActionable && (
          <Link
            href={`/comply/${projectId}/open-items`}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Open items board
          </Link>
        )}
      </div>

      {check.status === "completed" && delta && (
        <CheckDeltaPanel version={check.version ?? 2} delta={delta} />
      )}

      {check.status === "completed" ? (
        hasWorkflow ? (
          <WorkflowTabs
            check={check}
            findings={findings}
            contributors={contributors}
            projectId={projectId}
          />
        ) : (
          <ComplianceReport check={check} findings={findings} />
        )
      ) : (
        <CheckProgress
          checkId={checkId}
          initialStatus={check.status}
          initialProgressCurrent={check.progress_current}
          initialProgressCompleted={check.progress_completed ?? []}
          initialSummary={check.summary}
        />
      )}
    </div>
  );
}
