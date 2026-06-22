"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Download } from "lucide-react";
import { SeverityBadge } from "@/components/comply/severity-badge";
import { RemediationBadge } from "@/components/comply/remediation-badge";
import { OpenItemActions } from "@/components/comply/open-item-actions";
import type { FindingLifecycle } from "@/lib/comply/finding-lifecycle";
import type { RemediationResponse } from "@/components/comply/finding-review-card";

export interface OpenItemFinding {
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
  lifecycle: FindingLifecycle;
}

const LIFECYCLE_META: Record<
  FindingLifecycle,
  { label: string; hint: string; order: number }
> = {
  open: {
    label: "Open",
    hint: "No contributor reply yet — awaiting remediation",
    order: 0,
  },
  responded: {
    label: "Responded",
    hint: "Contributor replied — review and accept or waive",
    order: 1,
  },
  resolved: {
    label: "Resolved",
    hint: "Accepted via updated drawings or evidence",
    order: 2,
  },
  waived: { label: "Waived", hint: "Accepted as-is with a recorded reason", order: 3 },
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  non_compliant: 1,
  advisory: 2,
  compliant: 3,
};

function prettyCategory(c: string): string {
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

type SortKey = "severity" | "recent";

export function OpenItemsBoard({ findings }: { findings: OpenItemFinding[] }) {
  const [severity, setSeverity] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("severity");

  const categories = useMemo(
    () => Array.from(new Set(findings.map((f) => f.category))).sort(),
    [findings],
  );

  // Counts per lifecycle for the summary chips (always over the FULL set).
  const counts = useMemo(() => {
    const c: Record<FindingLifecycle, number> = {
      open: 0,
      responded: 0,
      resolved: 0,
      waived: 0,
    };
    for (const f of findings) c[f.lifecycle]++;
    return c;
  }, [findings]);

  const filtered = useMemo(() => {
    let list = findings.filter((f) => {
      if (severity !== "all" && f.severity !== severity) return false;
      if (category !== "all" && f.category !== category) return false;
      if (status !== "all" && f.lifecycle !== status) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "severity") {
        const s = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
        if (s !== 0) return s;
      }
      // recent = most-recent response first; falls back for un-responded items.
      const at = a.responses?.[0]?.responded_at ?? "";
      const bt = b.responses?.[0]?.responded_at ?? "";
      return bt.localeCompare(at);
    });
    return list;
  }, [findings, severity, category, status, sort]);

  const selectCls =
    "h-9 rounded-md border border-input bg-background px-2 text-sm";

  const chip = (key: FindingLifecycle) => (
    <button
      type="button"
      onClick={() => setStatus(status === key ? "all" : key)}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        status === key
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:bg-accent"
      }`}
    >
      {LIFECYCLE_META[key].label}: {counts[key]}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* At-a-glance status counts (click to filter). */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(LIFECYCLE_META) as FindingLifecycle[])
          .sort((a, b) => LIFECYCLE_META[a].order - LIFECYCLE_META[b].order)
          .map((k) => chip(k))}
      </div>

      {/* Filters. */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Severity
          <select className={selectCls} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="non_compliant">Non-compliant</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Issue type
          <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {prettyCategory(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="open">Open (waiting)</option>
            <option value="responded">Responded</option>
            <option value="resolved">Resolved</option>
            <option value="waived">Waived</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Sort by
          <select className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="severity">Most critical first</option>
            <option value="recent">Most recently responded</option>
          </select>
        </label>
        {(severity !== "all" || category !== "all" || status !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSeverity("all");
              setCategory("all");
              setStatus("all");
            }}
            className="h-9 self-end rounded-md px-2 text-sm text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {filtered.length} of {findings.length} item
        {findings.length === 1 ? "" : "s"}.
      </p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No items match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((finding) => (
            <OpenItemCard key={finding.id} finding={finding} />
          ))}
        </div>
      )}
    </div>
  );
}

function OpenItemCard({ finding }: { finding: OpenItemFinding }) {
  const lifecycle = finding.lifecycle;
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {finding.ncc_section}
          </span>
          <SeverityBadge severity={finding.severity} />
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {prettyCategory(finding.category)}
          </span>
          {finding.remediation_status && (
            <RemediationBadge status={finding.remediation_status} />
          )}
        </div>

        <div>
          <p className="text-base font-medium">{finding.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{finding.description}</p>
        </div>

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
                    Responded {new Date(response.responded_at).toLocaleString("en-AU")}
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
