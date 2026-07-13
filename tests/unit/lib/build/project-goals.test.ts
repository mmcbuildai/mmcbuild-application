import { describe, it, expect } from "vitest";
import {
  parseProjectGoals,
  goalsPromptContext,
} from "@/lib/build/project-goals";

// SCRUM-170: goals are stored pipe-delimited and fed to the optimiser.
describe("parseProjectGoals", () => {
  it("splits on '|', trims, and drops empties", () => {
    expect(parseProjectGoals("Compare cost|Validate compliance")).toEqual([
      "Compare cost",
      "Validate compliance",
    ]);
    expect(parseProjectGoals("  Compare cost |  | Educate  ")).toEqual([
      "Compare cost",
      "Educate",
    ]);
  });

  it("returns [] for non-strings or empty input", () => {
    expect(parseProjectGoals(null)).toEqual([]);
    expect(parseProjectGoals(undefined)).toEqual([]);
    expect(parseProjectGoals("")).toEqual([]);
    expect(parseProjectGoals(123)).toEqual([]);
    expect(parseProjectGoals("|||")).toEqual([]);
  });
});

describe("goalsPromptContext", () => {
  it("returns an empty string when there are no goals (legacy fallback)", () => {
    expect(goalsPromptContext([])).toBe("");
  });

  it("lists the goals and instructs weighting + goal_alignment", () => {
    const ctx = goalsPromptContext(["Compare cost", "Educate"]);
    expect(ctx).toContain("Compare cost");
    expect(ctx).toContain("Educate");
    expect(ctx).toContain("goal_alignment");
    expect(ctx.toLowerCase()).toContain("weight");
  });
});
