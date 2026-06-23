"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FindingReviewCard, type RemediationResponse } from "./finding-review-card";
import { DisciplineBadge } from "./project-contributors";
import { DISCIPLINE_LABELS } from "@/lib/ai/types";
import { Send } from "lucide-react";
import { bulkShareFindings } from "@/app/(dashboard)/comply/actions";
import { useRouter } from "next/navigation";

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  non_compliant: 1,
  advisory: 2,
  compliant: 3,
};

function prettyLabel(c: string): string {
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function disciplineOf(f: { amended_discipline: string | null; responsible_discipline: string | null }): string {
  return f.amended_discipline ?? f.responsible_discipline ?? "other";
}

interface ReviewFinding {
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
}

interface Contributor {
  id: string;
  discipline: string;
  contact_name: string;
  company_name: string | null;
  contact_email: string | null;
}

interface WorkflowReportProps {
  findings: ReviewFinding[];
  contributors: Contributor[];
  projectId?: string;
}

export function WorkflowReport({
  findings,
  contributors,
  projectId,
}: WorkflowReportProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filters (mirror the Open-Items board).
  const [severity, setSeverity] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [discipline, setDiscipline] = useState<string>("all");
  const [reviewStatus, setReviewStatus] = useState<string>("all");

  const categories = useMemo(
    () => Array.from(new Set(findings.map((f) => f.category))).sort(),
    [findings]
  );
  const disciplines = useMemo(
    () => Array.from(new Set(findings.map(disciplineOf))).sort(),
    [findings]
  );

  const filtered = useMemo(() => {
    return findings.filter((f) => {
      if (severity !== "all" && f.severity !== severity) return false;
      if (category !== "all" && f.category !== category) return false;
      if (discipline !== "all" && disciplineOf(f) !== discipline) return false;
      if (reviewStatus !== "all" && (f.review_status ?? "pending") !== reviewStatus)
        return false;
      return true;
    });
  }, [findings, severity, category, discipline, reviewStatus]);

  const filtersActive =
    severity !== "all" ||
    category !== "all" ||
    discipline !== "all" ||
    reviewStatus !== "all";

  // Group the FILTERED findings by effective discipline.
  const grouped = new Map<string, ReviewFinding[]>();
  for (const f of filtered) {
    const disc = disciplineOf(f);
    const existing = grouped.get(disc) ?? [];
    existing.push(f);
    grouped.set(disc, existing);
  }

  // Sort disciplines by number of findings (descending); within a discipline,
  // most critical first so the worst items lead.
  for (const list of grouped.values()) {
    list.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    );
  }
  const sortedDisciplines = [...grouped.entries()].sort(
    (a, b) => b[1].length - a[1].length
  );

  // Stats
  const total = findings.length;
  const reviewed = findings.filter(
    (f) =>
      f.review_status === "accepted" ||
      f.review_status === "amended" ||
      f.review_status === "rejected" ||
      f.review_status === "sent"
  ).length;
  const shareable = findings.filter(
    (f) =>
      f.review_status === "accepted" || f.review_status === "amended"
  );

  // Remediation stats
  const remediationAwait = findings.filter((f) => f.remediation_status === "awaiting").length;
  const remediationProgress = findings.filter((f) => f.remediation_status === "in_progress").length;
  const remediationDone = findings.filter((f) => f.remediation_status === "completed").length;
  const remediationDisputed = findings.filter((f) => f.remediation_status === "disputed").length;

  function handleBulkShare() {
    if (shareable.length === 0) return;
    startTransition(async () => {
      await bulkShareFindings(shareable.map((f) => f.id));
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Progress summary */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {reviewed} of {total} findings reviewed
              </p>
              <div className="h-2 w-64 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: total > 0 ? `${(reviewed / total) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <StatusCount
                label="Pending"
                count={
                  findings.filter((f) => f.review_status === "pending").length
                }
                color="bg-yellow-100 text-yellow-800"
              />
              <StatusCount
                label="Accepted"
                count={
                  findings.filter((f) => f.review_status === "accepted").length
                }
                color="bg-green-100 text-green-800"
              />
              <StatusCount
                label="Amended"
                count={
                  findings.filter((f) => f.review_status === "amended").length
                }
                color="bg-blue-100 text-blue-800"
              />
              <StatusCount
                label="Rejected"
                count={
                  findings.filter((f) => f.review_status === "rejected").length
                }
                color="bg-gray-100 text-gray-800"
              />
              <StatusCount
                label="Sent"
                count={
                  findings.filter((f) => f.review_status === "sent").length
                }
                color="bg-purple-100 text-purple-800"
              />
            </div>
          </div>

          {/* Remediation status summary */}
          {(remediationAwait > 0 || remediationProgress > 0 || remediationDone > 0 || remediationDisputed > 0) && (
            <div className="mt-3 pt-3 border-t flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground">Remediation:</span>
              <StatusCount label="Awaiting" count={remediationAwait} color="bg-yellow-100 text-yellow-800" />
              <StatusCount label="In Progress" count={remediationProgress} color="bg-orange-100 text-orange-800" />
              <StatusCount label="Completed" count={remediationDone} color="bg-green-100 text-green-800" />
              <StatusCount label="Disputed" count={remediationDisputed} color="bg-red-100 text-red-800" />
            </div>
          )}

          {shareable.length > 0 && (
            <div className="mt-3 pt-3 border-t flex justify-end">
              <Button
                size="sm"
                onClick={handleBulkShare}
                disabled={isPending}
              >
                <Send className="mr-2 h-3.5 w-3.5" />
                Share All Accepted ({shareable.length})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters (severity / issue type / discipline / review status). */}
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
            <option value="advisory">Advisory</option>
            <option value="compliant">Compliant</option>
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
          Discipline
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
          >
            <option value="all">All</option>
            {disciplines.map((d) => (
              <option key={d} value={d}>
                {DISCIPLINE_LABELS[d as keyof typeof DISCIPLINE_LABELS] ??
                  prettyLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Review status
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={reviewStatus}
            onChange={(e) => setReviewStatus(e.target.value)}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="amended">Amended</option>
            <option value="rejected">Rejected</option>
            <option value="sent">Sent</option>
          </select>
        </label>
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setSeverity("all");
              setCategory("all");
              setDiscipline("all");
              setReviewStatus("all");
            }}
            className="h-9 self-end rounded-md px-2 text-sm text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filtered.length} of {findings.length} finding
        {findings.length === 1 ? "" : "s"}.
      </p>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No findings match these filters.
          </CardContent>
        </Card>
      )}

      {/* Findings grouped by discipline */}
      {sortedDisciplines.map(([disc, discFindings]) => (
        <div key={disc} className="space-y-3">
          <div className="flex items-center gap-2">
            <DisciplineBadge discipline={disc} />
            <span className="text-sm text-muted-foreground">
              ({discFindings.length} item{discFindings.length !== 1 ? "s" : ""})
            </span>
          </div>
          <div className="space-y-3">
            {discFindings.map((finding) => (
              <FindingReviewCard
                key={finding.id}
                finding={finding}
                contributors={contributors.filter(
                  (c) => c.discipline === disc || c.discipline === "other"
                )}
                projectId={projectId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusCount({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  if (count === 0) return null;
  return (
    <Badge variant="secondary" className={`text-xs ${color}`}>
      {label}: {count}
    </Badge>
  );
}
