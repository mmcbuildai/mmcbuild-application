"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2, Download, AlertCircle, Trophy } from "lucide-react";
import {
  getSupplierComparison,
  type SupplierComparisonRecord,
} from "@/app/(dashboard)/quote/supplier-actions";
import type { SupplierQuoteVariant } from "@/lib/quote/supplier-comparison";

function fmtCurrency(n: number | null): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-AU", { maximumFractionDigits: 0 });
}

// SCRUM-172 — the comparison result: parallel supplier columns with the lowest
// highlighted, a summary, and a PDF export. Polls while the run is in flight so
// the builder can leave and come back.
export function SupplierComparisonResult({
  projectId,
  comparisonId,
  categoryLabel,
  initialComparison,
  initialVariants,
}: {
  projectId: string;
  comparisonId: string;
  categoryLabel: string;
  initialComparison: SupplierComparisonRecord;
  initialVariants: SupplierQuoteVariant[];
}) {
  const [comparison, setComparison] =
    useState<SupplierComparisonRecord>(initialComparison);
  const [variants, setVariants] =
    useState<SupplierQuoteVariant[]>(initialVariants);

  const inFlight =
    comparison.status === "queued" || comparison.status === "processing";

  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(async () => {
      const { comparison: next, variants: nextVars } =
        await getSupplierComparison(comparisonId);
      if (next) {
        setComparison(next);
        setVariants(nextVars);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [inFlight, comparisonId]);

  if (inFlight) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        <p className="text-sm font-medium">Pricing {variants.length} supplier quote{variants.length === 1 ? "" : "s"}…</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          We&apos;re estimating each supplier&apos;s installed cost for {categoryLabel}. This
          usually takes under a minute — you can leave and come back.
        </p>
      </div>
    );
  }

  if (comparison.status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 py-12 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm font-medium text-red-800">
          {comparison.summary ?? "This comparison failed to complete."}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/quote/${projectId}`}>Back to Quote</Link>
        </Button>
      </div>
    );
  }

  // Metric rows × supplier columns.
  const metrics: {
    label: string;
    render: (v: SupplierQuoteVariant) => React.ReactNode;
  }[] = [
    {
      label: "Product",
      render: (v) => (
        <span>
          {v.product_name}
          {v.sku ? (
            <span className="block text-[11px] text-muted-foreground">
              SKU {v.sku}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      label: "Est. installed total",
      render: (v) => (
        <span className="font-semibold">{fmtCurrency(v.estimated_total)}</span>
      ),
    },
    {
      label: "Δ vs lowest",
      render: (v) =>
        v.is_lowest ? (
          <span className="inline-flex items-center gap-1 font-medium text-green-700">
            <Trophy className="h-3.5 w-3.5" /> Lowest
          </span>
        ) : v.delta_vs_lowest_pct != null ? (
          <span className="text-amber-700">+{v.delta_vs_lowest_pct}%</span>
        ) : (
          "—"
        ),
    },
    {
      label: "Unit rate",
      render: (v) =>
        v.unit_rate != null
          ? `${fmtCurrency(v.unit_rate)}${v.unit ? `/${v.unit}` : ""}`
          : "—",
    },
    {
      label: "Quantity",
      render: (v) =>
        v.quantity != null ? `${v.quantity}${v.unit ? ` ${v.unit}` : ""}` : "—",
    },
    {
      label: "Lead time",
      render: (v) => (v.lead_time_days != null ? `${v.lead_time_days} days` : "—"),
    },
    {
      label: "Confidence",
      render: (v) =>
        v.confidence != null ? `${Math.round(v.confidence * 100)}%` : "—",
    },
    {
      label: "Notes",
      render: (v) => (
        <span className="text-xs text-muted-foreground">{v.notes ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Comparing {variants.length} supplier{variants.length === 1 ? "" : "s"} for{" "}
          <span className="font-medium text-foreground">{categoryLabel}</span>
        </p>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/quote/supplier-comparison/${comparisonId}`}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </a>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-40 p-3 text-left text-xs font-medium text-muted-foreground">
                Supplier
              </th>
              {variants.map((v, i) => (
                <th
                  key={v.id}
                  className={`p-3 text-left align-top ${
                    v.is_lowest ? "bg-green-50" : ""
                  }`}
                >
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="block font-semibold">{v.supplier_name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.label} className="border-b last:border-0">
                <td className="p-3 align-top text-xs font-medium text-muted-foreground">
                  {m.label}
                </td>
                {variants.map((v) => (
                  <td
                    key={v.id}
                    className={`p-3 align-top ${v.is_lowest ? "bg-green-50/60" : ""}`}
                  >
                    {m.render(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {comparison.summary && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Procurement summary
          </p>
          <p className="whitespace-pre-line text-sm">{comparison.summary}</p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        AI-generated advisory estimates to help you compare suppliers — not formal
        quotations. Confirm figures, lead times and availability with each supplier
        directly.
      </p>
    </div>
  );
}
