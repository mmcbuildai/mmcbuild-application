#!/usr/bin/env node
/**
 * setup-stripe-products.mjs
 *
 * Idempotently create the MMC subscription-TIER products + AUD prices in Stripe
 * and print the price IDs in env-var form for the mmcbuild-application project.
 *
 * Tiers confirmed by Karen/Dennis from mmcbuild.com.au/pricing +
 * /trades-and-suppliers (2026-07-04). This REPLACES the earlier per-module
 * model (Comply/Build/Quote/Direct/Train), which never matched the live site.
 *
 *   USER TIERS
 *     Essential      A$49/mo  (early adopter)  + A$99/mo  (standard)
 *     Professional   A$199/mo (intro)          + A$299/mo (standard)
 *     Enterprise     custom — product only, no price (contact sales)
 *
 *   TRADES & SUPPLIERS TIERS
 *     Verified Suppliers   A$199/mo (directory listing, no lead referrals)
 *     Growth Partner       A$299/mo  + A$250 one-off per QUALIFIED LEAD
 *                          (Founder rate; billed only on a verified lead)
 *
 * The A$250/lead price is a ONE-OFF (non-recurring) price created here so the
 * lead-billing flow can reference a stable price ID, but CHARGING it is
 * verification-gated and handled by the app, not this script.
 *
 * Usage (test mode for MVP):
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/setup-stripe-products.mjs
 *
 * Re-runnable: matches products by metadata.mmc_plan and prices by
 * (metadata.mmc_price_kind + amount + interval), reusing existing ones instead
 * of creating duplicates. Safe to run again. It does NOT archive the old
 * per-module products — archive those by hand in the Stripe dashboard once the
 * new price IDs are live.
 */
import Stripe from "stripe";

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error(
    "Missing STRIPE_SECRET_KEY.\n" +
      "Run: STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe-products.mjs"
  );
  process.exit(1);
}

const stripe = new Stripe(KEY);
const live = KEY.startsWith("sk_live_");
const CURRENCY = "aud";

/**
 * One product per tier. `prices` is a list of the prices to ensure under it.
 * kind = a stable metadata tag so re-runs match the right price; env = the
 * env-var name to emit; interval "month" = recurring, "once" = one-off.
 */
const TIERS = [
  {
    plan: "essential",
    name: "MMC Essential",
    description:
      "Individual builders, architects, designers, early adopters. 10 combined Build+Comply runs/mo, 5 plan uploads/mo.",
    prices: [
      { kind: "early", amount: 49, interval: "month", env: "STRIPE_ESSENTIAL_EARLY_PRICE_ID" },
      { kind: "standard", amount: 99, interval: "month", env: "STRIPE_ESSENTIAL_STD_PRICE_ID" },
    ],
  },
  {
    plan: "professional",
    name: "MMC Professional",
    description:
      "Active builders, architects & consultants managing multiple projects. 30 combined Build+Comply runs/mo, 10 plan uploads/mo, multi-user.",
    prices: [
      { kind: "intro", amount: 199, interval: "month", env: "STRIPE_PROFESSIONAL_INTRO_PRICE_ID" },
      { kind: "standard", amount: 299, interval: "month", env: "STRIPE_PROFESSIONAL_STD_PRICE_ID" },
    ],
  },
  {
    plan: "enterprise",
    name: "MMC Enterprise",
    description:
      "Tier 1 & 2 builders and large firms. Unlimited runs & uploads, multi-org, custom pricing (contact sales).",
    prices: [], // custom — no Stripe price
  },
  {
    plan: "verified_suppliers",
    name: "MMC Verified Suppliers",
    description:
      "Trades & suppliers: verified directory profile, national visibility, access to MMC Build/Comply/Train. No lead referrals.",
    prices: [
      { kind: "standard", amount: 199, interval: "month", env: "STRIPE_VERIFIED_SUPPLIER_PRICE_ID" },
    ],
  },
  {
    plan: "growth_partner",
    name: "MMC Growth Partner",
    description:
      "Trades & suppliers: everything in Verified plus AI recommendations, qualified lead referrals, priority positioning, daily lead reporting.",
    prices: [
      { kind: "standard", amount: 299, interval: "month", env: "STRIPE_GROWTH_PARTNER_PRICE_ID" },
      // One-off Founder rate charged per qualified lead (verification-gated by the app).
      { kind: "lead", amount: 250, interval: "once", env: "STRIPE_GROWTH_PARTNER_LEAD_PRICE_ID" },
    ],
  },
];

async function findProduct(plan) {
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.metadata?.mmc_plan === plan) return p;
  }
  return null;
}

async function findPrice(productId, { kind, amount, interval }) {
  const amountCents = amount * 100;
  for await (const pr of stripe.prices.list({ product: productId, active: true, limit: 100 })) {
    const intervalMatch =
      interval === "once"
        ? pr.recurring == null
        : pr.recurring?.interval === interval;
    if (
      pr.unit_amount === amountCents &&
      pr.currency === CURRENCY &&
      intervalMatch &&
      pr.metadata?.mmc_price_kind === kind
    ) {
      return pr;
    }
  }
  return null;
}

async function main() {
  console.log(`Stripe mode: ${live ? "LIVE ⚠️" : "TEST"}\n`);
  const out = [];

  for (const t of TIERS) {
    let product = await findProduct(t.plan);
    if (product) {
      console.log(`= product exists  ${t.name}  (${product.id})`);
    } else {
      product = await stripe.products.create({
        name: t.name,
        description: t.description,
        metadata: { mmc_plan: t.plan },
      });
      console.log(`+ created product ${t.name}  (${product.id})`);
    }

    for (const p of t.prices) {
      let price = await findPrice(product.id, p);
      if (price) {
        console.log(`  = price exists  A$${p.amount}${p.interval === "once" ? " one-off" : "/mo"} [${p.kind}]  (${price.id})`);
      } else {
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: p.amount * 100,
          currency: CURRENCY,
          ...(p.interval === "once" ? {} : { recurring: { interval: p.interval } }),
          metadata: { mmc_plan: t.plan, mmc_price_kind: p.kind },
        });
        console.log(`  + created price A$${p.amount}${p.interval === "once" ? " one-off" : "/mo"} [${p.kind}]  (${price.id})`);
      }
      out.push(`${p.env}=${price.id}`);
    }
  }

  console.log(
    "\n--- paste these into mmcbuild-application Vercel (Production + Preview) ---\n"
  );
  console.log(out.join("\n"));
  console.log(
    "\nNext: wire these price IDs into src/lib/stripe/plans.ts and align the\n" +
      "entitlement limits (runs/uploads/seats), enforced at BOTH middleware and\n" +
      "the server action. Tracked in SCRUM-332.\n"
  );
}

main().catch((e) => {
  console.error("Stripe setup failed:", e.message);
  process.exit(1);
});
