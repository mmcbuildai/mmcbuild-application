import { describe, it, expect } from "vitest";
import { generateDailyReportPdf, type DailyReportData } from "@/lib/reporting/daily-report-pdf";

const baseLifetime: DailyReportData["lifetime"] = {
  complianceRuns: 18,
  buildRuns: 33,
  quoteRuns: 18,
  plansUploaded: 33,
  projectsCreated: 48,
  totalUsers: 63,
  totalOrgs: 45,
  aiCalls: 5897,
  aiSpendUsd: 11619.28,
};

const baseTrend: DailyReportData["trend7dAvg"] = {
  signups: 1.4,
  newSubscriptions: 0.3,
  cancellations: 0.1,
  totalRuns: 4.2,
  aiSpendUsd: 25.5,
};

const emptyReport: DailyReportData = {
  dateLabel: "Thursday, 20 August 2026",
  generatedAtLabel: "20 Aug 2026, 9:00 pm",
  signups: [],
  newSubscriptions: [],
  cancellations: [],
  activeSubs: 0,
  trialingSubs: 0,
  mrrAud: 0,
  aiSpendUsd: 0,
  totalRunsToday: 0,
  trend7dAvg: baseTrend,
  lifetime: baseLifetime,
  userActivity: [],
  orgAiUsage: [],
  stuckUploads: [],
  pastDue: [],
};

const busyReport: DailyReportData = {
  dateLabel: "Thursday, 20 August 2026",
  generatedAtLabel: "20 Aug 2026, 9:00 pm",
  signups: [{ name: "Jane Smith", org: "Smith Constructions" }],
  newSubscriptions: [{ org: "Smith Constructions", plan: "Growth", status: "trialing" }],
  cancellations: [{ org: "Old Co", plan: "Starter" }],
  activeSubs: 12,
  trialingSubs: 3,
  mrrAud: 4788,
  aiSpendUsd: 12.3456,
  totalRunsToday: 7,
  trend7dAvg: baseTrend,
  lifetime: baseLifetime,
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

  it("produces a real PDF for a day with signups, runs, and attention items (past-due + stuck upload together)", () => {
    const buf = generateDailyReportPdf(busyReport);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("does not throw when AI usage by org exceeds the top-10 cap", () => {
    const manyOrgs: DailyReportData = {
      ...busyReport,
      orgAiUsage: Array.from({ length: 25 }, (_, i) => ({
        org: `Org ${i}`,
        calls: i + 1,
        tokens: (i + 1) * 1000,
        costByProvider: [{ provider: "anthropic", cost: i + 0.5 }],
      })),
    };
    const buf = generateDailyReportPdf(manyOrgs);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
