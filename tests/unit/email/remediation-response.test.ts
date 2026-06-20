import { describe, it, expect } from "vitest";
import {
  truncateNotes,
  buildRemediationResponseEmail,
} from "@/lib/email/templates/remediation-response";

describe("truncateNotes", () => {
  it("returns null for null notes", () => {
    expect(truncateNotes(null)).toBeNull();
  });

  it("returns short notes unchanged", () => {
    expect(truncateNotes("All good")).toBe("All good");
  });

  it("truncates and appends an ellipsis past the limit", () => {
    const long = "x".repeat(300);
    const result = truncateNotes(long, 280);
    expect(result).toBe(`${"x".repeat(280)}…`);
    expect(result?.length).toBe(281); // 280 chars + the ellipsis char
  });

  it("does not truncate at exactly the limit", () => {
    const exact = "x".repeat(280);
    expect(truncateNotes(exact, 280)).toBe(exact);
  });
});

describe("buildRemediationResponseEmail", () => {
  it("includes the project, finding, status, and an HTML-escaped respondent", () => {
    const html = buildRemediationResponseEmail({
      recipientName: "Sam Builder",
      projectName: "42 Smith St",
      findingTitle: "Wet area waterproofing",
      findingSeverity: "non_compliant",
      newStatus: "completed",
      responseNotes: "Fixed & re-tested <ok>",
      respondentEmail: "eng@example.com",
      findingUrl: "https://app.mmcbuild.com.au/comply/abc",
    });

    expect(html).toContain("42 Smith St");
    expect(html).toContain("Wet area waterproofing");
    expect(html).toContain("Completed"); // status label, not raw enum
    expect(html).toContain("eng@example.com");
    expect(html).toContain("https://app.mmcbuild.com.au/comply/abc");
    // Notes are HTML-escaped (no raw < / & in output).
    expect(html).toContain("Fixed &amp; re-tested &lt;ok&gt;");
  });

  it("omits the notes block when there are no notes", () => {
    const html = buildRemediationResponseEmail({
      recipientName: "Sam",
      projectName: "Proj",
      findingTitle: "Finding",
      findingSeverity: "advisory",
      newStatus: "acknowledged",
      responseNotes: null,
      respondentEmail: "eng@example.com",
      findingUrl: "https://app.mmcbuild.com.au/comply/abc",
    });

    expect(html).not.toContain("Their notes");
  });
});
