import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import * as fs from "fs";
import * as path from "path";

/**
 * Custom Playwright reporter that maps test results back to
 * test-regime-v1.0 TC IDs and outputs:
 *   1. JSON  → test-results/regime-results.json  (machine-readable, for Jira sync later)
 *   2. Markdown → test-results/regime-report.md   (human-readable, for Karen & Karthik)
 */

interface TCResult {
  tcId: string;
  title: string;
  section: string;
  status: "passed" | "failed" | "partial" | "skipped";
  duration: number;
  error?: string;
  recommendation?: string;
  screenshots: string[];
  steps: string[];
}

interface RegimeReport {
  runDate: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  partial: number;
  results: TCResult[];
}

// Map TC prefix to section name
function sectionFromId(tcId: string): string {
  const map: Record<string, string> = {
    "TC-ONB": "Onboarding",
    "TC-COMPLY": "MMC Comply",
    "TC-BUILD": "MMC Build",
    "TC-QUOTE": "MMC Quote",
    "TC-DIRECT": "MMC Direct",
    "TC-TRAIN": "MMC Train",
    "TC-BILL": "Billing",
    "TC-ACCESS": "Access Control",
  };
  for (const [prefix, section] of Object.entries(map)) {
    if (tcId.startsWith(prefix)) return section;
  }
  return "Other";
}

// Extract TC ID from test title e.g. "TC-ACCESS-001: Builder persona sees correct modules"
function extractTcId(title: string): string | null {
  const match = title.match(/^(TC-[A-Z]+-\d{3})/);
  return match ? match[1] : null;
}

// Derive a fix recommendation from common failure patterns
function deriveRecommendation(error: string): string | undefined {
  if (error.includes("Timeout") || error.includes("waiting for"))
    return "Element not found or page load too slow — check if the selector matches current UI and increase timeout if needed.";
  if (error.includes("expect(") && error.includes("toBeVisible"))
    return "Expected element not visible — verify the component renders for this persona/state.";
  if (error.includes("expect(") && error.includes("toHaveURL"))
    return "Navigation did not reach expected URL — check redirect logic and auth state.";
  if (error.includes("expect(") && error.includes("toContainText"))
    return "Expected text not found on page — verify copy matches or component rendered.";
  return undefined;
}

class RegimeReporter implements Reporter {
  private results: TCResult[] = [];
  private outputDir: string;

  constructor(options: { outputDir?: string } = {}) {
    this.outputDir = options.outputDir || path.join(process.cwd(), "test-results");
  }

  onBegin(_config: FullConfig, _suite: Suite) {
    console.log("\n📋 Test Regime v1.0 — starting run\n");
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const tcId = extractTcId(test.title);
    if (!tcId) return; // skip tests without TC IDs

    const errorMsg = result.errors?.[0]?.message || result.errors?.[0]?.stack || "";
    const cleanError = errorMsg.split("\n").slice(0, 3).join("\n").trim();

    const screenshots = result.attachments
      .filter((a) => a.contentType?.startsWith("image/"))
      .map((a) => a.path || "")
      .filter(Boolean);

    // Extract step annotations if any
    const steps = test.annotations
      .filter((a) => a.type === "step")
      .map((a) => a.description || "");

    const status: TCResult["status"] =
      result.status === "passed"
        ? "passed"
        : result.status === "skipped"
          ? "skipped"
          : result.status === "timedOut"
            ? "failed"
            : "failed";

    const tcResult: TCResult = {
      tcId,
      title: test.title.replace(/^TC-[A-Z]+-\d{3}:\s*/, ""),
      section: sectionFromId(tcId),
      status,
      duration: result.duration,
      screenshots,
      steps,
    };

    if (status === "failed") {
      tcResult.error = cleanError;
      tcResult.recommendation = deriveRecommendation(errorMsg);
    }

    this.results.push(tcResult);

    const icon = { passed: "✅", failed: "❌", skipped: "⏭️", partial: "⚠️" }[status];
    console.log(`  ${icon} ${tcId}: ${tcResult.title} (${result.duration}ms)`);
  }

