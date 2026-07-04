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
    stripePriceId: process.env.STRIPE_ESSENTIAL_EARLY_PRICE_ID || "",
    standardPriceId: process.env.STRIPE_ESSENTIAL_STD_PRICE_ID || "",
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
    stripePriceId: process.env.STRIPE_PROFESSIONAL_INTRO_PRICE_ID || "",
    standardPriceId: process.env.STRIPE_PROFESSIONAL_STD_PRICE_ID || "",
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
    isCustom: true,
  },
} as const;

export type PlanId = keyof typeof PLANS;

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

export const TRIAL_RUN_LIMIT = 3;
export const TRIAL_DAYS = 14;

export function getPlanByPriceId(priceId: string) {
  if (!priceId) return undefined;
  return Object.values(PLANS).find(
    (p) =>
      (p.stripePriceId && p.stripePriceId === priceId) ||
      ("standardPriceId" in p && p.standardPriceId && p.standardPriceId === priceId),
  );
}

export function getModuleByPriceId(priceId: string) {
  return Object.values(MODULES).find((m) => m.stripePriceId === priceId);
}

export function getModuleTotalPrice(moduleIds: ModuleId[]): number {
  return moduleIds.reduce((sum, id) => sum + MODULES[id].price, 0);
}
