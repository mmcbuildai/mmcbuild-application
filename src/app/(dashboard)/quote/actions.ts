"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { inngest } from "@/lib/inngest/client";

export async function requestCostEstimation(
  projectId: string,
  planId: string,
  region?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return { error: "Profile not found" };
  }

  // Cross-tenant isolation (SCRUM-340): db() below bypasses RLS, so prove the
  // projectId belongs to the caller's org BEFORE any project-scoped query —
  // otherwise a foreign projectId leaks the other org's in-flight estimate id
  // via the duplicate-run guard.
  const { data: ownerProject } = await db()
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .maybeSingle();
  if (
    !ownerProject ||
    (ownerProject as { org_id: string }).org_id !== profile.org_id
  ) {
    return { error: "Project not found" };
  }

  // Duplicate-run guard — don't spawn (or charge for) a second estimate while
  // one is already running for this project (mirrors the Comply guard;
  // re-clicking Run while the progress shows elsewhere burned a wasted run).
  {
    const { data: inFlight } = await db()
      .from("cost_estimates")
      .select("id")
      .eq("project_id", projectId)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inFlight) {
      return {
        error: "already_running",
        estimateId: (inFlight as { id: string }).id,
        message: "A cost estimate is already running for this project.",
      };
    }
  }

  // Create cost estimate record
  const { data: estimate, error } = await db()
    .from("cost_estimates")
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      plan_id: planId,
      status: "queued",
      region: region ?? "NSW",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !estimate) {
    return { error: `Failed to create cost estimate: ${(error as { message: string })?.message}` };
  }

  // Fire Inngest event
  await inngest.send({
    name: "cost/estimation.requested",
    data: {
      projectId,
      planId,
    },
  });

  return { estimateId: (estimate as { id: string }).id };
}

export async function getCostReport(estimateId: string) {
  // Cross-tenant isolation (SCRUM-340): db() bypasses RLS, so this report must
  // be scoped to the caller's org — otherwise any estimateId returns another
  // org's cost report. Authenticate, resolve the caller's org, and reject an
  // estimate that isn't theirs with the same "not found" message.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated", estimate: null, lineItems: [] };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) {
    return { error: "Profile not found", estimate: null, lineItems: [] };
  }

  const { data: estimate, error: estError } = await db()
    .from("cost_estimates")
    .select("id, project_id, org_id, plan_id, status, summary, stage, total_traditional, total_mmc, total_savings_pct, region, traditional_duration_weeks, mmc_duration_weeks, started_at, completed_at, created_at")
    .eq("id", estimateId)
    .single();

  if (estError || !estimate) {
    return { error: "Cost estimate not found", estimate: null, lineItems: [] };
  }

  if ((estimate as { org_id: string }).org_id !== profile.org_id) {
    return { error: "Cost estimate not found", estimate: null, lineItems: [] };
  }

  const { data: lineItems } = await db()
    .from("cost_line_items")
    .select("*")
    .eq("estimate_id", estimateId)
    .order("sort_order", { ascending: true });

  return { estimate, lineItems: lineItems ?? [] };
}

export async function getProjectCostEstimates(projectId: string) {
  // Cross-tenant isolation (SCRUM-340): db() bypasses RLS, so scope this list to
  // the caller's org — a foreign projectId must not return another org's
  // estimates (which carry dollar totals + savings figures).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return [];

  const { data } = await db()
    .from("cost_estimates")
    .select("id, status, summary, total_traditional, total_mmc, total_savings_pct, created_at, completed_at")
    .eq("project_id", projectId)
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getHoldingCostVariables(estimateId: string) {
  const { data } = await db()
    .from("holding_cost_variables")
    .select("*")
    .eq("estimate_id", estimateId)
    .single();

  return data as {
    id: string;
    estimate_id: string;
    weekly_finance_cost: number;
    weekly_site_costs: number;
    weekly_insurance: number;
    weekly_opportunity_cost: number;
    weekly_council_fees: number;
    custom_items: { label: string; amount: number }[];
    updated_at: string;
    created_at: string;
  } | null;
}

export async function saveHoldingCostVariables(
  estimateId: string,
  vars: {
    weekly_finance_cost: number;
    weekly_site_costs: number;
    weekly_insurance: number;
    weekly_opportunity_cost: number;
    weekly_council_fees: number;
    custom_items: { label: string; amount: number }[];
  }
) {
  const { error } = await db()
    .from("holding_cost_variables")
    .upsert(
      {
        estimate_id: estimateId,
        ...vars,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "estimate_id" }
    );

  if (error) {
    return { error: (error as { message: string }).message };
  }

  return { success: true };
}
