import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createCheckoutSession } from "../actions";
import {
  ATTRIBUTION_COOKIE,
  parseAttribution,
} from "@/lib/attribution/first-touch";
import type { BillingInterval, PlanId } from "@/lib/stripe/plans";

/**
 * The step that was missing between sign-up and payment.
 *
 * WHY THIS EXISTS
 * `createCheckoutSession` has been correct since 8 August — subscription mode,
 * a 14-day trial, and `payment_method_collection: "always"` so a card is
 * captured up front (Karen's Option A, SCRUM-366). It was only ever reachable
 * from the billing page, i.e. from INSIDE an account that already existed.
 *
 * Every purchase call-to-action on both websites — all 13 pages, every plan
 * card — pointed at `/signup`, which takes no card and drops the visitor on the
 * dashboard with a free 14-day trial granted by a database default (migration
 * 00027). So there was no route from any price on any page to Stripe.
 *
 * Measured 2026-08-13: zero checkout sessions in the live Stripe account over
 * 48 hours, the most recent subscription row dated 8 August, and the first real
 * external sign-up since launch (Stratus Building Design) sitting on ten free
 * runs having never seen a card field. Advertising had been running since the
 * 12th into a funnel that could not take money.
 *
 * WHAT IT DOES
 * Sign-up now redirects here instead of `/dashboard`. This creates the checkout
 * session for the chosen plan and sends the visitor to Stripe.
 *
 * ⚠️ A BARE `/signup` WITH NO PLAN STILL ENDS UP HERE, on Essential. That is
 * deliberate: the failure being fixed is a door that opens when nobody selects
 * anything, so defaulting to "no checkout" would leave it open for exactly the
 * visitor who typed the URL directly.
 */

/** Tiers with a self-serve price. Enterprise is quoted, so it never lands here. */
const SELLABLE: readonly PlanId[] = ["essential", "professional"] as const;

const DEFAULT_PLAN: PlanId = "essential";

export default async function BillingStartPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const params = await searchParams;

  // Unknown or absent plan falls back to Essential rather than erroring. Someone
  // who has just handed over their details must not meet a validation message.
  const plan: PlanId = SELLABLE.includes(params.plan as PlanId)
    ? (params.plan as PlanId)
    : DEFAULT_PLAN;

  const interval: BillingInterval = params.interval === "year" ? "year" : "month";

  /*
   * The campaign that produced this purchase, read from the first-touch cookie
   * and carried onto the Stripe subscription and customer.
   *
   * This is the only point in the flow where it is BOTH available and about to
   * become revenue: the cookie is scoped to `.mmcbuild.com.au` so it survives
   * the marketing-site hop, and this request is the one that creates the
   * subscription. Attribution previously stopped at the HubSpot contact, so
   * "which advertisement produced an enquiry" was answerable and "which
   * produced a paying customer" was not.
   */
  const jar = await cookies();
  const attribution = parseAttribution(jar.get(ATTRIBUTION_COOKIE)?.value);

  const result = await createCheckoutSession(plan, interval, attribution);

  // `redirect()` throws to unwind the request, so it must sit outside any
  // try/catch — and after the await, never inside it.
  if ("url" in result && result.url) {
    redirect(result.url);
  }

  // Checkout could not be created (Stripe misconfiguration, an existing
  // subscription, an unconfigured annual price). Send them to billing with the
  // real reason rather than a dead end: the account exists and is usable, and
  // the plan buttons there are the second way to pay.
  const reason =
    "error" in result && result.error
      ? result.error
      : "Could not start checkout. Your account is ready — choose a plan below.";
  redirect(`/billing?error=${encodeURIComponent(reason)}`);
}
