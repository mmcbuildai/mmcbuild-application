export type ModuleId = "comply" | "build" | "quote" | "direct" | "train";

export const MODULES = {
  comply: {
    id: "comply" as const,
    name: "MMC Comply",
    tagline: "NCC compliance checking",
    description:
      "Automated NCC compliance checking with AI cross-validation. Upload plans and certifications, get findings in minutes.",
    price: 99,
    runLimit: 10,
    isBase: true,
    href: "/comply",
    features: [
      "AI-powered NCC compliance",
      "Cross-validation (Tier 1 & 2)",
      "10 compliance runs/month",
      "Agentic workflow with 4 tools",
    ],
    stripePriceId: process.env.STRIPE_COMPLY_PRICE_ID || "",
  },
  build: {
    id: "build" as const,
    name: "MMC Build",
    tagline: "Design optimisation",
    description:
      "AI design optimisation for modular and prefab construction. Reduce waste, improve buildability, and get actionable suggestions.",
    price: 79,
    runLimit: null,
    isBase: false,
    href: "/build",
    features: [
      "Design optimisation reports",
      "Buildability scoring",
      "Material waste reduction",
      "MMC suitability analysis",
    ],
    stripePriceId: process.env.STRIPE_BUILD_PRICE_ID || "",
  },
  quote: {
    id: "quote" as const,
    name: "MMC Quote",
    tagline: "Cost estimation",
    description:
      "Agentic cost estimation with 70+ Australian rate benchmarks. Compare traditional vs MMC costs with holding cost calculator.",
    price: 99,
    runLimit: null,
    isBase: false,
    href: "/quote",
    features: [
      "AI cost estimation agent",
      "70+ Australian rate benchmarks",
      "Traditional vs MMC comparison",
      "Holding cost calculator",
    ],
    stripePriceId: process.env.STRIPE_QUOTE_PRICE_ID || "",
  },
  direct: {
    id: "direct" as const,
    name: "MMC Direct",
    tagline: "Trade directory",
    description:
      "Find MMC-capable trades across Australia. Verified professionals with reviews, portfolios, and direct enquiry.",
    price: 49,
    runLimit: null,
    isBase: false,
    href: "/direct",
    features: [
      "Verified trade directory",
      "Search by trade & region",
      "Reviews & portfolios",
      "Direct enquiry system",
    ],
    stripePriceId: process.env.STRIPE_DIRECT_PRICE_ID || "",
  },
  train: {
    id: "train" as const,
    name: "MMC Train",
    tagline: "Training modules",
    description:
      "AI-generated training modules for your team. Upskill on modern methods of construction with auto-generated courses and quizzes.",
    price: 49,
    runLimit: null,
    isBase: false,
    href: "/train",
    features: [
      "AI-generated courses",
      "Auto quizzes & assessments",
      "Team progress tracking",
      "Custom course creation",
    ],
    stripePriceId: process.env.STRIPE_TRAIN_PRICE_ID || "",
  },
} as const;

export const ALL_MODULE_IDS: ModuleId[] = ["comply", "build", "quote", "direct", "train"];

