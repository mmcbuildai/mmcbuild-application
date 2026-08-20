import { describe, it, expect } from "vitest";
import { generateDailyReportPdf, type DailyReportData } from "@/lib/reporting/daily-report-pdf";

const emptyReport: DailyReportData = {
  dateLabel: "Thursday, 20 August 2026",
  signups: [],
  newSubscriptions: [],
  cancellations: [],
  activeSubs: 0,
  trialingSubs: 0,
  mrrAud: 0,
  aiSpendUsd: 0,
  userActivity: [],
  orgAiUsage: [],
  stuckUploads: [],
  pastDue: [],
};

const busyReport: DailyReportData = {
  dateLabel: "Thursday, 20 August 2026",
  signups: [{ name: "Jane Smith", org: "Smith Constructions" }],
  newSubscriptions: [{ org: "Smith Constructions", plan: "Growth", status: "trialing" }],
  cancellations: [{ org: "Old Co", plan: "Starter" }],
  activeSubs: 12,
  trialingSubs: 3,
  mrrAud: 4788,
  aiSpendUsd: 12.3456,
  userActivity: [
    {
      user: "Jane Smith",
      org: "Smith Constructions",
      complianceRuns: 4,
      buildRuns: 2,
      quoteRuns: 1,
      projectsCreated: 1,
    },
  ],
  orgAiUsage: [
    {
      org: "Smith Constructions",
      calls: 20,
      tokens: 123456,
      costByProvider: [{ provider: "anthropic", cost: 8.1 }],
    },
  ],
  stuckUploads: [{ org: "Smith Constructions", fileName: "plan.dwg", reason: "unreadable" }],
  pastDue: [{ org: "Old Co", plan: "Starter" }],
};

describe("generateDailyReportPdf", () => {
  it("produces a real PDF (%PDF signature) for a day with no activity", () => {
    const buf = generateDailyReportPdf(emptyReport);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("produces a real PDF for a day with signups, runs, and attention items", () => {
    const buf = generateDailyReportPdf(busyReport);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
