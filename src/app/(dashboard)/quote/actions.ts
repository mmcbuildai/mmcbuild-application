"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

function db() {
  return createAdminClient() as unknown as AnyDb;
}

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
  const { data: estimate, error: estError } = await db()
    .from("cost_estimates")
    .select("id, project_id, org_id, plan_id, status, summary, total_traditional, total_mmc, total_savings_pct, region, traditional_duration_weeks, mmc_duration_weeks, started_at, completed_at, created_at")
    .eq("id", estimateId)
    .single();

  if (estError || !estimate) {
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
  const { data } = await db()
    .from("cost_estimates")
    .select("id, status, summary, total_traditional, total_mmc, total_savings_pct, created_at, completed_at")
    .eq("project_id", projectId)
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
