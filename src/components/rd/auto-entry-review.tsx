"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  approveAutoEntry,
  rejectAutoEntry,
  bulkApproveEntries,
} from "@/app/(dashboard)/settings/rd-tracking/actions";
import { RD_STAGES, RD_DELIVERABLES, RD_TAG_OPTIONS } from "@/lib/rd-constants";
import type { ReviewStatus } from "@/lib/supabase/types";

interface CommitLog {
  sha: string;
  message: string | null;
  repo: string | null;
  branch: string | null;
  author_name: string | null;
  committed_at: string | null;
  files_changed: unknown;
}

interface AutoEntry {
  id: string;
  date: string;
  hours: number;
  stage: string;
  deliverable: string;
  rd_tag: string;
  description: string | null;
  ai_reasoning: string | null;
  confidence: number | null;
  review_status: ReviewStatus;
  reviewed_at: string | null;
  created_at: string;
  rd_commit_logs: CommitLog | null;
}

const tagColors: Record<string, "default" | "secondary" | "outline"> = {
  core_rd: "default",
  rd_supporting: "secondary",
  not_eligible: "outline",
};

const reviewColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  approved: "default",
  rejected: "destructive",
};

export function AutoEntryReview({ entries }: { entries: AutoEntry[] }) {
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);

  const filtered =
    filter === "all"
      ? entries
      : entries.filter((e) => e.review_status === filter);

  const pendingHighConfidence = entries.filter(
    (e) =>
      e.review_status === "pending" &&
      (e.confidence ?? 0) >= 0.8
  );

  async function handleApprove(id: string) {
    setLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await approveAutoEntry(id);
    } finally {
      setLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleReject(id: string) {
    setLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await rejectAutoEntry(id);
    } finally {
      setLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleBulkApprove() {
    setBulkLoading(true);
    try {
      await bulkApproveEntries(pendingHighConfidence.map((e) => e.id));
    } finally {
      setBulkLoading(false);
    }
  }

  function getFilesCount(filesChanged: unknown): number {
    if (Array.isArray(filesChanged)) return filesChanged.length;
    return 0;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        {pendingHighConfidence.length > 0 && (
          <Button
            onClick={handleBulkApprove}
            disabled={bulkLoading}
            size="sm"
          >
            {bulkLoading
              ? "Approving..."
              : `Approve All High Confidence (${pendingHighConfidence.length})`}
          </Button>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          No {filter === "all" ? "" : filter} entries found.
        </p>
      )}

      {filtered.map((entry) => {
        const commit = entry.rd_commit_logs;
        const filesCount = commit
          ? getFilesCount(commit.files_changed)
          : 0;

        return (
          <Card key={entry.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-mono">
                    {commit?.sha.slice(0, 7) ?? "—"}
                  </CardTitle>
                  <p className="text-sm">
                    {commit?.message?.slice(0, 120) ?? "No message"}
                  </p>
                </div>
                <Badge variant={reviewColors[entry.review_status]}>
                  {entry.review_status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">
                  {RD_STAGES.find((s) => s.value === entry.stage)?.label ??
                    entry.stage}
                </Badge>
                <Badge variant="outline">
                  {RD_DELIVERABLES.find((d) => d.value === entry.deliverable)
                    ?.label ?? entry.deliverable}
                </Badge>
                <Badge variant={tagColors[entry.rd_tag] ?? "outline"}>
                  {RD_TAG_OPTIONS.find((t) => t.value === entry.rd_tag)
                    ?.label ?? entry.rd_tag}
                </Badge>
                <span className="text-muted-foreground">
                  {Number(entry.hours).toFixed(1)}h
                </span>
                {filesCount > 0 && (
                  <span className="text-muted-foreground">
                    {filesCount} files
                  </span>
                )}
              </div>

              {entry.confidence !== null && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Confidence:</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[200px]">
                      <div
                        className={`h-full rounded-full transition-all ${
                          entry.confidence >= 0.8
                            ? "bg-green-500"
                            : entry.confidence >= 0.5
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        }`}
                        style={{
                          width: `${(entry.confidence ?? 0) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="font-medium text-sm">
                      {((entry.confidence ?? 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              )}

              {entry.ai_reasoning && (
                <p className="text-sm text-muted-foreground italic">
                  {entry.ai_reasoning}
                </p>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {commit?.author_name && <span>by {commit.author_name}</span>}
                {commit?.branch && <span>on {commit.branch}</span>}
                {commit?.repo && <span>in {commit.repo}</span>}
              </div>

              {entry.review_status === "pending" && (
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(entry.id)}
                    disabled={loading[entry.id]}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(entry.id)}
                    disabled={loading[entry.id]}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
