import { describe, it, expect } from "vitest";
import {
  computeMmcBuildup,
  MMC_FALLBACK_RATES,
  MMC_MARGIN_RATE,
} from "@/lib/quote/mmc-buildup";

describe("computeMmcBuildup", () => {
  it("anchors the module supply on gross floor area", () => {
    const { lines } = computeMmcBuildup(100);
    const module = lines.find((l) => l.cost_category === "mmc_module");
    expect(module).toBeDefined();
    expect(module!.quantity).toBe(100);
    expect(module!.rate).toBe(MMC_FALLBACK_RATES.moduleSupply);
    expect(module!.mmc_total).toBe(100 * MMC_FALLBACK_RATES.moduleSupply);
  });

  it("total = subtotal + builder margin", () => {
    const { subtotal, margin, total } = computeMmcBuildup(93);
    expect(margin).toBe(Math.round(subtotal * MMC_MARGIN_RATE));
    expect(total).toBe(subtotal + margin);
  });

  it("lands a credible finished $/m² near the market benchmark (~$3,500/m²)", () => {
    // 93 m² 2-bed is the canonical sourced example; the build-up should sit in a
    // believable turnkey band, NOT the per-trade-guess nonsense it replaces.
    const { total } = computeMmcBuildup(93);
    const perSqm = total / 93;
    expect(perSqm).toBeGreaterThan(2800);
    expect(perSqm).toBeLessThan(4200);
  });

  it("prefers live DB rates over fallbacks", () => {
    const { lines } = computeMmcBuildup(100, {
      "Volumetric module supply (ex-factory, delivered)": 2400,
    });
    const module = lines.find((l) => l.cost_category === "mmc_module")!;
    expect(module.rate).toBe(2400);
    expect(module.mmc_total).toBe(240000);
  });

  it("ignores zero/invalid live rates and uses the fallback", () => {
    const { lines } = computeMmcBuildup(100, {
      "Volumetric module supply (ex-factory, delivered)": 0,
    });
    const module = lines.find((l) => l.cost_category === "mmc_module")!;
    expect(module.rate).toBe(MMC_FALLBACK_RATES.moduleSupply);
  });

  it("adds landscaping only when requested", () => {
    const without = computeMmcBuildup(100);
    const withLand = computeMmcBuildup(100, {}, { landscaping: true });
    const hasLand = (ls: { element_description: string }[]) =>
      ls.some((l) => l.element_description.includes("Landscaping"));
    expect(hasLand(without.lines)).toBe(false);
    expect(hasLand(withLand.lines)).toBe(true);
    expect(withLand.total).toBeGreaterThan(without.total);
  });

  it("scales footing count with floor area (min 8)", () => {
    const small = computeMmcBuildup(20).lines.find((l) => l.element_description.includes("footings"))!;
    const large = computeMmcBuildup(220).lines.find((l) => l.element_description.includes("footings"))!;
    expect(small.quantity).toBe(8); // floor of the min
    expect(large.quantity).toBe(40); // 220 / 5.5
  });
});
