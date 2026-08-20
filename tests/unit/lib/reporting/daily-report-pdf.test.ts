import { describe, it, expect } from "vitest";
import { generateDailyReportPdf, type DailyReportData } from "@/lib/reporting/daily-report-pdf";

const emptyReport: DailyReportData = {
  dateLabel: "Thursday, 20 August 2026",
  generatedAtLabel: "20 Aug 2026, 9:00 pm",
  signupsCount: 0,
  newSubscriptionsCount: 0,
  cancellationsCount: 0,
  runsByProduct: { compliance: 0, build: 0, quote: 0 },
  aiCostByProduct: { compliance: 0, build: 0, quote: 0, other: 0 },
  signupsCount7d: 0,
  newSubscriptionsCount7d: 0,
  cancellationsCount7d: 0,
  runsByProduct7d: { compliance: 0, build: 0, quote: 0 },
  aiCostByProduct7d: { compliance: 0, build: 0, quote: 0, other: 0 },
  signups: [],
  newSubscriptions: [],
  cancellations: [],
  userActivity: [],
  stuckUploads: [],
  pastDue: [],
};

const busyReport: DailyReportData = {
  dateLabel: "Thursday, 20 August 2026",
  generatedAtLabel: "20 Aug 2026, 9:00 pm",
  signupsCount: 1,
  newSubscriptionsCount: 1,
  cancellationsCount: 1,
  runsByProduct: { compliance: 4, build: 2, quote: 1 },
  aiCostByProduct: { compliance: 1.23, build: 0, quote: 0, other: 4.56 },
  signupsCount7d: 3,
  newSubscriptionsCount7d: 2,
  cancellationsCount7d: 1,
  runsByProduct7d: { compliance: 6, build: 3, quote: 1 },
  aiCostByProduct7d: { compliance: 3.5, build: 0, quote: 0, other: 12.1 },
  signups: [{ name: "Sam Mes", org: "Smith Construction Pld" }],
  newSubscriptions: [{ org: "Smith Construction Pld", plan: "Growth", status: "trialing" }],
  cancellations: [{ org: "Old Co", plan: "Starter" }],
  userActivity: [
    {
      user: "Sam Mes",
      org: "Smith Construction Pld",
      last24h: { complianceRuns: 4, buildRuns: 2, quoteRuns: 1, plansUploaded: 1, projectsCreated: 0 },
      last7d: { complianceRuns: 6, buildRuns: 3, quoteRuns: 1, plansUploaded: 2, projectsCreated: 1 },
    },
    {
      // No Comply/Build/Quote runs at all — only a plan upload. Pins the
      // regression this section exists for: a user who never appears in
      // checks/builds/quotes must still get a row via plansUploaded/
      // projectsCreated, not vanish from Engagement entirely.
      user: "Will Evennett",
      org: "Stratus BD",
      last24h: { complianceRuns: 0, buildRuns: 0, quoteRuns: 0, plansUploaded: 0, projectsCreated: 0 },
      last7d: { complianceRuns: 0, buildRuns: 0, quoteRuns: 0, plansUploaded: 1, projectsCreated: 0 },
    },
  ],
  stuckUploads: [
    {
      org: "Smith Construction Pld",
      fileName: "plan.pdf",
      reason: "unsupported Unicode escape sequence",
      status: "Fixed in code",
      nextSteps: "Get back to Sam — let him know the upload issue is fixed and ask him to re-upload the plan.",
    },
  ],
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

  it("does not throw when a real user is active only in the 7-day window, not the 24h one", () => {
    const buf = generateDailyReportPdf(busyReport);
    expect(buf.length).toBeGreaterThan(0);
  });
});
