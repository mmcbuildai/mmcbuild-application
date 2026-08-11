import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { PLANS, type PlanId } from "@/lib/stripe/plans";

/**
 * The pricing page and the billing page must render ONE list of plan features.
 *
 * SCRUM-399 (Karthik, 2026-08-11): "the billing page has different
 * information". They kept separate copies, edited independently. The numbers
 * never drifted — both pages had Essential at $49 with 10 runs and 5 uploads —
 * but the wording, order and grouping did, and Professional listed "API access"
 * on one page and not the other.
 *
 * That is the mild version of this failure. The dangerous version is the same
 * mechanism moving a NUMBER, which is what the trial allowance did twice
 * (see tests/unit/legal/commercial-facts.test.ts).
 */

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const PRICING = "src/app/(marketing)/pricing/pricing-client.tsx";
const PLAN_CARD = "src/components/billing/plan-card.tsx";

describe("plan features come from one place", () => {
  it("the pricing page renders PLANS rather than defining its own list", () => {
    const code = withoutComments(read(PRICING));
    for (const id of ["essential", "professional", "enterprise"]) {
      expect(code).toContain(`PLANS.${id}.features`);
    }
  });

  it("the pricing page does not re-declare feature strings inline", () => {
    // The specific shape that caused the drift: a literal array of features
    // sitting in the page next to the plan name.
    const code = withoutComments(read(PRICING));
    expect(code).not.toMatch(/features:\s*\[\s*"/);
  });

  it("both renderers understand the separator marker", () => {
    // "separator" is a rule, not a feature. It is in the shared list, so a
    // renderer that does not special-case it prints the word with a tick next
    // to it — which is what moving the list would have caused if only the
    // pricing page knew about it.
    for (const rel of [PRICING, PLAN_CARD]) {
      expect(withoutComments(read(rel)), rel).toContain('"separator"');
    }
  });

  it("every plan's list is non-empty and starts with its allowance", () => {
    // Guards against a future edit emptying a list, which would render a plan
    // card with no features and look like a styling bug rather than a data one.
    for (const id of Object.keys(PLANS) as PlanId[]) {
      const features = PLANS[id].features;
      expect(features.length, id).toBeGreaterThan(3);
      expect(features[0], id).toMatch(/runs/i);
    }
  });
});
