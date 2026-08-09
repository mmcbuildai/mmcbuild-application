import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSupplierPricingEnabled } from "@/lib/pricing/supplier-pricing";

// Supplier tiers are not in Go Live 1 (2026-07-31), and /mmc-suppliers
// advertises "$99 Basic Directory" / "$499 Professional Directory" — figures
// that match neither the confirmed model ($199 / $299) nor anything buyable,
// since plans.ts reads no supplier price ID. A public page quoting prices that
// can't be paid is the problem; the join form on the same page produces real
// supplier leads, so the page stays and only the price claims are gated.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const ORIGINAL = process.env.NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED;
  else process.env.NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED = ORIGINAL;
});

describe("isSupplierPricingEnabled", () => {
  // ⚠️ INVERTED 2026-08-09. These three tests previously pinned the opposite
  // default — enabled-unless-"false" — which was correct at merge time (merging
  // the gate had to change nothing) and wrong to leave standing. This flag
  // wrongly ON publishes prices nobody can pay, and it only took the ABSENCE of
  // a variable: a preview environment or a tidied env list would have quoted
  // "$99 Basic Directory" to the public with nothing erroring.
  //
  // No production change: both Vercel projects already set "false", and "false"
  // is still not "true".

  it("defaults to DISABLED when unset — the safe state is not quoting a price", () => {
    delete process.env.NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED;
    expect(isSupplierPricingEnabled()).toBe(false);
  });

  it("shows pricing only on the literal string 'true'", () => {
    process.env.NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED = "true";
    expect(isSupplierPricingEnabled()).toBe(true);
  });

  it("stays hidden for every other value, including 'false' and typos", () => {
    // Matches isPurchaseCtaEnabled: a commercial door must not open on a typo,
    // an empty string, or a case variant.
    for (const v of ["false", "TRUE", "True", "1", "yes", "", " true"]) {
      process.env.NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED = v;
      expect(isSupplierPricingEnabled(), `value "${v}" must not show pricing`).toBe(false);
    }
  });
});

describe("what the toggle covers on /mmc-suppliers", () => {
  const page = read("src", "app", "(marketing)", "mmc-suppliers", "page.tsx");

  // The gate expression gained a second condition on 2026-08-09 (see below), so
  // these anchor on the prefix rather than the exact string.
  const GATE = "{showPricing && plan.price && (";

  it("gates the price, the period and the free-months offer together", () => {
    // All three are price claims. Hiding the dollar figure while leaving
    // "First 2 months free" on screen still quotes an offer we can't honour.
    const gated = page.slice(page.indexOf(GATE));
    expect(gated).toContain("plan.trial");
    expect(gated).toContain("plan.price");
    expect(gated).toContain("plan.period");
  });

  it("needs a REAL figure as well as the flag — the switch alone cannot resurrect one", () => {
    // The figures themselves are gone, not merely hidden. Hiding them behind a
    // flag was the wrong stopping point: "$99" and "First 2 months free" matched
    // neither the confirmed $199/$299 model nor anything purchasable, and behind
    // a switch they sat one variable from being live, for someone who would have
    // no way of knowing they were never real. Same reasoning as the partner
    // logos on SCRUM-376.
    //
    // ⚠️ These assert FIELD ASSIGNMENTS, not bare phrases. The first version
    // checked for the offer phrase anywhere in the file and failed on the
    // comment that explains why the offer was removed — the third time in one
    // day that an honest note about a deleted claim tripped a check looking for
    // it. A test that punishes the explanation teaches people to delete the
    // explanation, so it asserts the DECLARATION is gone instead.
    expect(page).toContain(GATE);
    expect(page).not.toContain('price: "$');
    expect(page).not.toContain('trial: "');
    expect(page).not.toContain('period: "');
  });

  it("keeps the tier name outside the gate", () => {
    // The listing levels are real; only their prices are not.
    const beforeGate = page.slice(0, page.indexOf(GATE));
    expect(beforeGate).toContain("{plan.name}");
  });

  it("keeps the supplier join form ungated — it produces real leads", () => {
    expect(page).toContain("<TradesSupplierForm />");
    const formIdx = page.indexOf("<TradesSupplierForm />");
    const gateIdx = page.indexOf(GATE);
    expect(formIdx).toBeGreaterThan(gateIdx);
    // The form sits in its own section, not inside the pricing gate.
    expect(page.slice(gateIdx, formIdx)).toContain("</section>");
  });

  it("does not promise 'pricing' from /pricing when it is hidden", () => {
    const pricing = read("src", "app", "(marketing)", "pricing", "pricing-client.tsx");
    expect(pricing).toContain("isSupplierPricingEnabled");
  });
});
