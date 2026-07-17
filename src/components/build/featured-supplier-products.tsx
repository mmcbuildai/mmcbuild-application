"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Store, ArrowUpRight, Clock, ShieldCheck } from "lucide-react";
import { logDirectoryReferral } from "@/app/(dashboard)/build/actions";
import type { FeaturedProduct } from "@/lib/direct/featured-suppliers";

// SCRUM-171: the "Featured suppliers for this category" subsection rendered under
// a Build suggestion. Only Growth-Partner suppliers' products reach here (the
// tier filter runs server-side). Clicking a product logs a directory referral
// (lead tracking), then navigates to the supplier's directory profile.
export function FeaturedSupplierProducts({
  products,
  projectId,
  suggestionId,
}: {
  products: FeaturedProduct[];
  projectId: string;
  suggestionId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!products || products.length === 0) return null;

  function handleClick(p: FeaturedProduct) {
    startTransition(async () => {
      // Lead log is best-effort — never block the click-through on it.
      await logDirectoryReferral({
        professionalId: p.professional_id,
        projectId,
        suggestionId,
        productId: p.product_id,
      });
      router.push(`/direct/${p.professional_id}`);
    });
  }

  return (
    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-900">
        <Store className="h-3.5 w-3.5" />
        Featured suppliers for this category
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {products.map((p) => (
          <button
            key={p.product_id}
            type="button"
            onClick={() => handleClick(p)}
            disabled={pending}
            className="flex min-h-11 flex-col items-start gap-1 rounded-md border bg-background p-2.5 text-left transition-colors hover:border-amber-300 disabled:opacity-60"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{p.name}</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {p.company_name}
              {p.compliance_verified && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                  <ShieldCheck className="h-3 w-3" />
                  Compliance verified
                </span>
              )}
            </span>
            {p.summary && (
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {p.summary}
              </span>
            )}
            <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {p.price_estimate != null && (
                <span>~${p.price_estimate.toLocaleString()}</span>
              )}
              {p.lead_time_days != null && (
                <span className="inline-flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  {p.lead_time_days}d lead time
                </span>
              )}
              {p.sku && <span>SKU {p.sku}</span>}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-amber-800/80">
        Sponsored — these suppliers pay for placement. Clicking lets them know
        you&apos;re interested.
      </p>
    </div>
  );
}