  async onEnd(result: FullResult) {
    // Ensure output dir exists
    fs.mkdirSync(this.outputDir, { recursive: true });

    const report: RegimeReport = {
      runDate: new Date().toISOString(),
      totalTests: this.results.length,
      passed: this.results.filter((r) => r.status === "passed").length,
      failed: this.results.filter((r) => r.status === "failed").length,
      skipped: this.results.filter((r) => r.status === "skipped").length,
      partial: this.results.filter((r) => r.status === "partial").length,
      results: this.results,
    };

    // Write JSON
    const jsonPath = path.join(this.outputDir, "regime-results.json");
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    // Write Markdown
    const mdPath = path.join(this.outputDir, "regime-report.md");
    fs.writeFileSync(mdPath, this.buildMarkdown(report));

    // Print summary
    const total = report.totalTests;
    const p = report.passed;
    const f = report.failed;
    const s = report.skipped;

    console.log("\n" + "═".repeat(60));
    console.log(`  Test Regime v1.0 — ${result.status.toUpperCase()}`);
    console.log("═".repeat(60));
    console.log(`  Total: ${total}  |  ✅ ${p} passed  |  ❌ ${f} failed  |  ⏭️  ${s} skipped`);
    console.log(`  JSON:     ${jsonPath}`);
    console.log(`  Report:   ${mdPath}`);
    console.log("═".repeat(60) + "\n");
  }

  private buildMarkdown(report: RegimeReport): string {
    const lines: string[] = [];
    const date = new Date(report.runDate).toLocaleString("en-AU", {
      dateStyle: "full",
      timeStyle: "short",
    });

    lines.push("# MMC Build — Test Regime v1.0 Results");
    lines.push("");
    lines.push(`**Run date:** ${date}`);
    lines.push(`**Overall:** ${report.passed}/${report.totalTests} passed`);
    lines.push("");

    // Summary table
    lines.push("## Summary");
    lines.push("");
    lines.push("| Metric | Count |");
    lines.push("|--------|-------|");
    lines.push(`| Total tests | ${report.totalTests} |`);
    lines.push(`| Passed | ${report.passed} |`);
    lines.push(`| Failed | ${report.failed} |`);
    lines.push(`| Skipped | ${report.skipped} |`);
    lines.push("");

    // Group by section
    const sections = new Map<string, TCResult[]>();
    for (const r of report.results) {
      if (!sections.has(r.section)) sections.set(r.section, []);
      sections.get(r.section)!.push(r);
    }

    for (const [section, results] of sections) {
      const sectionPassed = results.filter((r) => r.status === "passed").length;
      const sectionTotal = results.length;
      const sectionIcon = sectionPassed === sectionTotal ? "✅" : "❌";

      lines.push(`## ${sectionIcon} ${section} (${sectionPassed}/${sectionTotal})`);
      lines.push("");
      lines.push("| TC ID | Description | Result | Duration | Notes |");
      lines.push("|-------|-------------|--------|----------|-------|");

      for (const r of results) {
        const icon = { passed: "PASS", failed: "FAIL", skipped: "SKIP", partial: "PARTIAL" }[r.status];
        const dur = `${(r.duration / 1000).toFixed(1)}s`;
        let notes = "";
        if (r.status === "passed") {
          notes = "Verified as expected";
        } else if (r.error) {
          // Keep notes concise for the table — one line
          notes = r.error.split("\n")[0].substring(0, 80);
        }
        lines.push(`| ${r.tcId} | ${r.title} | **${icon}** | ${dur} | ${notes} |`);
      }

      // Detail failed tests below the table
      const failures = results.filter((r) => r.status === "failed");
      if (failures.length > 0) {
        lines.push("");
        lines.push("### Failures");
        lines.push("");
        for (const f of failures) {
          lines.push(`#### ${f.tcId}: ${f.title}`);
          lines.push("");
          lines.push("**Error:**");
          lines.push("```");
          lines.push(f.error || "Unknown error");
          lines.push("```");
          if (f.recommendation) {
            lines.push("");
            lines.push(`**Recommended fix:** ${f.recommendation}`);
          }
          if (f.screenshots.length > 0) {
            lines.push("");
            lines.push("**Screenshots:**");
            for (const s of f.screenshots) {
              lines.push(`- ![${f.tcId} failure](${s})`);
            }
          }
          lines.push("");
        }
      }

      lines.push("");
    }

    // Sign-off section
    lines.push("---");
    lines.push("");
    lines.push("## Sign-off");
    lines.push("");
    lines.push("| Reviewer | Date | Status |");
    lines.push("|----------|------|--------|");
    lines.push("| Dennis McMahon | | |");
    lines.push("| Karen Burns | | |");
    lines.push("| Karthik Rao | | |");

    return lines.join("\n");
  }
}

export default RegimeReporter;
