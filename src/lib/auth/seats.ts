/**
 * Seat licensing logic — caps and pricing per subscription tier.
 *
 * Three seat types:
 *   - internal — full org access; counts against the seat cap.
 *   - external — project-scoped uploader; no seat consumed.
 *   - viewer — project-scoped read-only; no seat consumed.
 *
 * Seat caps are enforced application-side (not via Stripe quantity)
 * because Karen is still observing real beta usage before deciding
 * on per-seat pricing semantics. Phase 2 may introduce Stripe sync.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionStatus } from "@/lib/stripe/subscription";

export type SeatType = "internal" | "external" | "viewer";

/**
 * Seat caps per tier. Numbers come from the 2026-05-01 product review.
 * Trial users get the same access as Professional during their trial.
 * `modules` users (mix-and-match per-module subs) get a default of 5.
 */
const SEAT_LIMITS: Record<SubscriptionStatus["tier"], number> = {
  trial: 5,
  basic: 1,
  professional: 5,
  enterprise: Infinity,
  modules: 5,
  expired: 1,
};

/**
 * Per-seat cost on each tier when extra seats become available
 * (Phase 2). Calculated as the published tier price divided by the
 * default seat count, then discounted 20% as the "additional seat"
 * incentive Dennis specified.
 *
 * Returned in AUD per month. Surface this in upgrade prompts.
 * NOT yet enforced — Stripe quantity sync is deferred.
 */
const TIER_PRICE_AUD: Record<SubscriptionStatus["tier"], number | null> = {
  trial: null,
  basic: 149,
  professional: 399,
  enterprise: null,
  modules: null,
  expired: null,
};

const EXTRA_SEAT_DISCOUNT = 0.2;

export function getSeatLimitForTier(tier: SubscriptionStatus["tier"]): number {
  return SEAT_LIMITS[tier] ?? 1;
}

export function getExtraSeatPriceAudPerMonth(
  tier: SubscriptionStatus["tier"],
): number | null {
  const tierPrice = TIER_PRICE_AUD[tier];
  const seatLimit = SEAT_LIMITS[tier];
  if (tierPrice === null || !Number.isFinite(seatLimit) || seatLimit <= 0) {
    return null;
  }
  const baselinePerSeat = tierPrice / seatLimit;
  return Math.round(baselinePerSeat * (1 - EXTRA_SEAT_DISCOUNT));
}

export interface SeatUsage {
  /** Internal members currently in the org. */
  used: number;
  /** Pending invitations for internal seats (counts against cap). */
  pendingInvites: number;
  /** Cap from the current subscription tier. */
  limit: number;
  /** True when used + pending < limit. */
  canAddInternal: boolean;
  tier: SubscriptionStatus["tier"];
}

export async function getOrgSeatUsage(
  orgId: string,
  tier: SubscriptionStatus["tier"],
): Promise<SeatUsage> {
  const admin = createAdminClient();

  const { count: usedCount } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("seat_type", "internal");

  const { count: pendingCount } = await admin
    .from("org_invitations")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("seat_type", "internal")
    .eq("status", "pending");

  const used = usedCount ?? 0;
  const pendingInvites = pendingCount ?? 0;
  const limit = SEAT_LIMITS[tier] ?? 1;
  const canAddInternal = used + pendingInvites < limit;

  return { used, pendingInvites, limit, canAddInternal, tier };
}

export function isSeatTypeProjectScoped(s: SeatType): boolean {
  return s === "external" || s === "viewer";
}
