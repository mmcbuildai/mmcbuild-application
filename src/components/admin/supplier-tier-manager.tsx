"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Trash2, Plus, Loader2 } from "lucide-react";
import {
  SUPPLIER_TIERS,
  supplierTierLabel,
} from "@/lib/direct/featured-suppliers";
import { MMC_TECHNOLOGY_CATEGORIES, getTechnologyLabel } from "@/lib/ai/types";
import {
  setSupplierTier,
  getSupplierProducts,
  addSupplierProduct,
  deleteSupplierProduct,
  type AdminSupplier,
} from "@/app/(dashboard)/admin/suppliers/actions";

type Product = Awaited<ReturnType<typeof getSupplierProducts>>[number];

export function SupplierTierManager({
  suppliers,
}: {
  suppliers: AdminSupplier[];
}) {
  if (suppliers.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No suppliers in the directory yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {suppliers.map((s) => (
        <SupplierRow key={s.id} supplier={s} />
      ))}
    </div>
  );
}

function SupplierRow({ supplier }: { supplier: AdminSupplier }) {
  const [tier, setTier] = useState(supplier.tier);
  const [expanded, setExpanded] = useState(false);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function loadProducts() {
    setLoadingProducts(true);
    try {
      setProducts(await getSupplierProducts(supplier.id));
    } finally {
      setLoadingProducts(false);
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && products === null) void loadProducts();
  }

  function changeTier(next: string) {
    const prev = tier;
    setTier(next); // optimistic
    setError(null);
    startTransition(async () => {
      const res = await setSupplierTier(supplier.id, next);
      if (res.error) {
        setTier(prev);
        setError(res.error);
      }
    });
  }

  const isFeatured = tier === "growth_partner";

  return (
    <div className="rounded-md border">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{supplier.company_name}</p>
            <Badge variant="secondary" className="capitalize">
              {supplier.status}
            </Badge>
            {isFeatured && (
              <Badge className="bg-amber-500 hover:bg-amber-500">Featured</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {supplier.trade_type.replace(/_/g, " ")} · {supplier.product_count}{" "}
            product{supplier.product_count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor={`tier-${supplier.id}`}>
            Tier
          </label>
          <select
            id={`tier-${supplier.id}`}
            value={tier}
            onChange={(e) => changeTier(e.target.value)}
            disabled={isPending}
            className="min-h-9 rounded-md border bg-background px-2 text-sm"
          >
            {SUPPLIER_TIERS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={toggle} className="min-h-9">
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            Products
          </Button>
        </div>
      </div>

      {error && <p className="px-3 pb-2 text-xs text-rose-600">{error}</p>}

      {expanded && (
        <div className="border-t bg-muted/20 p-3">
          {!isFeatured && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This supplier is <strong>{supplierTierLabel(tier)}</strong>. Products
              are only surfaced in Build when the tier is{" "}
              <strong>Growth Partner</strong>.
            </p>
          )}

          {loadingProducts ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading products…
            </div>
          ) : (
            <>
              <ProductList
                products={products ?? []}
                onDeleted={loadProducts}
              />
              <AddProductForm
                professionalId={supplier.id}
                onAdded={loadProducts}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProductList({
  products,
  onDeleted,
}: {
  products: Product[];
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  if (products.length === 0) {
    return (
      <p className="mb-3 text-sm text-muted-foreground">No products yet.</p>
    );
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteSupplierProduct(id);
      onDeleted();
    });
  }

  return (
    <div className="mb-3 space-y-2">
      {products.map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between gap-3 rounded-md border bg-background p-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              {getTechnologyLabel(p.technology_category)}
              {p.sku && ` · SKU ${p.sku}`}
              {p.price_estimate != null &&
                ` · ~$${p.price_estimate.toLocaleString()}`}
              {p.lead_time_days != null && ` · ${p.lead_time_days}d lead`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => remove(p.id)}
            disabled={isPending}
            title="Delete product"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function AddProductForm({
  professionalId,
  onAdded,
}: {
  professionalId: string;
  onAdded: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    const priceRaw = (formData.get("price_estimate") as string)?.trim();
    const leadRaw = (formData.get("lead_time_days") as string)?.trim();
    setError(null);
    startTransition(async () => {
      const res = await addSupplierProduct({
        professionalId,
        technology_category: formData.get("technology_category") as string,
        name: (formData.get("name") as string) ?? "",
        summary: ((formData.get("summary") as string) || "").trim() || null,
        sku: ((formData.get("sku") as string) || "").trim() || null,
        price_estimate: priceRaw ? Number(priceRaw) : null,
        lead_time_days: leadRaw ? Number(leadRaw) : null,
      });
      if (res.error) {
        setError(res.error);
      } else {
        onAdded();
        (document.getElementById(`addprod-${professionalId}`) as HTMLFormElement)?.reset();
      }
    });
  }

  return (
    <form
      id={`addprod-${professionalId}`}
      action={submit}
      className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">
          Add a product
        </p>
      </div>
      <select
        name="technology_category"
        required
        defaultValue=""
        className="min-h-11 rounded-md border bg-background px-2 text-sm"
      >
        <option value="" disabled>
          MMC category…
        </option>
        {MMC_TECHNOLOGY_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <Input name="name" placeholder="Product name" required className="min-h-11" />
      <Input name="sku" placeholder="SKU (optional)" className="min-h-11" />
      <Input
        name="price_estimate"
        type="number"
        min="0"
        step="0.01"
        placeholder="Price estimate $ (optional)"
        className="min-h-11"
      />
      <Input
        name="lead_time_days"
        type="number"
        min="0"
        step="1"
        placeholder="Lead time (days, optional)"
        className="min-h-11"
      />
      <Input
        name="summary"
        placeholder="Short summary (optional)"
        className="min-h-11 sm:col-span-2"
      />
      {error && (
        <p className="text-xs text-rose-600 sm:col-span-2">{error}</p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={isPending} className="min-h-11">
          {isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-4 w-4" />
          )}
          Add product
        </Button>
      </div>
    </form>
  );
}
