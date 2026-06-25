"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { getCostCategoryLabel } from "@/lib/ai/types";

interface LineItemCardProps {
  item: {
    id: string;
    cost_category: string;
    element_description: string;
    quantity: number | null;
    unit: string | null;
    traditional_rate: number | null;
    traditional_total: number | null;
    mmc_rate: number | null;
    mmc_total: number | null;
    mmc_alternative: string | null;
    savings_pct: number | null;
    source: string;
    confidence: number;
    rate_source_name: string | null;
    rate_source_detail: string | null;
  };
}

export function LineItemCard({ item }: LineItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMmc = item.mmc_total != null && item.mmc_total > 0;
  const savings = item.savings_pct ?? 0;

  const isDbSourced = item.source === "reference" || (item.rate_source_name && item.rate_source_name !== "AI Estimated");
  const sourceBadgeLabel = item.rate_source_name ?? (item.source === "reference" ? "Reference" : "AI Estimated");

  return (
    <Card className="border-l-4 border-l-violet-500">
      <CardHeader
        className="cursor-pointer pb-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                {getCostCategoryLabel(item.cost_category)}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  isDbSourced
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
                title={item.rate_source_detail ?? undefined}
              >
                {sourceBadgeLabel}
              </span>
            </div>
            <CardTitle className="text-sm font-medium">
              {item.element_description}
            </CardTitle>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-sm font-bold">
                {item.traditional_total == null ? (
                  <span className="text-amber-600">TBC</span>
                ) : (
                  `$${item.traditional_total.toLocaleString()}`
                )}
              </p>
              {hasMmc && savings > 0 && (
                <p className="text-xs text-green-600">
                  MMC: ${item.mmc_total!.toLocaleString()} (-{Math.round(savings)}%)
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Conf.</div>
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{ width: `${item.confidence * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono">
                  {Math.round(item.confidence * 100)}%
                </span>
              </div>
            </div>
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
          {/* Quantity breakdown */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Quantity</p>
              <p className="font-medium">
                {item.quantity ?? "—"} {item.unit ?? ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Traditional Rate</p>
              <p className="font-medium">
                ${item.traditional_rate?.toLocaleString() ?? "—"}/{item.unit ?? "unit"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Traditional Total</p>
              <p className="font-medium">
                ${item.traditional_total?.toLocaleString() ?? "—"}
              </p>
            </div>
          </div>

          {/* Source provenance */}
          {item.rate_source_detail && (
            <div className="flex items-start gap-2 rounded-md border bg-gray-50 p-2">
              <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Source:</span> {item.rate_source_detail}
              </p>
            </div>
          )}

          {/* MMC alternative */}
          {hasMmc && (
            <div className="rounded-md border bg-violet-50 p-3">
              <p className="text-xs font-semibold text-violet-700 mb-1">
                MMC Alternative
              </p>
              {item.mmc_alternative && (
                <p className="text-sm text-violet-900 mb-2">
                  {item.mmc_alternative}
                </p>
              )}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-violet-600">MMC Rate</p>
                  <p className="font-medium text-violet-900">
                    ${item.mmc_rate?.toLocaleString() ?? "—"}/{item.unit ?? "unit"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-violet-600">MMC Total</p>
                  <p className="font-medium text-violet-900">
                    ${item.mmc_total?.toLocaleString() ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-violet-600">Savings</p>
                  <p className="font-bold text-green-700">
                    {savings > 0 ? `-${Math.round(savings)}%` : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
