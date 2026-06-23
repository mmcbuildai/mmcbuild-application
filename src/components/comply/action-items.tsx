"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, X, Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  non_compliant: 1,
  advisory: 2,
  compliant: 3,
};

function prettyLabel(c: string): string {
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SeverityBadge } from "./severity-badge";
import { RemediationBadge } from "./remediation-badge";
import { FindingAmendDialog } from "./finding-amend-dialog";
import { ShareFindingDialog } from "./share-finding-dialog";
import { reviewFinding } from "@/app/(dashboard)/comply/actions";

interface Finding {
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
}

interface Contributor {
  id: string;
  discipline: string;
  contact_name: string;
  company_name: string | null;
  contact_email: string | null;
}

interface ActionItemsProps {
  findings: Finding[];
  contributors: Contributor[];
  projectId?: string;
}

type ActionState = {
  [findingId: string]: "dismissed" | "amended" | "sent";
};

export function ActionItems({
  findings,
  contributors,
  projectId,
}: ActionItemsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionStates, setActionStates] = useState<ActionState>({});
  const [amendDialogFinding, setAmendDialogFinding] = useState<Finding | null>(
    null
  );
  const [shareDialogFindingId, setShareDialogFindingId] = useState<
    string | null
  >(null);
  const [shareDialogDiscipline, setShareDialogDiscipline] = useState<
    string | null
  >(null);

  // Filters (mirror the Open-Items board) so a large action list is navigable.
  const [severity, setSeverity] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");

  const flagged = findings.filter(
    (f) => f.severity === "non_compliant" || f.severity === "critical"
  );

  const categories = useMemo(
    () => Array.from(new Set(flagged.map((f) => f.category))).sort(),
    [flagged]
  );

  // Derive actioned state from both local optimistic state and server state
  function getItemState(
    f: Finding
  ): "dismissed" | "amended" | "sent" | "pending" {
    if (actionStates[f.id]) return actionStates[f.id];
    if (f.review_status === "rejected") return "dismissed";
    if (f.review_status === "amended") return "amended";
    if (f.review_status === "sent") return "sent";
    return "pending";
  }

  const actionedCount = flagged.filter(
    (f) => getItemState(f) !== "pending"
  ).length;
  const allDone = actionedCount === flagged.length;

  // Apply filters + sort most-critical-first. Not memoised because the state
  // filter reads getItemState (which depends on optimistic actionStates).
  const filtered = flagged
    .filter((f) => {
      if (severity !== "all" && f.severity !== severity) return false;
      if (category !== "all" && f.category !== category) return false;
      if (stateFilter !== "all" && getItemState(f) !== stateFilter) return false;
      return true;
    })
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    );

  const filtersActive =
    severity !== "all" || category !== "all" || stateFilter !== "all";

  function handleDismiss(findingId: string) {
    setPendingId(findingId);
    startTransition(async () => {
      const result = await reviewFinding(findingId, "rejected", {
        rejection_reason: "Dismissed from action items",
      });
      if ("success" in result) {
        setActionStates((prev) => ({ ...prev, [findingId]: "dismissed" }));
        router.refresh();
      }
      setPendingId(null);
    });
  }

  function handleSendRemediation(finding: Finding) {
    // If the finding already has an assigned contributor with email, use quick share
    if (finding.assigned_contributor_id) {
      const contributor = contributors.find(
        (c) => c.id === finding.assigned_contributor_id
      );
      if (contributor?.contact_email) {
        setPendingId(finding.id);
        startTransition(async () => {
          const { shareFindingWithContributor } = await import(
            "@/app/(dashboard)/comply/actions"
          );
          const result = await shareFindingWithContributor(
            finding.id,
            contributor.id
          );
          if ("success" in result) {
            setActionStates((prev) => ({ ...prev, [finding.id]: "sent" }));
            router.refresh();
          }
          setPendingId(null);
        });
        return;
      }
    }
    // Otherwise open the share dialog
    setShareDialogFindingId(finding.id);
    setShareDialogDiscipline(finding.responsible_discipline);
  }

  const STATE_LABELS = {
    dismissed: "Dismissed",
    amended: "Amended",
    sent: "Sent for Remediation",
  } as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            {flagged.length} Action Item{flagged.length !== 1 ? "s" : ""}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Non-compliant and critical findings requiring attention.{" "}
            {actionedCount > 0 && (
              <span className="font-medium">
                {actionedCount} of {flagged.length} actioned.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Team callout */}
      {contributors.length === 0 && projectId && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No team members configured</AlertTitle>
          <AlertDescription>
            Add your project team (engineers, architects) to enable sending
            findings for remediation.{" "}
            <Link
              href={`/projects/${projectId}?tab=team`}
              className="font-medium underline underline-offset-4 hover:text-primary"
            >
              Go to Team settings
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* All done state */}
      {allDone && flagged.length > 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="flex items-center gap-3 py-6">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-semibold text-green-800">
                All action items addressed
              </p>
              <p className="text-sm text-green-700">
                You&apos;ve actioned all {flagged.length} flagged findings.
                Review the full results in the{" "}
                <span className="font-medium">Workflow</span> tab.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters (severity / issue type / action state). */}
      {flagged.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Severity
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="non_compliant">Non-compliant</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Issue type
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {prettyLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Action state
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent for remediation</option>
              <option value="amended">Amended</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setSeverity("all");
                setCategory("all");
                setStateFilter("all");
              }}
              className="h-9 self-end rounded-md px-2 text-sm text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {flagged.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Showing {filtered.length} of {flagged.length} item
          {flagged.length === 1 ? "" : "s"}.
        </p>
      )}

      {flagged.length > 0 && filtered.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No action items match these filters.
          </CardContent>
        </Card>
      )}

      {/* Finding cards */}
      <div className="space-y-3">
        {filtered.map((finding) => {
          const state = getItemState(finding);
          const isActioned = state !== "pending";
          const isThisPending = pendingId === finding.id && isPending;

          return (
            <Card
              key={finding.id}
              className={isActioned ? "opacity-60" : undefined}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SeverityBadge severity={finding.severity} />
                    <span className="text-xs text-muted-foreground font-mono">
                      {finding.ncc_section}
                    </span>
                    {finding.remediation_status && (
                      <RemediationBadge status={finding.remediation_status} />
                    )}
                    {isActioned && (
                      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {STATE_LABELS[state]}
                      </span>
                    )}
                  </div>
                </div>
                <CardTitle className="text-sm font-medium mt-1">
                  {finding.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardDescription className="text-sm">
                  {finding.amended_description ?? finding.description}
                </CardDescription>

                {(finding.amended_action ?? finding.remediation_action) && (
                  <div className="text-sm bg-muted/50 rounded-md p-3">
                    <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                      Remediation
                    </span>
                    <p className="mt-1">
                      {finding.amended_action ?? finding.remediation_action}
                    </p>
                  </div>
                )}

                {/* Action buttons — only show when not yet actioned */}
                {!isActioned && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={isThisPending}
                      onClick={() => handleDismiss(finding.id)}
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      {isThisPending && pendingId === finding.id
                        ? "Dismissing..."
                        : "Dismiss"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAmendDialogFinding(finding)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Amend
                    </Button>
                    <Button
                      size="sm"
                      disabled={isThisPending || (contributors.length === 0 && !projectId)}
                      onClick={() => handleSendRemediation(finding)}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" />
                      {isThisPending ? "Sending..." : "Send for Remediation"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Amend dialog */}
      {amendDialogFinding && (
        <FindingAmendDialog
          open={!!amendDialogFinding}
          onOpenChange={(open) => {
            if (!open) {
              setActionStates((prev) => ({
                ...prev,
                [amendDialogFinding.id]: "amended",
              }));
              setAmendDialogFinding(null);
              router.refresh();
            }
          }}
          finding={amendDialogFinding}
          contributors={contributors}
        />
      )}

      {/* Share dialog */}
      {shareDialogFindingId && projectId && (
        <ShareFindingDialog
          open={!!shareDialogFindingId}
          onOpenChange={(open) => {
            if (!open) {
              setActionStates((prev) => ({
                ...prev,
                [shareDialogFindingId]: "sent",
              }));
              setShareDialogFindingId(null);
              router.refresh();
            }
          }}
          findingId={shareDialogFindingId}
          projectId={projectId}
          discipline={shareDialogDiscipline}
          contributors={contributors}
        />
      )}
    </div>
  );
}
