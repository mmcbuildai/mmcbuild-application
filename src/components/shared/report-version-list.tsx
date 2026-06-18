"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ArrowRight, Download } from "lucide-react";

interface ReportVersion {
  id: string;
  version_number: number;
  source_id: string;
  created_at: string;
  pdf_url: string | null;
}

interface ReportVersionListProps {
  versions: ReportVersion[];
  module: "comply" | "build" | "quote";
  projectId: string;
  currentSourceId?: string;
}

const MODULE_REPORT_PATHS: Record<string, (projectId: string, sourceId: string) => string> = {
  comply: (pid, sid) => `/comply/${pid}/check/${sid}`,
  build: (pid, sid) => `/build/${pid}/report/${sid}`,
  quote: (pid, sid) => `/quote/${pid}/report/${sid}`,
};

const MODULE_LABELS: Record<string, string> = {
  comply: "Compliance",
  build: "Design Optimisation",
  quote: "Cost Estimation",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportVersionList({
  versions,
  module,
  projectId,
  currentSourceId,
}: ReportVersionListProps) {
  if (versions.length === 0) return null;

  const getPath = MODULE_REPORT_PATHS[module];
  // Newest first; the highest version number is the latest run.
  const ordered = [...versions].sort(
    (a, b) => b.version_number - a.version_number,
  );
  const latestVersion = ordered[0]?.version_number;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {MODULE_LABELS[module]} Version History
        </h3>
        <span className="text-xs text-muted-foreground">
          {versions.length} {versions.length === 1 ? "version" : "versions"}
        </span>
      </div>
      <div className="space-y-1.5">
        {ordered.map((v) => {
          const isCurrent = v.source_id === currentSourceId;
          const isLatest = v.version_number === latestVersion;
          return (
            <Card
              key={v.id}
              className={`transition-shadow hover:shadow-sm ${
                isCurrent ? "border-teal-300 bg-teal-50/50" : ""
              }`}
            >
              <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                <Link
                  href={getPath(projectId, v.source_id)}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">
                        Version {v.version_number}
                      </span>
                      {v.version_number === 1 && (
                        <span className="text-xs text-muted-foreground">
                          (initial)
                        </span>
                      )}
                      {isLatest && (
                        <Badge
                          variant="secondary"
                          className="bg-slate-100 text-xs text-slate-700"
                        >
                          Latest
                        </Badge>
                      )}
                      {isCurrent && (
                        <Badge
                          variant="secondary"
                          className="bg-teal-100 text-xs text-teal-800"
                        >
                          Viewing
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtDateTime(v.created_at)}
                    </p>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-3">
                  {v.pdf_url && (
                    <a
                      href={v.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                      title="Download this version's PDF"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">PDF</span>
                    </a>
                  )}
                  <Link
                    href={getPath(projectId, v.source_id)}
                    aria-label={`Open version ${v.version_number}`}
                  >
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
