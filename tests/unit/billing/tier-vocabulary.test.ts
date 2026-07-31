import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ORG_TIER_VALUES, PLAN_TO_ORG_TIER, PLANS } from "@/lib/stripe/plans";

// Regression (2026-07-31): `organisations.subscription_tier` was constrained by
// 00025_billing.sql to ('trial','basic','professional','enterprise'), which
// predates the 2026-07-04 tier rename (Basic -> Essential). sync-stripe-
// subscription wrote 'essential', so the update was rejected by the CHECK — and
// its error was discarded, so it failed silently: the subscriptions row landed,
// the org stayed on 'trial', and a paying customer's dashboard kept showing the
// trial badge. Zero Stripe webhooks in production is the only reason no real
// customer hit it.
//
// The failure mode is vocabulary DRIFT between application code and a DB CHECK
// constraint, so the guard is a drift test rather than a value assertion: every
// tier the code can write must be accepted by the constraint that is actually
// in force.

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/**
 * The subscription_tier CHECK constraint currently in force = the one in the
 * LAST migration (by filename order, which is apply order) that defines one.
 */
function activeTierCheckClause(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let clause: string | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    // Match `CHECK (subscription_tier IN ( ... ))` in either the inline
    // ADD COLUMN form or the standalone ADD CONSTRAINT form.
    const matches = sql.matchAll(
      /CHECK\s*\(\s*subscription_tier\s+IN\s*\(([^)]*)\)/gi,
    );
    for (const m of matches) clause = m[1];
  }

  if (clause === null) {
    throw new Error(
      "No subscription_tier CHECK constraint found in supabase/migrations — " +
        "if the constraint was intentionally dropped, delete this test.",
    );
  }
  return clause;
}

function allowedTiersInDb(): string[] {
  return Array.from(activeTierCheckClause().matchAll(/'([^']+)'/g)).map(
    (m) => m[1],
  );
}

describe("subscription tier vocabulary", () => {
  it("allows every tier the code can write to organisations.subscription_tier", () => {
    const allowed = allowedTiersInDb();
    for (const tier of ORG_TIER_VALUES) {
      expect(allowed, `DB CHECK constraint rejects tier "${tier}"`).toContain(
        tier,
      );
    }
  });

  it("accepts 'essential' — the value the 2026-07-04 rename introduced", () => {
    expect(allowedTiersInDb()).toContain("essential");
  });

  it("still accepts the legacy 'basic' tier so pre-rename rows stay valid", () => {
    expect(allowedTiersInDb()).toContain("basic");
  });

  it("maps every plan_id sync-stripe-subscription can receive to a valid tier", () => {
    for (const [planId, tier] of Object.entries(PLAN_TO_ORG_TIER)) {
      expect(
        ORG_TIER_VALUES,
        `plan_id "${planId}" maps to unknown tier "${tier}"`,
      ).toContain(tier);
    }
  });

  it("maps every current plan id, so no live tier falls back to Essential by accident", () => {
    for (const planId of Object.keys(PLANS)) {
      expect(
        Object.keys(PLAN_TO_ORG_TIER),
        `PLANS has "${planId}" but PLAN_TO_ORG_TIER does not map it`,
      ).toContain(planId);
    }
  });

  it("falls back to 'trial' on cancellation — a valid tier", () => {
    expect(ORG_TIER_VALUES).toContain("trial");
  });
});
