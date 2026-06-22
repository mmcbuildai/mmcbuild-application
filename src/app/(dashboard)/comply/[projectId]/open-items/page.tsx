import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getComplianceReport, getProjectChecks } from "../../actions";
import { getProjectPlans } from "@/app/(dashboard)/projects/actions";
import { SeverityBadge } from "@/components/comply/severity-badge";
import { RemediationBadge } from "@/components/comply/remediation-badge";
import { OpenItemActions } from "@/components/comply/open-item-actions";
import {
  RecheckButton,
  type RecheckPlanOption,
} from "@/components/comply/recheck-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Download, AlertCircle } from "lucide-react";
import {
  computeFindingLifecycle,
  allFindingsConverged,
  unresolvedCount,
  type FindingLifecycle,
} from "@/lib/comply/finding-lifecycle";
import type { RemediationResponse } from "@/components/comply/finding-review-card";

interface OpenItemFinding {
  id: string;
  ncc_section: string;
  category: string;
  title: string;
  description: string;
  severity: "compliant" | "advisory" | "non_compliant" | "critical";
  remediation_status: string | null;
  resolution_type: string | null;
  resolution_note: string | null;
  waiver_reason: string | null;
  resolved_at: string | null;
  responses?: RemediationResponse[];
  lifecycle?: FindingLifecycle;
}

const LIFECYCLE_GROUPS: { key: FindingLifecycle; label: string; hint: string }[] = [
  { key: "open", label: "Open", hint: "No contributor reply yet — awaiting remediation" },
  { key: "responded", label: "Responded", hint: "Contributor replied — review and accept or waive" },
  { key: "resolved", label: "Resolved", hint: "Accepted via updated drawings or evidence" },
  { key: "waived", label: "Waived", hint: "Accepted as-is with a recorded reason" },
];

