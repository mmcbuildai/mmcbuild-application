"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Trash2, Loader2 } from "lucide-react";
import { deletePlan } from "@/app/(dashboard)/projects/actions";

interface Plan {
  id: string;
  file_name: string;
  status: string;
  file_size_bytes: number;
  page_count: number | null;
}

export function PlanList({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(planId: string) {
    if (!confirm("Delete this plan and its embeddings? This cannot be undone.")) {
      return;
    }

    setDeleting(planId);
    const result = await deletePlan(planId);
    setDeleting(null);

    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
  }

  if (plans.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">Uploaded Plans</h2>
      <div className="space-y-2">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{plan.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {(plan.file_size_bytes / 1024 / 1024).toFixed(1)} MB
                  {plan.page_count && ` · ${plan.page_count} pages`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={plan.status === "ready" ? "default" : "secondary"}
                className="text-xs capitalize"
              >
                {plan.status}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(plan.id)}
                disabled={deleting === plan.id}
              >
                {deleting === plan.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
