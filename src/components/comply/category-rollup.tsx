"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import {
  getCategoryLabel,
  getCategoryVolume,
  getCategoryStatus,
  type CategoryStatus,
} from "@/lib/ai/types";

interface CategoryRollupProps {
  findings: {
    category: string;
    severity: string;
  }[];
}

const STATUS_CONFIG: Record<
  CategoryStatus,
  { icon: typeof CheckCircle; label: string; color: string; bg: string }
> = {
  passed: {
    icon: CheckCircle,
    label: "Passed",
    color: "text-green-600",
    bg: "bg-green-50",
  },
  issues: {
    icon: AlertTriangle,
    label: "Advisory",
    color: "text-yellow-600",
    bg: "bg-yellow-50",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    color: "text-red-600",
    bg: "bg-red-50",
  },
};

export function CategoryRollup({ findings }: CategoryRollupProps) {
  const categories = [...new Set(findings.map((f) => f.category))];

  // Group by volume
  const vol1Cats = categories.filter((c) => getCategoryVolume(c) === 1);
  const vol2Cats = categories.filter((c) => getCategoryVolume(c) === 2);

  const renderCategory = (cat: string) => {
    const catFindings = findings.filter((f) => f.category === cat);
    const status = getCategoryStatus(catFindings);
    const config = STATUS_CONFIG[status];
    const Icon = config.icon;

    return (
      <div
        key={cat}
        className={`flex items-center justify-between rounded-md border px-3 py-2 ${config.bg}`}
      >
        <span className="text-sm font-medium">{getCategoryLabel(cat)}</span>
        <div className={`flex items-center gap-1.5 ${config.color}`}>
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium">{config.label}</span>
        </div>
      </div>
    );
  };

  const renderVolumeSection = (title: string, cats: string[]) => {
    if (cats.length === 0) return null;

    const allStatuses = cats.map((c) =>
      getCategoryStatus(findings.filter((f) => f.category === c))
    );
    const hasFailed = allStatuses.includes("failed");
    const hasIssues = allStatuses.includes("issues");
    const volumeStatus: CategoryStatus = hasFailed
      ? "failed"
      : hasIssues
        ? "issues"
        : "passed";
    const volumeConfig = STATUS_CONFIG[volumeStatus];
    const VolumeIcon = volumeConfig.icon;

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-muted-foreground">
            {title}
          </h4>
          <div className={`flex items-center gap-1 ${volumeConfig.color}`}>
            <VolumeIcon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">{volumeConfig.label}</span>
          </div>
        </div>
        <div className="space-y-1.5">{cats.map(renderCategory)}</div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Category Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderVolumeSection("NCC Volume 1 — General Provisions", vol1Cats)}
        {renderVolumeSection(
          "NCC Volume 2 — Housing Provisions",
          vol2Cats
        )}
      </CardContent>
    </Card>
  );
}
