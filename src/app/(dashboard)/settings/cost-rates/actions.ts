"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { inngest } from "@/lib/inngest/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || !["owner", "admin"].includes(profile.role)) {
    redirect("/dashboard");
  }

  return profile;
}

// ─── Rate Sources ────────────────────────────────────────────

export async function listRateSources() {
  await requireAdmin();

  const { data, error } = await db()
    .from("cost_rate_sources")
    .select("id, name, source_type, config, last_synced_at, is_active, created_at")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load rate sources: ${error.message}`);
  return data as {
    id: string;
    name: string;
    source_type: string;
    config: Record<string, unknown>;
    last_synced_at: string | null;
    is_active: boolean;
    created_at: string;
  }[];
}

export async function createRateSource(
  name: string,
  sourceType: "api" | "csv" | "manual",
  config: Record<string, unknown>
) {
  await requireAdmin();

  const { error } = await db()
    .from("cost_rate_sources")
    .insert({
      name,
      source_type: sourceType,
      config,
      is_active: true,
    } as never);

  if (error) throw new Error(`Failed to create rate source: ${error.message}`);
  revalidatePath("/settings/cost-rates");
}

export async function toggleRateSource(id: string, isActive: boolean) {
  // @cross-tenant-ok: global cost_rate_sources config (no org_id), admin-role gated operator action
  await requireAdmin();

  const { error } = await db()
    .from("cost_rate_sources")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) throw new Error(`Failed to toggle rate source: ${error.message}`);
  revalidatePath("/settings/cost-rates");
}

export async function triggerSync(sourceId: string) {
  await requireAdmin();

  await inngest.send({
    name: "cost/rates.ingest-requested",
    data: { sourceId },
  });

  revalidatePath("/settings/cost-rates");
}

// ─── Reference Rates (Read) ─────────────────────────────────

export type ReferenceRate = {
  id: string;
  category: string;
  element: string;
  unit: string;
  base_rate: number;
  state: string;
  year: number;
  source: string;
  source_id: string | null;
  source_detail: string | null;
};

export async function listReferenceRates(filters?: {
  category?: string;
  state?: string;
  search?: string;
}) {
  await requireAdmin();

  let query = db()
    .from("cost_reference_rates")
    .select("id, category, element, unit, base_rate, state, year, source, source_id, source_detail")
    .order("category")
    .order("element");

  if (filters?.category) {
    query = query.eq("category", filters.category);
  }
  if (filters?.state) {
    query = query.eq("state", filters.state);
  }
  if (filters?.search) {
    query = query.ilike("element", `%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load rates: ${error.message}`);
  return (data ?? []) as ReferenceRate[];
}

export async function listRateCategories(): Promise<string[]> {
  await requireAdmin();

  const { data, error } = await db()
    .from("cost_reference_rates")
    .select("category");

  if (error) return [];
  const cats = new Set((data as { category: string }[]).map((r) => r.category));
  return Array.from(cats).sort();
}

// ─── Org Rate Overrides ─────────────────────────────────────

export type OrgRateOverride = {
  id: string;
  category: string;
  element: string;
  unit: string;
  base_rate: number;
  state: string;
  year: number;
  notes: string | null;
  source_label: string;
  created_at: string;
  updated_at: string;
};

export async function listOrgOverrides(filters?: {
  category?: string;
  state?: string;
  search?: string;
}) {
  const profile = await requireAdmin();

  let query = db()
    .from("org_rate_overrides")
    .select("id, category, element, unit, base_rate, state, year, notes, source_label, created_at, updated_at")
    .eq("org_id", profile.org_id)
    .order("category")
    .order("element");

  if (filters?.category) {
    query = query.eq("category", filters.category);
  }
  if (filters?.state) {
    query = query.eq("state", filters.state);
  }
  if (filters?.search) {
    query = query.ilike("element", `%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load overrides: ${error.message}`);
  return (data ?? []) as OrgRateOverride[];
}

export async function upsertOrgOverride(rate: {
  category: string;
  element: string;
  unit: string;
  base_rate: number;
  state: string;
  year?: number;
  notes?: string;
  source_label?: string;
}) {
  const profile = await requireAdmin();

  const { error } = await db()
    .from("org_rate_overrides")
    .upsert(
      {
        org_id: profile.org_id,
        category: rate.category,
        element: rate.element,
        unit: rate.unit,
        base_rate: rate.base_rate,
        state: rate.state,
        year: rate.year ?? 2025,
        notes: rate.notes ?? null,
        source_label: rate.source_label ?? "Client Override",
        created_by: profile.id,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "org_id,category,element,state" }
    );

  if (error) throw new Error(`Failed to save rate override: ${error.message}`);
  revalidatePath("/settings/cost-rates");
}

export async function deleteOrgOverride(id: string) {
  const profile = await requireAdmin();

  // Cross-tenant isolation (SCRUM-343): db() bypasses RLS and org_rate_overrides
  // is org-scoped — constrain the delete to the caller's org so an admin can't
  // delete another org's rate override by id (mirrors upsertOrgOverride).
  const { error } = await db()
    .from("org_rate_overrides")
    .delete()
    .eq("id", id)
    .eq("org_id", profile.org_id);

  if (error) throw new Error(`Failed to delete override: ${error.message}`);
  revalidatePath("/settings/cost-rates");
}

export async function bulkUpsertOrgOverrides(rates: {
  category: string;
  element: string;
  unit: string;
  base_rate: number;
  state: string;
  year?: number;
  notes?: string;
  source_label?: string;
}[]) {
  const profile = await requireAdmin();

  const rows = rates.map((r) => ({
    org_id: profile.org_id,
    category: r.category,
    element: r.element,
    unit: r.unit,
    base_rate: r.base_rate,
    state: r.state,
    year: r.year ?? 2025,
    notes: r.notes ?? null,
    source_label: r.source_label ?? "CSV Upload",
    created_by: profile.id,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await db()
    .from("org_rate_overrides")
    .upsert(rows as never[], { onConflict: "org_id,category,element,state" });

  if (error) throw new Error(`Failed to bulk import rates: ${error.message}`);
  revalidatePath("/settings/cost-rates");
  return { imported: rows.length };
}

// ─── Merged View (for display) ──────────────────────────────

export type MergedRate = {
  id: string;
  category: string;
  element: string;
  unit: string;
  base_rate: number;
  state: string;
  year: number;
  source_type: "default" | "override" | "external";
  source_label: string;
  default_rate: number | null;
  override_id: string | null;
  notes: string | null;
};

export async function listMergedRates(filters?: {
  category?: string;
  state?: string;
  search?: string;
}): Promise<MergedRate[]> {
  const profile = await requireAdmin();

  // Fetch both in parallel
  const [refResult, overrideResult] = await Promise.all([
    listReferenceRates(filters),
    listOrgOverrides(filters),
  ]);

  // Build override lookup
  const overrideMap = new Map<string, OrgRateOverride>();
  for (const o of overrideResult) {
    overrideMap.set(`${o.category}|${o.element}|${o.state}`, o);
  }

  const merged: MergedRate[] = [];
  const seen = new Set<string>();

  // Start with reference rates, apply overrides on top
  for (const ref of refResult) {
    const key = `${ref.category}|${ref.element}|${ref.state}`;
    seen.add(key);

    const override = overrideMap.get(key);
    if (override) {
      merged.push({
        id: ref.id,
        category: ref.category,
        element: ref.element,
        unit: override.unit,
        base_rate: override.base_rate,
        state: ref.state,
        year: override.year,
        source_type: "override",
        source_label: override.source_label,
        default_rate: ref.base_rate,
        override_id: override.id,
        notes: override.notes,
      });
    } else {
      merged.push({
        id: ref.id,
        category: ref.category,
        element: ref.element,
        unit: ref.unit,
        base_rate: ref.base_rate,
        state: ref.state,
        year: ref.year,
        source_type: ref.source_id ? "external" : "default",
        source_label: ref.source_detail ?? "MMC Build Seed Data",
        default_rate: null,
        override_id: null,
        notes: null,
      });
    }
  }

  // Add override-only rates (not in reference data)
  for (const o of overrideResult) {
    const key = `${o.category}|${o.element}|${o.state}`;
    if (!seen.has(key)) {
      merged.push({
        id: o.id,
        category: o.category,
        element: o.element,
        unit: o.unit,
        base_rate: o.base_rate,
        state: o.state,
        year: o.year,
        source_type: "override",
        source_label: o.source_label,
        default_rate: null,
        override_id: o.id,
        notes: o.notes,
      });
    }
  }

  return merged.sort((a, b) => a.category.localeCompare(b.category) || a.element.localeCompare(b.element));
}
