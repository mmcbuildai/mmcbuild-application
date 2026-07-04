import { db } from "@/lib/supabase/db";
import {
  PLANS,
  MODULES,
  TRIAL_RUN_LIMIT,
  ALL_MODULE_IDS,
  normalizePlanId,
  type ModuleId,
} from "./plans";

export type SubscriptionStatus = {
  tier: "trial" | "essential" | "professional" | "enterprise" | "modules" | "expired";
  status: "active" | "past_due" | "canceled" | "trialing" | "expired" | "incomplete";
  usageCount: number;
  usageLimit: number;
  canRunCheck: boolean;
  trialEndsAt: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  daysRemaining: number | null;
  activeModules: ModuleId[];
};

export async function getSubscriptionStatus(orgId: string): Promise<SubscriptionStatus> {
  const admin = db();

  // Check for active subscription(s)
  const { data: subs } = await admin
    .from("subscriptions")
    .select("*")
    .eq("org_id", orgId)
    .in("status", ["active", "past_due", "trialing"])
    .order("created_at", { ascending: false });

  if (subs && subs.length > 0) {
    // Collect all active modules across all subscriptions
    const activeModules = new Set<ModuleId>();
    let totalUsageCount = 0;
    let totalUsageLimit = 0;
    let latestPeriodEnd: string | null = null;
    let cancelAtPeriodEnd = false;
    let overallStatus: SubscriptionStatus["status"] = "active";
    let tier: SubscriptionStatus["tier"] = "modules";

    for (const sub of subs) {
      // Resolve the tier, normalising any legacy plan_id (e.g. "basic" → Essential).
      const normalisedPlanId = normalizePlanId(sub.plan_id);
      const plan = PLANS[normalisedPlanId as keyof typeof PLANS];
      if (plan) {
        // Tier subscription — every tier unlocks all modules.
        for (const mod of plan.modules) {
          activeModules.add(mod);
        }
        totalUsageLimit = Math.max(totalUsageLimit, plan.runLimit === Infinity ? 999999 : plan.runLimit);
        tier = normalisedPlanId as SubscriptionStatus["tier"];
      } else {
        // Per-module subscription — plan_id is module id
        const moduleId = sub.plan_id as ModuleId;
        if (ALL_MODULE_IDS.includes(moduleId)) {
          activeModules.add(moduleId);
          const mod = MODULES[moduleId];
          if (mod.runLimit) {
            totalUsageLimit += mod.runLimit;
          }
        }
      }

      totalUsageCount = Math.max(totalUsageCount, sub.usage_count || 0);

      if (sub.current_period_end) {
        if (!latestPeriodEnd || sub.current_period_end > latestPeriodEnd) {
          latestPeriodEnd = sub.current_period_end;
        }
      }

      if (sub.cancel_at_period_end) cancelAtPeriodEnd = true;
      if (sub.status === "past_due") overallStatus = "past_due";
    }

    // Default usage limit if no module sets one
    if (totalUsageLimit === 0) totalUsageLimit = 10;

    return {
      tier,
      status: overallStatus,
      usageCount: totalUsageCount,
      usageLimit: totalUsageLimit,
      canRunCheck: overallStatus === "active" && totalUsageCount < totalUsageLimit,
      trialEndsAt: null,
      periodEnd: latestPeriodEnd,
      cancelAtPeriodEnd,
      daysRemaining: latestPeriodEnd
        ? Math.ceil((new Date(latestPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null,
      activeModules: Array.from(activeModules),
    };
  }

  // No subscription — check trial status
  const { data: org } = await admin
    .from("organisations")
    .select("trial_started_at, trial_ends_at, trial_usage_count")
    .eq("id", orgId)
    .single();

  if (!org) {
    return {
      tier: "expired",
      status: "expired",
      usageCount: 0,
      usageLimit: 0,
      canRunCheck: false,
      trialEndsAt: null,
      periodEnd: null,
      cancelAtPeriodEnd: false,
      daysRemaining: null,
      activeModules: [],
    };
  }

  const trialEndsAt = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const trialExpired = trialEndsAt ? trialEndsAt < new Date() : true;
  const trialUsage = org.trial_usage_count ?? 0;
  const trialDaysRemaining = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  if (trialExpired || trialUsage >= TRIAL_RUN_LIMIT) {
    return {
      tier: "expired",
      status: "expired",
      usageCount: trialUsage,
      usageLimit: TRIAL_RUN_LIMIT,
      canRunCheck: false,
      trialEndsAt: org.trial_ends_at,
      periodEnd: null,
      cancelAtPeriodEnd: false,
      daysRemaining: 0,
      activeModules: [],
    };
  }

  // Trial — all modules unlocked
  return {
    tier: "trial",
    status: "trialing",
    usageCount: trialUsage,
    usageLimit: TRIAL_RUN_LIMIT,
    canRunCheck: true,
    trialEndsAt: org.trial_ends_at,
    periodEnd: null,
    cancelAtPeriodEnd: false,
    daysRemaining: trialDaysRemaining,
    activeModules: [...ALL_MODULE_IDS],
  };
}

export async function checkAndIncrementUsage(orgId: string): Promise<{
  allowed: boolean;
  newCount: number;
  limit: number;
  tier: string;
}> {
  const status = await getSubscriptionStatus(orgId);

  if (!status.canRunCheck) {
    return {
      allowed: false,
      newCount: status.usageCount,
      limit: status.usageLimit,
      tier: status.tier,
    };
  }

  // Atomic increment via SQL function
  const admin = db();
  const { data: newCount } = await admin.rpc("increment_usage", { p_org_id: orgId });

  return {
    allowed: true,
    newCount: newCount ?? status.usageCount + 1,
    limit: status.usageLimit,
    tier: status.tier,
  };
}

export function hasModuleAccess(status: SubscriptionStatus, moduleId: ModuleId): boolean {
  return status.activeModules.includes(moduleId);
}
