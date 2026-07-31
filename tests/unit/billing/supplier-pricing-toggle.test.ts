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
  it("defaults to enabled when unset, so merging changes nothing", () => {
    delete process.env.NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED;
    expect(isSupplierPricingEnabled()).toBe(true);
  });

  it("hides pricing only on the literal string 'false'", () => {
    process.env.NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED = "false";
    expect(isSupplierPricingEnabled()).toBe(false);
  });

  it("stays enabled for any other value, including 'true' and typos", () => {
    for (const v of ["true", "FALSE", "0", "no", ""]) {
      process.env.NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED = v;
      expect(isSupplierPricingEnabled(), `value "${v}" should not hide pricing`).toBe(true);
    }
  });
});

describe("what the toggle covers on /mmc-suppliers", () => {
  const page = read("src", "app", "(marketing)", "mmc-suppliers", "page.tsx");

  it("gates the price, the period and the free-months offer together", () => {
    // All three are price claims. Hiding the dollar figure while leaving
    // "First 2 months free" on screen still quotes an offer we can't honour.
    const gated = page.slice(page.indexOf("{showPricing && ("));
    expect(gated).toContain("plan.trial");
    expect(gated).toContain("plan.price");
    expect(gated).toContain("plan.period");
  });

  it("keeps the tier name outside the gate", () => {
    // The listing levels are real; only their prices are not.
    const beforeGate = page.slice(0, page.indexOf("{showPricing && ("));
    expect(beforeGate).toContain("{plan.name}");
  });

  it("keeps the supplier join form ungated — it produces real leads", () => {
    expect(page).toContain("<TradesSupplierForm />");
    const formIdx = page.indexOf("<TradesSupplierForm />");
    const gateIdx = page.indexOf("{showPricing && (");
    expect(formIdx).toBeGreaterThan(gateIdx);
    // The form sits in its own section, not inside the pricing gate.
    expect(page.slice(gateIdx, formIdx)).toContain("</section>");
  });

  it("does not promise 'pricing' from /pricing when it is hidden", () => {
    const pricing = read("src", "app", "(marketing)", "pricing", "pricing-client.tsx");
    expect(pricing).toContain("isSupplierPricingEnabled");
  });
});
