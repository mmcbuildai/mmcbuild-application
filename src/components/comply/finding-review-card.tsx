"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "./severity-badge";
import { DisciplineBadge } from "./project-contributors";
import { RemediationBadge } from "./remediation-badge";
import { FindingAmendDialog } from "./finding-amend-dialog";
import { FindingRejectDialog } from "./finding-reject-dialog";
import { ShareFindingDialog } from "./share-finding-dialog";
import {
  Check,
  X,
  Pencil,
  Send,
  ChevronDown,
  ChevronUp,
  UserPlus,
} from "lucide-react";
import {
  reviewFinding,
  shareFindingWithContributor,
} from "@/app/(dashboard)/comply/actions";
import { useRouter } from "next/navigation";

interface Contributor {
  id: string;
  discipline: string;
  contact_name: string;
  company_name: string | null;
  contact_email: string | null;
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
}

interface FindingReviewCardProps {
  finding: ReviewFinding;
  contributors: Contributor[];
  projectId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "border-l-yellow-400",
  accepted: "border-l-green-500",
  amended: "border-l-blue-500",
  rejected: "border-l-gray-400",
  sent: "border-l-purple-500",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  accepted: "Accepted",
  amended: "Amended",
  rejected: "Rejected",
  sent: "Sent",
};

export function FindingReviewCard({
  finding,
  contributors,
  projectId,
}: FindingReviewCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [amendOpen, setAmendOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const status = finding.review_status ?? "pending";
  const canReview = status === "pending";
  const canSend = status === "accepted" || status === "amended";
  const discipline =
    finding.amended_discipline ?? finding.responsible_discipline;
  const action =
    finding.amended_action ?? finding.remediation_action;
  const description =
    finding.amended_description ?? finding.description;

  const assignedContributor = contributors.find(
    (c) => c.id === finding.assigned_contributor_id
  );

  // Determine share button state
  const hasContributor = !!assignedContributor;
  const hasEmail = !!assignedContributor?.contact_email;

  function handleAccept() {
    startTransition(async () => {
      await reviewFinding(finding.id, "accepted");
      router.refresh();
    });
  }

  function handleShare() {
    if (hasContributor && hasEmail) {
      // 1-click share
      startTransition(async () => {
        await shareFindingWithContributor(finding.id, assignedContributor!.id);
        router.refresh();
      });
    } else {
      // Open dialog for assign & share
      setShareOpen(true);
    }
  }

  return (
    <>
      <Card className={`border-l-4 ${STATUS_COLORS[status] ?? ""}`}>
        <CardHeader
          className="cursor-pointer pb-2"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">
                  {finding.ncc_section}
                </span>
                <SeverityBadge severity={finding.severity} />
                {discipline && <DisciplineBadge discipline={discipline} />}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                  {STATUS_LABELS[status] ?? status}
                </span>
                {finding.remediation_status && (
                  <RemediationBadge status={finding.remediation_status} />
                )}
              </div>
              <CardTitle className="text-sm font-medium">
                {finding.title}
              </CardTitle>
            </div>
            <div className="shrink-0">
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="pt-0 space-y-3">
            <p className="text-sm text-muted-foreground">{description}</p>

            {action && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                <p className="text-xs font-medium text-blue-800 mb-1">
                  Remediation Action
                </p>
                <p className="text-sm text-blue-900">{action}</p>
              </div>
            )}

            {finding.recommendation && finding.recommendation !== action && (
              <div>
                <p className="text-xs font-medium mb-1">Recommendation</p>
                <p className="text-sm text-muted-foreground">
                  {finding.recommendation}
                </p>
              </div>
            )}

            {finding.ncc_citation && (
              <div>
                <p className="text-xs font-medium mb-1">NCC Citation</p>
                <p className="text-sm font-mono text-muted-foreground text-xs">
                  {finding.ncc_citation}
                </p>
              </div>
            )}

            {assignedContributor && (
              <div>
                <p className="text-xs font-medium mb-1">Assigned To</p>
                <p className="text-sm text-muted-foreground">
                  {assignedContributor.contact_name}
                  {assignedContributor.company_name &&
                    ` (${assignedContributor.company_name})`}
                </p>
              </div>
            )}

            {status === "rejected" && finding.rejection_reason && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3">
                <p className="text-xs font-medium text-red-800 mb-1">
                  Rejection Reason
                </p>
                <p className="text-sm text-red-900">
                  {finding.rejection_reason}
                </p>
              </div>
            )}

            {/* Remediation response display */}
            {finding.remediation_status && finding.remediation_status !== "awaiting" && (
              <div className="rounded-md bg-purple-50 border border-purple-200 p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-purple-800">
                    Contributor Response
                  </p>
                  <RemediationBadge status={finding.remediation_status} />
                </div>
                {finding.remediation_responded_at && (
                  <p className="text-xs text-purple-600">
                    Responded{" "}
                    {new Date(finding.remediation_responded_at).toLocaleString("en-AU")}
                  </p>
                )}
              </div>
            )}

            {finding.sent_at && (
              <p className="text-xs text-muted-foreground">
                Sent{" "}
                {new Date(finding.sent_at).toLocaleString("en-AU")}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2 border-t">
              {canReview && (
                <>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleAccept}
                    disabled={isPending}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAmendOpen(true)}
                    disabled={isPending}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Amend
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setRejectOpen(true)}
                    disabled={isPending}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Reject
                  </Button>
                </>
              )}
              {canSend && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleShare}
                  disabled={isPending}
                >
                  {hasContributor && hasEmail ? (
                    <>
                      <Send className="mr-1 h-3.5 w-3.5" />
                      Share with {assignedContributor!.contact_name}
                    </>
                  ) : hasContributor && !hasEmail ? (
                    <>
                      <Send className="mr-1 h-3.5 w-3.5" />
                      Add Email to Share
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-1 h-3.5 w-3.5" />
                      Assign &amp; Share
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      <FindingAmendDialog
        open={amendOpen}
        onOpenChange={setAmendOpen}
        finding={finding}
        contributors={contributors}
      />

      <FindingRejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        findingId={finding.id}
      />

      {projectId && (
        <ShareFindingDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          findingId={finding.id}
          projectId={projectId}
          discipline={discipline}
          contributors={contributors}
        />
      )}
    </>
  );
}
