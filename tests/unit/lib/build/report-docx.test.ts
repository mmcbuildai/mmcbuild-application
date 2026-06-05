import { describe, it, expect } from "vitest";
import { generateBuildDocx } from "@/lib/build/report-docx";

// SCRUM-192 regression: the Build "Export Word" button sends ?format=docx but
// the route always returned a PDF because no docx generator existed for Build.
// This pins that generateBuildDocx produces a real .docx (zip / "PK" magic).

const sample = {
  projectName: "Sample House",
  projectAddress: "1 Test St, Sydney NSW",
  summary: "Optimisation summary.",
  completedAt: new Date("2026-01-01").toISOString(),
  suggestions: [
    {
      technology_category: "wall_systems",
      current_approach: "Brick veneer",
      suggested_alternative: "SIP panels",
      benefits: "Faster install, better thermal performance.",
      estimated_time_savings: 20,
      estimated_cost_savings: 10,
      estimated_waste_reduction: 30,
      implementation_complexity: "low",
      confidence: 0.8,
    },
  ],
};

describe("generateBuildDocx (SCRUM-192)", () => {
  it("produces a non-empty Word document (zip signature)", async () => {
    const buf = await generateBuildDocx(sample);
    expect(buf.length).toBeGreaterThan(0);
    // .docx is a zip archive — first two bytes are 'P','K' (0x50, 0x4B).
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("handles an empty suggestions list without throwing", async () => {
    const buf = await generateBuildDocx({ ...sample, suggestions: [] });
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(0x50);
  });
});