export default async function OpenItemsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  // Auth gate — middleware also guards, but verify at the data layer too.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Org guard: confirm the project belongs to the user's active org (RLS-backed).
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, address")
    .eq("id", projectId)
    .single();
  if (!project) redirect("/comply");

  // Latest completed compliance check for this project.
  const checks = (await getProjectChecks(projectId)) as {
    id: string;
    status: string;
    created_at: string;
  }[];
  const latest = checks.find((c) => c.status === "completed") ?? checks[0];

  if (!latest) {
    return (
      <OpenItemsShell projectId={projectId} projectName={project.name}>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No compliance check has been run for this project yet. Run a check
            from the project page to surface any non-compliant items here.
            <div className="mt-4">
              <Button asChild className="min-h-11">
                <Link href={`/comply/${projectId}`}>Go to project</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </OpenItemsShell>
    );
  }

  const report = await getComplianceReport(latest.id);
  if (report.error || !report.check) {
    redirect(`/comply/${projectId}`);
  }

  const allFindings = (report.findings ?? []) as unknown as OpenItemFinding[];

  // Actionable = non-compliant or critical (mirrors workflow-tabs `hasFlagged`).
  const actionable = allFindings.filter(
    (f) => f.severity === "non_compliant" || f.severity === "critical"
  );

  // Group by lifecycle.
  const byLifecycle = new Map<FindingLifecycle, OpenItemFinding[]>();
  for (const f of actionable) {
    const l = f.lifecycle ?? computeFindingLifecycle(f);
    const list = byLifecycle.get(l) ?? [];
    list.push(f);
    byLifecycle.set(l, list);
  }

  const ready = allFindingsConverged(actionable);
  const remaining = unresolvedCount(actionable);

  // Phase-3 re-check: the latest check is the parent of the next re-check.
  const latestCheck = report.check as unknown as {
    id: string;
    plan_id: string;
  };

  // Offer the builder the current plan plus any other ready plans they may have
  // uploaded as updated drawings (the real plan-upload flow lives on the project
  // page; this surfaces those uploads as a re-check option).
  const plans = (await getProjectPlans(projectId)) as Array<{
    id: string;
    file_name: string;
    status: string;
    created_at: string;
  }>;
  const planOptions: RecheckPlanOption[] = plans
    .filter((p) => p.status === "ready" || p.id === latestCheck.plan_id)
    .map((p) => ({
      id: p.id,
      file_name: p.file_name,
      created_at: p.created_at,
      isCurrent: p.id === latestCheck.plan_id,
    }));
  // Guarantee the current plan is present even if it is no longer "ready".
  if (!planOptions.some((p) => p.isCurrent)) {
    planOptions.unshift({
      id: latestCheck.plan_id,
      file_name: "Current drawings",
      created_at: latest.created_at,
      isCurrent: true,
    });
  }

  return (
    <OpenItemsShell projectId={projectId} projectName={project.name}>
      {actionable.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            This check has no non-compliant items to resolve. Nothing is waiting
            on you here.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Readiness banner — display only (the versioned re-check is Phase 3). */}
          {ready ? (
            <div className="rounded-lg border border-green-300 bg-green-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
                  <div>
                    <p className="text-base font-semibold text-green-900">
                      All items resolved — ready to re-check
                    </p>
                    <p className="text-sm text-green-800">
                      Every non-compliant item is resolved or waived. Run a
                      linked re-check to confirm the updated plan passes — you
                      will see what cleared, what is still open, and anything new.
                    </p>
                  </div>
                </div>
                <RecheckButton
                  parentCheckId={latestCheck.id}
                  projectId={projectId}
                  planOptions={planOptions}
                  variant="default"
                  label="Re-check compliance"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <p className="text-base font-semibold text-amber-900">
                      {remaining} item{remaining === 1 ? "" : "s"} still need
                      {remaining === 1 ? "s" : ""} a decision
                    </p>
                    <p className="text-sm text-amber-800">
                      Mark each item resolved (updated drawings or evidence) or
                      waive it with a reason. You can still run a re-check now —
                      it links to this report and shows the v1 → v2 delta.
                    </p>
                  </div>
                </div>
                <RecheckButton
                  parentCheckId={latestCheck.id}
                  projectId={projectId}
                  planOptions={planOptions}
                  variant="outline"
                  label="Re-check anyway"
                />
              </div>
            </div>
          )}

          {/* Grouped findings */}
          {LIFECYCLE_GROUPS.map((group) => {
            const items = byLifecycle.get(group.key) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={group.key} className="space-y-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {group.label}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({items.length})
                    </span>
                  </h2>
                  <p className="text-sm text-muted-foreground">{group.hint}</p>
                </div>
                <div className="space-y-3">
                  {items.map((finding) => (
                    <OpenItemCard
                      key={finding.id}
                      finding={finding}
                      lifecycle={group.key}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </OpenItemsShell>
  );
}

function OpenItemsShell({
  projectId,
  projectName,
  children,
}: {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href={`/comply/${projectId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Comply
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Open Items — {projectName}</h1>
        {/* Explanatory header (PRODUCT_STANDARDS §5). */}
        <p className="mt-1 text-base text-muted-foreground">
          This is the waiting board for every non-compliant finding from the
          latest compliance check. For each item, mark it resolved once updated
          drawings or evidence address it, or waive it with a recorded reason.
          When every item is resolved or waived, you can run a fresh check to
          confirm the plan now passes.
        </p>
      </div>
      {children}
    </div>
  );
}

function OpenItemCard({
  finding,
  lifecycle,
}: {
  finding: OpenItemFinding;
  lifecycle: FindingLifecycle;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {finding.ncc_section}
          </span>
          <SeverityBadge severity={finding.severity} />
          {finding.remediation_status && (
            <RemediationBadge status={finding.remediation_status} />
          )}
        </div>

        <div>
          <p className="text-base font-medium">{finding.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {finding.description}
          </p>
        </div>

        {/* Phase-1 contributor responses (notes + uploaded file). */}
        {finding.responses && finding.responses.length > 0 && (
          <div className="space-y-3">
            {finding.responses.map((response) => (
              <div
                key={response.id}
                className="rounded-md border border-purple-200 bg-purple-50 p-3"
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="break-all text-xs font-medium text-purple-800">
                    Response from {response.email_to}
                  </p>
                  <RemediationBadge status={response.remediation_status} />
                </div>
                {response.responded_at && (
                  <p className="text-xs text-purple-600">
                    Responded{" "}
                    {new Date(response.responded_at).toLocaleString("en-AU")}
                  </p>
                )}
                {response.response_notes && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-purple-900">
                    {response.response_notes}
                  </p>
                )}
                {response.response_file_path && (
                  <a
                    href={`/api/remediation/download/${response.id}`}
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-purple-300 bg-white px-3 py-2 text-sm font-medium text-purple-800 hover:bg-purple-100"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {response.response_file_name ?? "Download attachment"}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Recorded builder verdict (for resolved/waived). */}
        {lifecycle === "resolved" && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
            <p className="font-medium text-green-900">
              Resolved via{" "}
              {finding.resolution_type === "evidence"
                ? "evidence / certificate"
                : "updated drawings"}
            </p>
            {finding.resolution_note && (
              <p className="mt-1 whitespace-pre-wrap text-green-800">
                {finding.resolution_note}
              </p>
            )}
          </div>
        )}
        {lifecycle === "waived" && (
          <div className="rounded-md border border-gray-300 bg-gray-50 p-3 text-sm">
            <p className="font-medium text-gray-900">Waived</p>
            {finding.waiver_reason && (
              <p className="mt-1 whitespace-pre-wrap text-gray-700">
                {finding.waiver_reason}
              </p>
            )}
          </div>
        )}

        <OpenItemActions findingId={finding.id} lifecycle={lifecycle} />
      </CardContent>
    </Card>
  );
}
