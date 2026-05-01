"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Trash2, Loader2, RotateCw } from "lucide-react";
import { deletePlan, retryPlanProcessing } from "@/app/(dashboard)/projects/actions";
import { useConfirm } from "@/hooks/use-confirm";

interface Plan {
  id: string;
  file_name: string;
  status: string;
  file_size_bytes: number;
  page_count: number | null;
  file_kind?: string | null;
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

export function PlanList({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [deletePending, startDeleteTransition] = useTransition();
  const [retryPending, startRetryTransition] = useTransition();
  const { confirm, dialog } = useConfirm();

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
              {hasLayerData && layerSummary && (
                <LayerSummaryBlock summary={layerSummary} />
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
