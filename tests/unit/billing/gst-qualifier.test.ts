import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TAX_QUALIFIER, TAX_DISCLOSURE } from "@/lib/stripe/plans";

// Codified 2026-07-31. MMC Build quotes every price GST-EXCLUSIVE (Karthik:
// "The current setup I have on Stripe is exclusive of GST, so comes up to $53
// and change"), but GST appeared nowhere in the product — a business buyer
// reads an unqualified $49 as the amount that will leave their account.
//
// Two halves, and shipping either alone is the failure:
//   - DISPLAY: every price surface carries "+ GST".
//   - COLLECTION: the checkout session sets automatic_tax, because configuring
//     the Stripe product as tax-exclusive does nothing to a session that does
//     not ask for tax. Displaying "+ GST" while charging a flat $49 is worse
//     than saying nothing.

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

/** Surfaces that render a price for OUR product. */
const PRICE_SURFACES = [
  ["src", "components", "billing", "plan-card.tsx"],
  ["src", "app", "(marketing)", "pricing", "pricing-client.tsx"],
  ["src", "app", "(marketing)", "mmc-suppliers", "page.tsx"],
  ["src", "app", "(dashboard)", "dashboard", "dashboard-modules.tsx"],
];

describe("GST qualifier on displayed prices", () => {
  it.each(PRICE_SURFACES)("%s renders the shared qualifier", (...parts) => {
    const src = read(...parts);
    expect(
      src.includes("TAX_QUALIFIER"),
      `${parts.join("/")} shows a price but never references TAX_QUALIFIER`,
    ).toBe(true);
  });

  it("keeps the qualifier and disclosure single-sourced and non-empty", () => {
    expect(TAX_QUALIFIER).toMatch(/GST/);
    expect(TAX_DISCLOSURE).toMatch(/exclude GST/i);
  });

  it("does not hardcode a price literal next to the qualifier", () => {
    // Prices must come from PLANS so a repriced tier can't leave a stale
    // literal behind — the dashboard carried "$49/mo" and "$199/mo" as text
    // until this change.
    const src = read("src", "app", "(dashboard)", "dashboard", "dashboard-modules.tsx");
    expect(src).not.toMatch(/\$49\/mo/);
    expect(src).not.toMatch(/\$199\/mo/);
  });
});

describe("GST collection at checkout", () => {
  const actions = read("src", "app", "(dashboard)", "billing", "actions.ts");

  it("enables automatic tax on the checkout session", () => {
    expect(
      actions,
      "checkout session must set automatic_tax, or the displayed '+ GST' is a lie",
    ).toMatch(/automatic_tax:\s*\{\s*enabled:\s*true\s*\}/);
  });

  it("collects the address Stripe Tax needs to determine the rate", () => {
    expect(actions).toMatch(/billing_address_collection:\s*"required"/);
    expect(actions).toMatch(/customer_update:\s*\{[^}]*address:\s*"auto"/);
  });

  it("lets AU business buyers record an ABN on the tax invoice", () => {
    expect(actions).toMatch(/tax_id_collection:\s*\{\s*enabled:\s*true\s*\}/);
  });

  it("explains a tax-config failure instead of returning a dead button", () => {
    // An unconfigured Stripe Tax account makes session creation throw. This
    // repo's standing rule is that a real cause is never masked by a generic
    // downstream error.
    expect(actions).toMatch(/Stripe Tax/);
  });
});
