"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { revalidatePath } from "next/cache";
import { isOperatorEmail } from "@/lib/auth/operator";
import { z } from "zod";
import { MMC_TECHNOLOGY_CATEGORIES } from "@/lib/ai/types";
import { SUPPLIER_TIERS } from "@/lib/direct/featured-suppliers";

// SCRUM-171: operator surface to set a supplier's tier and seed their product
// catalogue. Tier reflects a paid subscription; Billing/payment is out of scope,
// so the operator sets it manually. Directory data is GLOBAL + shared, so these
// are operator-allowlist actions (SCRUM-345), not per-org role checks.
async function requireOperator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!isOperatorEmail(user.email)) throw new Error("Not authorised");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) throw new Error("Profile not found");
  return profile as { id: string; org_id: string };
}

const TIER_KEYS = SUPPLIER_TIERS.map((t) => t.key) as [string, ...string[]];
const CATEGORY_KEYS = MMC_TECHNOLOGY_CATEGORIES.map((c) => c.key) as [
  string,
  ...string[],
];

export interface AdminSupplier {
  id: string;
  company_name: string;
  trade_type: string;
  status: string;
  tier: string;
  product_count: number;
}

export async function getSuppliersForAdmin(): Promise<AdminSupplier[]> {
  // @cross-tenant-ok: operator-allowlist gated (SCRUM-345); the professionals directory is a GLOBAL shared marketplace, not org-scoped.
  await requireOperator();

  const { data: pros } = await db()
    .from("professionals")
    .select("id, company_name, trade_type, status, tier")
    .order("company_name", { ascending: true });

  const list = (pros ?? []) as unknown as Omit<AdminSupplier, "product_count">[];
  if (list.length === 0) return [];

  // Product counts per professional (one query, grouped in JS).
  const { data: products } = await db()
    .from("supplier_products")
    .select("professional_id")
    .in(
      "professional_id",
      list.map((p) => p.id),
    );
  const counts = new Map<string, number>();
  for (const row of (products ?? []) as { professional_id: string }[]) {
    counts.set(row.professional_id, (counts.get(row.professional_id) ?? 0) + 1);
  }

  return list.map((p) => ({ ...p, product_count: counts.get(p.id) ?? 0 }));
}

const setTierSchema = z.object({
  professionalId: z.string().uuid(),
  tier: z.enum(TIER_KEYS),
});

export async function setSupplierTier(professionalId: string, tier: string) {
  // @cross-tenant-ok: operator-allowlist gated (SCRUM-345); supplier tier is global directory data, not org-scoped.
  await requireOperator();
  const parsed = setTierSchema.safeParse({ professionalId, tier });
  if (!parsed.success) return { error: "Invalid tier" };

  const { error } = await db()
    .from("professionals")
    .update({ tier: parsed.data.tier, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.professionalId);

  if (error) return { error: `Failed to set tier: ${(error as { message: string }).message}` };
  revalidatePath("/admin/suppliers");
  return { success: true };
}

export async function getSupplierProducts(professionalId: string) {
  // @cross-tenant-ok: operator-allowlist gated (SCRUM-345); supplier products are global directory data, not org-scoped.
  await requireOperator();
  const { data } = await db()
    .from("supplier_products")
    .select(
      "id, technology_category, sku, name, summary, price_estimate, lead_time_days, is_active",
    )
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: true });
  return (data ?? []) as {
    id: string;
    technology_category: string;
    sku: string | null;
    name: string;
    summary: string | null;
    price_estimate: number | null;
    lead_time_days: number | null;
    is_active: boolean;
  }[];
}

const addProductSchema = z.object({
  professionalId: z.string().uuid(),
  technology_category: z.enum(CATEGORY_KEYS),
  name: z.string().trim().min(1, "Product name is required").max(200),
  summary: z.string().trim().max(1000).optional().nullable(),
  sku: z.string().trim().max(100).optional().nullable(),
  price_estimate: z.number().nonnegative().nullable().optional(),
  lead_time_days: z.number().int().nonnegative().nullable().optional(),
});

export async function addSupplierProduct(input: {
  professionalId: string;
  technology_category: string;
  name: string;
  summary?: string | null;
  sku?: string | null;
  price_estimate?: number | null;
  lead_time_days?: number | null;
}) {
  // @cross-tenant-ok: operator-allowlist gated (SCRUM-345); products are global directory data (product inherits the supplier's org).
  await requireOperator();
  const parsed = addProductSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid product" };
  }

  // The product inherits the supplier's org so RLS + tenancy stay consistent.
  const { data: pro } = await db()
    .from("professionals")
    .select("org_id")
    .eq("id", parsed.data.professionalId)
    .single();
  if (!pro) return { error: "Supplier not found" };

  const { error } = await db().from("supplier_products").insert({
    professional_id: parsed.data.professionalId,
    org_id: (pro as { org_id: string }).org_id,
    technology_category: parsed.data.technology_category,
    name: parsed.data.name,
    summary: parsed.data.summary ?? null,
    sku: parsed.data.sku ?? null,
    price_estimate: parsed.data.price_estimate ?? null,
    lead_time_days: parsed.data.lead_time_days ?? null,
  });

  if (error) return { error: `Failed to add product: ${(error as { message: string }).message}` };
  revalidatePath("/admin/suppliers");
  return { success: true };
}

export async function deleteSupplierProduct(productId: string) {
  // @cross-tenant-ok: operator-allowlist gated (SCRUM-345); products are global directory data, not org-scoped.
  await requireOperator();
  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) return { error: "Invalid product" };

  const { error } = await db()
    .from("supplier_products")
    .delete()
    .eq("id", parsed.data);

  if (error) return { error: `Failed to delete product: ${(error as { message: string }).message}` };
  revalidatePath("/admin/suppliers");
  return { success: true };
}