// Subscription TIERS — the confirmed model (mmcbuild.com.au/pricing, 2026-07-04).
// Replaces the old per-module + basic/professional/enterprise pricing. Every
// paid tier unlocks ALL modules; tiers differ only on runs, uploads, and seats.
//
// Each tier carries TWO Stripe prices: `stripePriceId` is the price actually
// charged at checkout (the early-adopter / intro price active during launch),
// and `standardPriceId` is the standard price for when the intro window ends.
// `getPlanByPriceId` matches EITHER, so a subscription bought at either price
// resolves to the same tier.
//
// `uploadLimit` is defined here but NOT yet enforced (no per-period upload
// counter exists today) — enforcement is a tracked follow-up.
//
// ENV VAR NAMES (SCRUM-332). Karthik configured Vercel with MONTHLY/ANNUAL
// names rather than the EARLY/INTRO ones this file originally read, so the
// launch price is read from his name first and falls back to the original.
// Both are accepted deliberately: whichever is already set in an environment
// keeps working, and neither of us has to redo the other's configuration.
//
// ⚠️ The VALUE must be a Stripe **price** id (`price_…`), not a **product** id
// (`prod_…`). They look interchangeable in the dashboard and are not: checkout
// takes a price. A product id here fails the session with "No such price:
// 'prod_…'", which the billing action surfaces verbatim (see billing/actions.ts).
export const PLANS = {
  essential: {
    id: "essential",
    name: "Essential",
    price: 49, // early-adopter price charged now
    standardPrice: 99,
    currency: "aud",
    interval: "month" as const,
    runLimit: 10,
    uploadLimit: 5,
    seatLimit: 1,
    modules: ALL_MODULE_IDS,
    features: [
      "AI-powered whole-of-house NCC compliance",
      "MMC Build & Comply reports",
      "AI Copilot for design, cost & constructability",
      "MMC Directory access",
      "10 combined runs/month · 5 plan uploads/month",
      "Single user · standard email support",
    ],
    stripePriceId:
      process.env.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID ||
      process.env.STRIPE_ESSENTIAL_EARLY_PRICE_ID ||
      "",
    standardPriceId: process.env.STRIPE_ESSENTIAL_STD_PRICE_ID || "",
    annualPrice: 470,
    annualPriceId: process.env.STRIPE_ESSENTIAL_ANNUAL_PRICE_ID || "",
  },
  professional: {
    id: "professional",
    name: "Professional",
    price: 199, // intro price charged now
    standardPrice: 299,
    currency: "aud",
    interval: "month" as const,
    runLimit: 30,
    uploadLimit: 10,
    seatLimit: 5,
    modules: ALL_MODULE_IDS,
    features: [
      "Everything in Essential",
      "30 combined runs/month · 10 plan uploads/month",
      "Multi-user collaboration & role-based permissions",
      "Advanced NCC compliance reporting",
      "API access · integrations roadmap (BIM/SketchUp)",
      "Priority email support",
    ],
    stripePriceId:
      process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID ||
      process.env.STRIPE_PROFESSIONAL_INTRO_PRICE_ID ||
      "",
    standardPriceId: process.env.STRIPE_PROFESSIONAL_STD_PRICE_ID || "",
    annualPrice: 1910,
    annualPriceId: process.env.STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID || "",
    popular: true,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: null,
    standardPrice: null,
    currency: "aud",
    interval: "month" as const,
    runLimit: Infinity,
    uploadLimit: Infinity,
    seatLimit: Infinity,
    modules: ALL_MODULE_IDS,
    features: [
      "Everything in Professional",
      "Unlimited runs & plan uploads",
      "Multi-organisation management",
      "Team training (MMC Train included)",
      "Dedicated account manager · SLA-backed support",
    ],
    stripePriceId: "",
    standardPriceId: "",
    annualPrice: null,
    annualPriceId: "",
    isCustom: true,
  },
} as const;

export type PlanId = keyof typeof PLANS;

/** How often a subscription is billed. */
export type BillingInterval = "month" | "year";

/**
 * Annual billing.
 *
 * Stripe has had live annual prices since 5 August ($470 Essential, $1,910
 * Professional) and the app had no way to sell them — the website advertised
 * annual billing that nothing could take money for. This closes that.
 *
 * ⚠️ `annualPriceId` is read from env and may legitimately be EMPTY. Rather
 * than showing an annual option whose checkout would fail with "No such price",
 * the UI asks `annualBillingAvailable()` and simply does not offer annual when
 * it is not configured. Degrade, don't fake — a missing price id is an operator
 * configuration gap, not something a customer should discover at checkout.
 *
 * The displayed `annualPrice` is a fallback for rendering only. Stripe remains
 * the authority on what is actually charged: the amounts here must match the
 * live prices, and `tests/unit/billing/annual-pricing.test.ts` pins the
 * relationship (annual < 12 × monthly) so a typo that makes annual the more
 * expensive option cannot ship silently.
 */
export function annualPriceIdFor(planId: PlanId): string {
  const plan = PLANS[planId];
  return "annualPriceId" in plan ? plan.annualPriceId : "";
}

/** True when every sellable tier has an annual price configured in Stripe. */
export function annualBillingAvailable(): boolean {
  return SELLABLE_PLAN_IDS.every((id) => annualPriceIdFor(id) !== "");
}

/** Tiers a customer can actually buy self-serve (Enterprise is contact-us). */
export const SELLABLE_PLAN_IDS = ["essential", "professional"] as const;

/**
 * The Stripe price id to charge for a tier on a given interval.
 * Returns "" when that combination is not configured — callers must treat that
 * as "not for sale" rather than passing an empty string to Stripe.
 */
export function priceIdFor(planId: PlanId, interval: BillingInterval): string {
  const plan = PLANS[planId];
  if (interval === "year") return annualPriceIdFor(planId);
  return plan.stripePriceId;
}

/** The displayed amount for a tier on a given interval. */
export function displayPriceFor(
  planId: PlanId,
  interval: BillingInterval,
): number | null {
  const plan = PLANS[planId];
  if (interval === "year") {
    return "annualPrice" in plan ? plan.annualPrice : null;
  }
  return plan.price;
}

/**
 * Whole months saved by paying annually, e.g. 2 for $470 against $49/month.
 * Returns null when either price is missing, so the UI can omit the claim
 * rather than print "save 0 months".
 */
export function annualSavingMonths(planId: PlanId): number | null {
  const monthly = displayPriceFor(planId, "month");
  const annual = displayPriceFor(planId, "year");
  if (!monthly || !annual) return null;
  const saved = monthly * 12 - annual;
  if (saved <= 0) return null;
  return Math.round(saved / monthly);
}

