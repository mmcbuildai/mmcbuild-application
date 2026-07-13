"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Trash2, Loader2, RotateCw, AlertTriangle, Download } from "lucide-react";
import {
  deletePlan,
  retryPlanProcessing,
  getPlanDownloadUrl,
} from "@/app/(dashboard)/projects/actions";
import { useConfirm } from "@/hooks/use-confirm";
import { useStatusPolling } from "@/hooks/use-status-polling";

interface PriorVersion {
  id: string;
  version: number;
  superseded_at: string | null;
}

interface Plan {
  id: string;
  file_name: string;
  status: string;
  file_size_bytes: number;
  page_count: number | null;
  file_kind?: string | null;
  error_message?: string | null;
  version?: number;
  priorVersions?: PriorVersion[];
  extracted_layers?: {
    layers?: Array<{ name: string; entityCount: number }>;
    derived?: {
      likelyDoorCount: number | null;
      likelyWindowCount: number | null;
      likelyRoomCount: number | null;
    };
    totalEntities?: number;
  } | null;
}

async function openPlanDownload(planId: string) {
  const res = await getPlanDownloadUrl(planId);
  if (res.error || !res.url) {
    alert(res.error ?? "Couldn't create a download link.");
    return;
  }
  window.open(res.url, "_blank", "noopener");
}

export function PlanList({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [deletePending, startDeleteTransition] = useTransition();
  const [retryPending, startRetryTransition] = useTransition();
  const { confirm, dialog } = useConfirm();

  // Auto-refresh while any plan is still uploading/processing so the status
  // badge updates without a manual reload (SCRUM-267).
  useStatusPolling(plans.map((p) => p.status));

  async function handleDelete(planId: string) {
    const ok = await confirm({
      title: "Delete plan?",
      description: "Delete this plan and its embeddings? This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    startDeleteTransition(async () => {
      const result = await deletePlan(planId);
      if (result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleRetry(planId: string) {
    startRetryTransition(async () => {
      const result = await retryPlanProcessing(planId);
      if (result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  }

  if (plans.length === 0) return null;

  return (
    <div>
      {dialog}
      <h2 className="mb-3 text-sm font-semibold">Uploaded Plans</h2>
      <div className="space-y-2">
        {plans.map((plan) => {
          const isStuck = plan.status === "uploading" || plan.status === "error";
          const statusLabel =
            plan.status === "manual_review" ? "manual review" : plan.status;
          const layerSummary = plan.extracted_layers;
          const hasLayerData =
            !!layerSummary?.layers && layerSummary.layers.length > 0;
          return (
            <div
              key={plan.id}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-medium"
                      title={plan.file_name}
                    >
                      {plan.file_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(plan.file_size_bytes / 1024 / 1024).toFixed(1)} MB
                      {plan.page_count && ` · ${plan.page_count} pages`}
                      {plan.file_kind === "dwg" && " · DWG"}
                      {plan.version && plan.version > 1 && ` · v${plan.version}`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant={
                      plan.status === "ready"
                        ? "default"
                        : plan.status === "error"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-xs capitalize"
                  >
                    {statusLabel}
                  </Badge>
                  {isStuck && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => handleRetry(plan.id)}
                      disabled={retryPending}
                      title="Retry processing"
                    >
                      {retryPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCw className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => openPlanDownload(plan.id)}
                    title="Download this drawing"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(plan.id)}
                    disabled={deletePending}
                  >
                    {deletePending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              {plan.error_message && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">
                      Couldn&apos;t reconstruct this plan in 3D
                    </p>
                    <p className="mt-0.5 break-words">{plan.error_message}</p>
                    <p className="mt-1 text-amber-800">
                      Fix the issue and re-upload, or delete this file and try a
                      different one.
                    </p>
                  </div>
                </div>
              )}
              {hasLayerData && layerSummary && (
                <LayerSummaryBlock summary={layerSummary} />
              )}
              {plan.priorVersions && plan.priorVersions.length > 0 && (
                <div className="rounded-md bg-muted/40 p-2 text-xs">
                  <p className="mb-1 font-medium text-muted-foreground">
                    Previous versions
                  </p>
                  <div className="flex flex-col gap-1">
                    {plan.priorVersions.map((pv) => (
                      <div
                        key={pv.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-muted-foreground">
                          v{pv.version}
                          {pv.superseded_at &&
                            ` · replaced ${new Date(pv.superseded_at).toLocaleDateString("en-AU")}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => openPlanDownload(pv.id)}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LayerSummaryBlock({
  summary,
}: {
  summary: NonNullable<Plan["extracted_layers"]>;
}) {
  const layers = summary.layers ?? [];
  const derived = summary.derived;
  const topLayers = layers.slice(0, 6);
  const more = layers.length - topLayers.length;

  return (
    <div className="rounded-md bg-muted/40 p-2 text-xs">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
        <span className="font-medium text-foreground">
          Layers extracted ({layers.length})
        </span>
        {summary.totalEntities != null && (
          <span>{summary.totalEntities} entities</span>
        )}
        {derived?.likelyRoomCount != null && (
          <span>~{derived.likelyRoomCount} rooms</span>
        )}
        {derived?.likelyDoorCount != null && (
          <span>~{derived.likelyDoorCount} doors</span>
        )}
        {derived?.likelyWindowCount != null && (
          <span>~{derived.likelyWindowCount} windows</span>
        )}
      </div>
      {topLayers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {topLayers.map((l) => (
            <span
              key={l.name}
              className="rounded bg-background px-1.5 py-0.5 text-[11px]"
              title={`${l.entityCount} entities`}
            >
              {l.name}
              <span className="ml-1 text-muted-foreground">{l.entityCount}</span>
            </span>
          ))}
          {more > 0 && (
            <span className="rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
              +{more} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
