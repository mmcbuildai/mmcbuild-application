import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getComplianceReport, getProjectChecks } from "../../actions";
import { getProjectPlans } from "@/app/(dashboard)/projects/actions";
import {
  RecheckButton,
  type RecheckPlanOption,
} from "@/components/comply/recheck-button";
import {
  OpenItemsBoard,
  type OpenItemFinding,
} from "@/components/comply/open-items-board";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  computeFindingLifecycle,
  allFindingsConverged,
  unresolvedCount,
} from "@/lib/comply/finding-lifecycle";

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

  const allFindings = (report.findings ?? []) as unknown as Omit<
    OpenItemFinding,
    "lifecycle"
  >[];

  // Actionable = non-compliant or critical (mirrors workflow-tabs `hasFlagged`).
  // Attach the computed lifecycle so the client board can filter/group by it.
  const actionable: OpenItemFinding[] = allFindings
    .filter((f) => f.severity === "non_compliant" || f.severity === "critical")
    .map((f) => ({ ...f, lifecycle: computeFindingLifecycle(f) }));

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

          {/* Filterable, sortable board (severity / issue type / status). */}
          <OpenItemsBoard findings={actionable} />
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