/**
 * Legacy `subscriptions.plan_id` values from before the tier migration
 * (2026-07-04). Existing rows still carry these; normalise them so resolution
 * keeps working. "basic" was the entry tier → Essential.
 */
export const LEGACY_PLAN_ALIASES: Record<string, PlanId> = {
  basic: "essential",
};

/** Map a stored plan_id (possibly legacy) to a current tier id. */
export function normalizePlanId(planId: string): string {
  return LEGACY_PLAN_ALIASES[planId] ?? planId;
}

/**
 * The tier vocabulary `organisations.subscription_tier` accepts.
 *
 * This list is constrained in TWO places — here, and by a CHECK constraint in
 * the database (migration `20260731090000_subscription_tier_essential.sql`).
 * A value present in one and not the other fails the write, and because such a
 * write is easy to leave unchecked it fails silently. That is exactly what
 * happened after the 2026-07-04 tier rename: code wrote 'essential' while the
 * CHECK still only allowed 'basic'. `tests/unit/billing/tier-vocabulary.test.ts`
 * pins the two together so the pair can't drift again.
 *
 * 'basic' is legacy — never written by current code, but still valid for rows
 * created before the rename (see LEGACY_PLAN_ALIASES).
 */
export const ORG_TIER_VALUES = [
  "trial",
  "basic",
  "essential",
  "professional",
  "enterprise",
] as const;

export type OrgTier = (typeof ORG_TIER_VALUES)[number];

/** Map a subscription `plan_id` to the org tier it grants. */
export const PLAN_TO_ORG_TIER: Record<string, OrgTier> = {
  basic: "essential",
  essential: "essential",
  professional: "professional",
  enterprise: "enterprise",
};

/**
 * GST qualifier for displayed prices.
 *
 * Every price in this product is quoted GST-EXCLUSIVE — confirmed by Karthik
 * 2026-07-31: Stripe is configured tax-exclusive, so the $49 tier collects
 * $53.90. An unqualified figure is read by a business buyer as the amount that
 * will leave their account, which it is not, so every displayed price carries
 * this suffix. Single-sourced so a new price surface can't quietly omit it.
 *
 * MMC Build sells in AUD to Australian buyers only. If that ever changes, the
 * label has to follow the BUYER's jurisdiction — VAT in the UK/EU, sales tax in
 * the US, GST/HST in Canada — and this becomes a lookup, not a constant.
 */
export const TAX_QUALIFIER = "+ GST";

/** Page-level disclosure to sit alongside a set of prices. */
export const TAX_DISCLOSURE =
  "All prices are in AUD and exclude GST. GST is calculated and added at checkout.";

/**
 * What a 14-day trial includes.
 *
 * Karen's decision, SCRUM-366 D1 (4 August, restated 7 August): the trial gets
 * the **Essential allowance** rather than the old 3-run cap.
 *
 *   "give the trial the Essential allowance — 10 runs and 5 uploads for the
 *    14 days"
 *
 * The 3-run cap and a "free for 14 days" promise were different promises:
 * someone who used three runs on day two had twelve days of a product that did
 * nothing, and — under the card-at-signup model — was then charged $49. That is
 * a chargeback, not a customer. Matching the trial to the Essential allowance
 * means the trial IS the product, which is the point of taking a card up front.
 *
 * Deliberately equal to PLANS.essential.runLimit / uploadLimit. If those change,
 * these should follow — `tests/unit/billing/trial-allowance.test.ts` pins them
 * together so the pair cannot drift.
 */
/**
 * Re-exported, not declared. The home is `@/lib/legal/commercial-facts`, which
 * has no imports so it can be byte-identical in the marketing repo too.
 *
 * Kept exported from here because a dozen files already import them from this
 * module, and rewriting those call sites would be churn with no safety gained —
 * the point is one DECLARATION, not one import path.
 */
export {
  TRIAL_RUN_LIMIT,
  TRIAL_UPLOAD_LIMIT,
  TRIAL_DAYS,
} from "@/lib/legal/commercial-facts";

/**
 * Resolve a Stripe price id back to the tier it grants.
 *
 * Must match EVERY price a tier can be bought at — launch, standard and annual.
 * A price the webhook cannot resolve means a real customer pays and the
 * subscription lands with no tier, so they get nothing for their money. Adding
 * annual prices without adding them here would have done exactly that.
 */
export function getPlanByPriceId(priceId: string) {
  if (!priceId) return undefined;
  return Object.values(PLANS).find(
    (p) =>
      (p.stripePriceId && p.stripePriceId === priceId) ||
      ("standardPriceId" in p && p.standardPriceId && p.standardPriceId === priceId) ||
      ("annualPriceId" in p && p.annualPriceId && p.annualPriceId === priceId),
  );
}

export function getModuleByPriceId(priceId: string) {
  return Object.values(MODULES).find((m) => m.stripePriceId === priceId);
}

export function getModuleTotalPrice(moduleIds: ModuleId[]): number {
  return moduleIds.reduce((sum, id) => sum + MODULES[id].price, 0);
}
