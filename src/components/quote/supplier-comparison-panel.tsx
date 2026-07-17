"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Store, Check, Loader2, Scale } from "lucide-react";
import {
  requestSupplierComparison,
  type SupplierCategoryOption,
} from "@/app/(dashboard)/quote/supplier-actions";
import { MAX_SUPPLIERS_PER_COMPONENT } from "@/lib/quote/supplier-comparison";

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;

// SCRUM-172 — pick a component (MMC category), select up to 3 suppliers, and run
// a parallel-priced comparison. Suppliers are toggled via 44px card buttons
// (no checkbox primitive in the design system).
export function SupplierComparisonPanel({
  projectId,
  options,
}: {
  projectId: string;
  options: SupplierCategoryOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(options[0]?.category ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [region, setRegion] = useState("NSW");

  const activeOption = options.find((o) => o.category === category);
  const atCap = selected.length >= MAX_SUPPLIERS_PER_COMPONENT;

  function chooseCategory(next: string) {
    setCategory(next);
    setSelected([]); // suppliers are per-category — reset on switch
    setError(null);
  }

  function toggle(productId: string) {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(productId)) return prev.filter((id) => id !== productId);
      if (prev.length >= MAX_SUPPLIERS_PER_COMPONENT) return prev; // capped
      return [...prev, productId];
    });
  }

  function handleRun() {
    if (selected.length === 0) {
      setError("Select at least one supplier to compare.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await requestSupplierComparison({
        projectId,
        technologyCategory: category,
        productIds: selected,
        region,
      });
      if ("error" in result) {
        if (result.error === "already_running" && result.comparisonId) {
          router.push(`/quote/${projectId}/suppliers/${result.comparisonId}`);
          return;
        }
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(`/quote/${projectId}/suppliers/${result.comparisonId}`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-violet-600" />
          <CardTitle className="text-base">Compare supplier quotes</CardTitle>
        </div>
        <CardDescription>
          Pick a component, then choose up to {MAX_SUPPLIERS_PER_COMPONENT}{" "}
          suppliers to price side by side — the report shows each supplier&apos;s
          estimated installed cost, lead time, and the difference against the
          cheapest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Component
            </label>
            <Select value={category} onValueChange={chooseCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a component" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.category} value={o.category}>
                    {o.label} ({o.products.length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Project region
            </label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <p className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5" />
              Suppliers
            </span>
            <span>
              {selected.length}/{MAX_SUPPLIERS_PER_COMPONENT} selected
            </span>
          </p>

          {activeOption && activeOption.products.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {activeOption.products.map((p) => {
                const isSelected = selected.includes(p.product_id);
                const disabled = !isSelected && atCap;
                return (
                  <button
                    key={p.product_id}
                    type="button"
                    onClick={() => toggle(p.product_id)}
                    disabled={disabled || isPending}
                    aria-pressed={isSelected}
                    className={`flex min-h-11 flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors disabled:opacity-50 ${
                      isSelected
                        ? "border-violet-500 bg-violet-50"
                        : "bg-background hover:border-violet-300"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {p.name}
                      </span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          isSelected
                            ? "border-violet-600 bg-violet-600 text-white"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.company_name}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                      {p.price_estimate != null && (
                        <span>~${p.price_estimate.toLocaleString()}</span>
                      )}
                      {p.lead_time_days != null && (
                        <span>{p.lead_time_days}d lead time</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No suppliers listed for this component yet.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          className="w-full bg-violet-600 hover:bg-violet-700 sm:w-auto"
          onClick={handleRun}
          disabled={isPending || selected.length === 0}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Starting comparison…
            </>
          ) : (
            <>
              <Scale className="mr-2 h-4 w-4" />
              Compare {selected.length > 0 ? `${selected.length} ` : ""}supplier
              {selected.length === 1 ? "" : "s"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
