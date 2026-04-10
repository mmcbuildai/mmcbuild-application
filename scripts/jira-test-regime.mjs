#!/usr/bin/env node
/**
 * MMC Build — Create Jira issues for Test Regime v1.0 review
 *
 * Creates one parent story + 26 subtasks (one per test case) for
 * Karen and Karthik to review. Each issue includes clear steps,
 * purpose, and a link to the test regime page.
 *
 * Uses credentials from .env.local (same as jira_setup_v4.js)
 * Run: node scripts/jira-test-regime.mjs
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import https from "https";

// ── Load .env.local ──────────────────────────────────────────────────────
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const [key, ...rest] = line.split("=");
      if (key && rest.length)
        process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    });
  console.log("  ✓ Loaded .env.local");
}

const HOST = process.env.JIRA_HOST;
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT || "SCRUM";

if (!HOST || !EMAIL || !TOKEN) {
  console.error("❌  Missing JIRA_HOST, JIRA_EMAIL, or JIRA_TOKEN in .env.local");
  process.exit(1);
}

const AUTH = Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function api(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: HOST,
        path,
        method,
        headers: {
          Authorization: `Basic ${AUTH}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            console.error(`  ⚠️  ${method} ${path} → ${res.statusCode}: ${raw.substring(0, 200)}`);
            resolve(null);
          } else {
            try {
              resolve(raw ? JSON.parse(raw) : {});
            } catch {
              resolve(raw);
            }
          }
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const doc = (blocks) => ({
  type: "doc",
  version: 1,
  content: blocks,
});

const paragraph = (text) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const heading = (text, level = 3) => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

const bold = (text) => ({
  type: "text",
  text,
  marks: [{ type: "strong" }],
});

const link = (text, href) => ({
  type: "text",
  text,
  marks: [{ type: "link", attrs: { href } }],
});

const bulletList = (items) => ({
  type: "bulletList",
  content: items.map((item) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: typeof item === "string" ? [{ type: "text", text: item }] : item }],
  })),
});

const rule = () => ({ type: "rule" });

// ── Platform URL ─────────────────────────────────────────────────────────
const PLATFORM_URL = "https://mmcbuild-one.vercel.app";
const TEST_PAGE_URL = `${PLATFORM_URL}/admin/test-regime`;

// ── Test cases with clear steps and purpose ──────────────────────────────
const TEST_CASES = [
  // Onboarding
  {
    tcId: "TC-ONB-001",
    title: "New user registration and persona selection",
    section: "Onboarding",
    purpose: "Confirms that a new user can create an account, arrive at the onboarding screen, select their role (e.g. Builder), and land on the correct dashboard with the right modules visible.",
    steps: [
      "Go to the Sign Up page",
      "Enter name, organisation, email, and password",
      "Click 'Create Account'",
      "On the onboarding screen, select a persona (e.g. Builder)",
      "Click 'Continue'",
      "Verify you land on the Dashboard with the correct sidebar modules for your chosen persona",
    ],
    expected: "User lands on /dashboard with sidebar showing modules appropriate to the selected persona.",
  },
  {
    tcId: "TC-ONB-002",
    title: "Persona reset via settings",
    section: "Onboarding",
    purpose: "Confirms users can change their role after initial setup without needing to create a new account.",
    steps: [
      "Log in and go to Settings > Your Profile",
      "Note your current role displayed on the page",
      "Click 'Change role'",
      "In the confirmation dialog, click 'Continue'",
      "On the onboarding screen, select a different persona",
      "Click 'Continue'",
      "Verify the sidebar updates immediately to show modules for the new persona",
    ],
    expected: "Sidebar updates to show modules for the new persona. No page reload required.",
  },
  {
    tcId: "TC-ONB-003",
    title: "First login redirect to onboarding if persona not set",
    section: "Onboarding",
    purpose: "Ensures users who haven't selected a role yet are always directed to onboarding before they can use the platform.",
    steps: [
      "Log in with an account that has never selected a persona",
      "Try to navigate directly to /dashboard",
    ],
    expected: "User is automatically redirected to /onboarding before reaching the dashboard.",
  },

  // MMC Comply
  {
    tcId: "TC-COMPLY-001",
    title: "Upload valid PDF plan — analysis runs — report generated",
    section: "MMC Comply",
    purpose: "End-to-end test that the core compliance checking pipeline works: upload a building plan, run AI analysis, and get a structured report with NCC findings.",
    steps: [
      "Log in as a Builder and navigate to MMC Comply",
      "Select an existing project (or create one first)",
      "Upload a valid residential PDF building plan",
      "Complete the compliance questionnaire if prompted",
      "Click 'Run Compliance Check'",
      "Wait for the analysis to complete (30-60 seconds)",
      "Review the generated compliance report",
    ],
    expected: "Compliance report generated with NCC clause citations, severity ratings (compliant/advisory/non-compliant/critical), and recommendations.",
  },
  {
    tcId: "TC-COMPLY-002",
    title: "Upload invalid file type — error message shown",
    section: "MMC Comply",
    purpose: "Confirms the system rejects non-PDF files with a clear error message, preventing invalid uploads.",
    steps: [
      "Navigate to a project's document upload area",
      "Try to upload a .txt, .exe, or .jpg file instead of a PDF",
    ],
    expected: "Error message displayed: 'Only PDF files are accepted'. Upload is rejected — no file is stored.",
  },
  {
    tcId: "TC-COMPLY-003",
    title: "Run limit enforcement at 10 runs (Trial tier)",
    section: "MMC Comply",
    purpose: "Confirms trial users cannot exceed their allocated analysis runs, and are shown an upgrade prompt instead.",
    steps: [
      "Log in as a trial-tier user who has used all their allocated runs",
      "Navigate to MMC Comply and select a project",
      "Attempt to run a compliance analysis",
    ],
    expected: "User sees an upgrade prompt. Analysis does not run. The sidebar or dashboard shows run usage (e.g. '10/10').",
  },
  {
    tcId: "TC-COMPLY-004",
    title: "NCC citations present in output report",
    section: "MMC Comply",
    purpose: "Confirms the AI-generated compliance report includes specific NCC clause references, not generic statements. This is critical for the report to be useful to certifiers.",
    steps: [
      "Open a completed compliance report",
      "Review the clause-by-clause findings",
    ],
    expected: "Each finding references a specific NCC clause (e.g. 'NCC Vol 2, Part 3.7.1.2'). The 'Compliance Summary' section is visible with risk counts.",
  },
  {
    tcId: "TC-COMPLY-005",
    title: "Export compliance report as PDF",
    section: "MMC Comply",
    purpose: "Confirms the compliance report can be downloaded as a formatted PDF document for sharing with clients or certifiers.",
    steps: [
      "Open a completed compliance report",
      "Click 'Export PDF'",
    ],
    expected: "A PDF file downloads with formatted report content, MMC Build branding, and all findings.",
  },

  // MMC Build
  {
    tcId: "TC-BUILD-001",
    title: "Upload plan — material suggestions generated",
    section: "MMC Build",
    purpose: "Confirms the design optimisation AI can analyse a building plan and suggest appropriate MMC construction systems.",
    steps: [
      "Log in and navigate to MMC Build",
      "Select a project that has an uploaded plan",
      "Click 'Run Design Optimisation'",
      "Wait for the analysis to complete",
    ],
    expected: "System generates MMC material/system suggestions (SIPs, CLT, steel frame, etc.) with rationale, time savings, cost savings, and waste reduction estimates.",
  },
  {
    tcId: "TC-BUILD-002",
    title: "Material selection persists to project record",
    section: "MMC Build",
    purpose: "Confirms that when a user selects construction systems, the selection is saved and persists when they navigate away and come back.",
    steps: [
      "Navigate to a project in MMC Build",
      "In the 'Construction Systems' panel, select one or more systems (e.g. SIPs, CLT)",
      "Click 'Save Selection'",
      "Navigate away to the Dashboard",
      "Return to the same project in MMC Build",
    ],
    expected: "Selected systems are still shown as selected. The selection persists across page navigation.",
  },
  {
    tcId: "TC-BUILD-003",
    title: "No project exists — redirected to project creation",
    section: "MMC Build",
    purpose: "Confirms users can't access Build without a project — they're guided to create one first.",
    steps: [
      "Log in as a user with zero projects",
      "Navigate directly to /build",
    ],
    expected: "User is redirected to /projects with the Create Project dialog open, or sees a 'No projects yet' message with a 'Go to Projects' button.",
  },
  {
    tcId: "TC-BUILD-004",
    title: "Cross-module plan sharing",
    section: "MMC Build",
    purpose: "Confirms a plan uploaded in one module (e.g. Build) is automatically available in Comply and Quote without re-uploading.",
    steps: [
      "Upload a plan in the Build module for a project",
      "Navigate to MMC Comply for the same project",
      "Navigate to MMC Quote for the same project",
    ],
    expected: "The uploaded plan is available in Comply and Quote without re-uploading. Plan status shows as 'ready' in all three modules.",
  },

  // MMC Quote
  {
    tcId: "TC-QUOTE-001",
    title: "Quote generated from selected materials",
    section: "MMC Quote",
    purpose: "Confirms the cost estimation engine produces a complete quote comparing traditional vs MMC construction costs.",
    steps: [
      "Navigate to MMC Quote and select a project with an uploaded plan",
      "Select a region (e.g. NSW) if prompted",
      "Click 'Run Cost Estimation'",
      "Wait for the estimate to complete",
    ],
    expected: "Quote generated with line items, traditional cost, MMC alternative cost, and savings percentage. Cost comparison chart visible.",
  },
  {
    tcId: "TC-QUOTE-002",
    title: "Quote export as PDF",
    section: "MMC Quote",
    purpose: "Confirms quotes can be exported as formatted PDF documents for client proposals.",
    steps: [
      "Open a completed cost estimate",
      "Click 'Export PDF'",
    ],
    expected: "PDF downloaded with formatted quote, line items, and MMC Build branding.",
  },
  {
    tcId: "TC-QUOTE-003",
    title: "Quote export as Word document",
    section: "MMC Quote",
    purpose: "Confirms quotes can be exported as editable Word documents. Note: this feature may not be implemented yet.",
    steps: [
      "Open a completed cost estimate",
      "Look for an 'Export as Word' or '.docx' download option",
    ],
    expected: ".docx file downloaded with formatted quote content. Mark as N/A if the button is not present.",
  },
  {
    tcId: "TC-QUOTE-004",
    title: "Manufacturer pricing reflected in output",
    section: "MMC Quote",
    purpose: "Confirms that custom cost rates set in Settings are used in quote calculations, not just default rates.",
    steps: [
      "Go to Settings > Cost Rates and note or set a custom rate for a material",
      "Run a new quote that includes that material",
      "Compare the rate in the quote output with the configured rate",
    ],
    expected: "Quote uses the configured rate, not a default. Line items reflect the custom pricing.",
  },

  // MMC Direct
  {
    tcId: "TC-DIRECT-001",
    title: "Directory search by state and category returns results",
    section: "MMC Direct",
    purpose: "Confirms the trade directory filters work — users can find professionals by location and trade type.",
    steps: [
      "Navigate to MMC Direct",
      "Select a state filter (e.g. NSW)",
      "Select a trade category (e.g. Builder)",
      "Click 'Search' if there's a search button",
    ],
    expected: "Matching listings displayed with company name, trade type, and location. If no listings exist for the filter, a 'no results' message is shown.",
  },
  {
    tcId: "TC-DIRECT-002",
    title: "Filter by certification status works correctly",
    section: "MMC Direct",
    purpose: "Confirms users can filter the directory to show only verified/certified professionals.",
    steps: [
      "Navigate to MMC Direct",
      "Look for a certification or 'Verified' filter option",
      "Apply the filter",
    ],
    expected: "Only listings matching the filter criteria are shown. Verified listings display a green 'Verified' badge.",
  },
  {
    tcId: "TC-DIRECT-003",
    title: "Company profile displays all required fields",
    section: "MMC Direct",
    purpose: "Confirms each directory listing shows all the business information needed for a builder to assess a trade partner.",
    steps: [
      "Navigate to MMC Direct",
      "Click on any company listing",
    ],
    expected: "Profile shows: company name, trade type, contact details, location, specialisations, and an About/Portfolio/Reviews tab section.",
  },

  // MMC Train
  {
    tcId: "TC-TRAIN-001",
    title: "Training module loads and progress is tracked",
    section: "MMC Train",
    purpose: "Confirms the training system works end-to-end: courses load, users can enroll, complete sections, and their progress is saved.",
    steps: [
      "Navigate to MMC Train",
      "Select a training course from the catalog",
      "Enroll in the course (click 'Enroll' or 'Start')",
      "Open a lesson and complete it (click 'Mark as Complete')",
      "Navigate away and return to the training dashboard",
    ],
    expected: "Progress is saved and displayed on the dashboard (e.g. '1 In Progress'). The course shows the correct completion state.",
  },
  {
    tcId: "TC-TRAIN-002",
    title: "Quiz completion triggers certificate generation",
    section: "MMC Train",
    purpose: "Confirms that completing a course with a quiz generates a downloadable certificate.",
    steps: [
      "Complete all lessons in a training course",
      "Answer the quiz questions and submit",
      "Navigate to the training dashboard > Certificates tab",
    ],
    expected: "Certificate generated and available for download. Shows certificate number and issue date.",
  },
  {
    tcId: "TC-TRAIN-003",
    title: "Dashboard shows completion percentage per module",
    section: "MMC Train",
    purpose: "Confirms the training dashboard gives users a clear overview of their learning progress.",
    steps: [
      "Navigate to MMC Train > 'My Learning' (dashboard)",
    ],
    expected: "Dashboard shows three stat cards: 'Enrolled' count, 'In Progress' count, and 'Certificates' count. Each enrolled course shows a progress indicator.",
  },

  // Billing
  {
    tcId: "TC-BILL-001",
    title: "Trial user sees run limit progress bar",
    section: "Billing",
    purpose: "Confirms trial users can see how many analysis runs they've used and how many remain.",
    steps: [
      "Log in as a trial-tier user",
      "Go to the Dashboard",
      "Look at the sidebar or dashboard area for usage information",
    ],
    expected: "A progress indicator or banner visible showing trial status and usage (e.g. 'Free Trial — All Modules Unlocked' or 'Analyses used: X / Y').",
  },
  {
    tcId: "TC-BILL-002",
    title: "Upgrade prompt shown when run limit reached",
    section: "Billing",
    purpose: "Confirms users are blocked from running analyses when their trial is exhausted, and are prompted to upgrade.",
    steps: [
      "Log in as a trial user who has used all their runs",
      "Attempt to run any analysis (Comply, Build, or Quote)",
    ],
    expected: "Upgrade prompt displayed with link to billing page. Analysis is blocked. Sidebar may show 'Upgrade to Pro' link.",
  },
  {
    tcId: "TC-BILL-003",
    title: "Stripe test mode payment completes successfully",
    section: "Billing",
    purpose: "Confirms the payment flow works in Stripe test mode — users can select a plan and reach the Stripe checkout page.",
    steps: [
      "Navigate to the Billing page",
      "Select a paid plan (e.g. click 'Select Plan' on the Basic or Pro card)",
      "Verify you are redirected to the Stripe checkout page",
      "If testing fully: use Stripe test card 4242 4242 4242 4242",
    ],
    expected: "Stripe checkout page loads. If payment completed: subscription activates, run limit removed, tier updates.",
  },

  // Access Control
  {
    tcId: "TC-ACCESS-001",
    title: "Builder persona sees correct modules in sidebar",
    section: "Access Control",
    purpose: "Confirms Builders see all 5 core modules they need: Comply, Build, Quote, Direct, and Train.",
    steps: [
      "Log in as a user with the Builder persona",
      "Look at the sidebar under 'MODULES'",
    ],
    expected: "Sidebar shows 5 clickable modules: MMC Comply, MMC Build, MMC Quote, MMC Direct, MMC Train.",
  },
  {
    tcId: "TC-ACCESS-002",
    title: "Consultant persona sees Comply only",
    section: "Access Control",
    purpose: "Confirms Consultants (certifiers, engineers, planners) only see the compliance module — they don't need Build, Quote, etc.",
    steps: [
      "Log in as a user with the Consultant persona",
      "Look at the sidebar under 'MODULES'",
    ],
    expected: "Sidebar shows only MMC Comply. Other modules (Build, Quote, Direct, Train) are not visible.",
  },
  {
    tcId: "TC-ACCESS-003",
    title: "Admin user has access to all modules",
    section: "Access Control",
    purpose: "Confirms Admin users can see and access every module for management and oversight purposes.",
    steps: [
      "Log in as an Admin user",
      "Look at the sidebar under 'MODULES'",
    ],
    expected: "All 5 modules visible and clickable: MMC Comply, MMC Build, MMC Quote, MMC Direct, MMC Train.",
  },
  {
    tcId: "TC-ACCESS-004",
    title: "Trade persona sees Coming Soon state",
    section: "Access Control",
    purpose: "Confirms Trade users see all modules listed but locked with 'Coming Soon' labels — their features are planned for a future phase.",
    steps: [
      "Log in as a user with the Trade persona",
      "Look at the sidebar under 'MODULES'",
    ],
    expected: "All 5 modules visible but NOT clickable. Each shows a lock icon and 'Soon' label. Cursor shows 'not-allowed'.",
  },
];

// ── Jira document builder ────────────────────────────────────────────────
function buildDescription(tc) {
  return doc([
    heading("Purpose", 3),
    paragraph(tc.purpose),
    rule(),
    heading("How to Test", 3),
    bulletList(tc.steps),
    rule(),
    heading("Expected Result", 3),
    paragraph(tc.expected),
    rule(),
    heading("Review This Test", 3),
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Please review and comment on this test case:" },
      ],
    },
    bulletList([
      "Is this test suitable? (Yes / No / Needs changes)",
      "Are the steps clear enough to follow?",
      "Is the expected result clear?",
      "Any additional scenarios we should test for this feature?",
    ]),
    rule(),
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Manual test checklist: " },
        link(TEST_PAGE_URL, TEST_PAGE_URL),
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Platform: " },
        link(PLATFORM_URL, PLATFORM_URL),
      ],
    },
  ]);
}

function buildParentDescription() {
  return doc([
    heading("Test Regime v1.0 — Review Request", 2),
    paragraph(
      "This story tracks the review of all 26 automated test cases for MMC Build beta sign-off. " +
      "Each test case is listed as a subtask below."
    ),
    rule(),
    heading("What We Need From You", 3),
    paragraph("For each test case (subtask), please review and comment on:"),
    bulletList([
      [bold("Suitable / Not Suitable"), { type: "text", text: " — Does this test cover the right thing? Is it testing what matters for beta readiness?" }],
      [bold("Clarity"), { type: "text", text: " — Are the test steps clear enough? Would you know how to run this test manually? If not, tell us what's unclear." }],
      [bold("Missing Tests"), { type: "text", text: " — Are there any scenarios we've missed that should be tested before beta launch?" }],
    ]),
    rule(),
    heading("How to Review", 3),
    bulletList([
      "Open each subtask below and read the Purpose, Steps, and Expected Result",
      "Add a comment with your feedback (suitable/not suitable + any clarifications)",
      "If you want to run the tests manually, use the test checklist page linked below",
      "When you've reviewed all tests, move this story to Done",
    ]),
    rule(),
    heading("Links", 3),
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Manual test checklist (run tests and record results): " },
        link(TEST_PAGE_URL, TEST_PAGE_URL),
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Live platform: " },
        link(PLATFORM_URL, PLATFORM_URL),
      ],
    },
    rule(),
    heading("Test Summary", 3),
    paragraph("26 tests across 8 modules:"),
    bulletList([
      "Onboarding (3 tests) — registration, persona selection, redirects",
      "MMC Comply (5 tests) — upload, analysis, NCC citations, export, run limits",
      "MMC Build (4 tests) — design optimisation, material selection, plan sharing",
      "MMC Quote (4 tests) — cost estimation, exports, custom rates",
      "MMC Direct (3 tests) — directory search, filters, profiles",
      "MMC Train (3 tests) — courses, quizzes, certificates, progress",
      "Billing (3 tests) — trial limits, upgrade prompts, Stripe checkout",
      "Access Control (4 tests) — persona-based module visibility",
    ]),
  ]);
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🧪 MMC Build — Test Regime v1.0 Jira Setup");
  console.log(`   ${HOST} | Project: ${PROJECT_KEY}\n`);

  // 1. Get project
  console.log("1. Fetching project...");
  const project = await api("GET", `/rest/api/3/project/${PROJECT_KEY}`);
  if (!project) process.exit(1);
  const PROJECT_ID = project.id;
  console.log(`   ✓ ${project.name} (ID: ${PROJECT_ID})`);

  // 2. Get issue types
  console.log("2. Fetching issue types...");
  const types = await api("GET", `/rest/api/3/issuetype/project?projectId=${PROJECT_ID}`);
  const storyType = types?.find((t) => t.name === "Story");
  const subtaskType = types?.find((t) => t.name === "Sub-task" || t.name === "Subtask");
  const taskType = types?.find((t) => t.name === "Task");

  // Use subtask if available, otherwise task
  const childType = subtaskType || taskType;
  if (!storyType || !childType) {
    console.error("   ❌ Cannot find Story or Sub-task/Task issue types");
    console.log("   Available types:", types?.map((t) => t.name).join(", "));
    process.exit(1);
  }
  console.log(`   ✓ Story: ${storyType.id} | Child: ${childType.name} (${childType.id})`);

  // 3. Get users
  console.log("3. Resolving users...");
  const me = await api("GET", "/rest/api/3/myself");
  console.log(`   ✓ ${me?.displayName}`);

  let karenId = null, karthikId = null;
  const karenEmail = process.env.KAREN_EMAIL;
  const karthikEmail = process.env.KARTHIK_EMAIL;

  if (karenEmail) {
    const r = await api("GET", `/rest/api/3/user/search?query=${encodeURIComponent(karenEmail)}`);
    if (Array.isArray(r) && r[0]) {
      karenId = r[0].accountId;
      console.log(`   ✓ Karen: ${r[0].displayName}`);
    } else {
      console.log("   ⚠️  Karen not found");
    }
  }
  if (karthikEmail) {
    const r = await api("GET", `/rest/api/3/user/search?query=${encodeURIComponent(karthikEmail)}`);
    if (Array.isArray(r) && r[0]) {
      karthikId = r[0].accountId;
      console.log(`   ✓ Karthik: ${r[0].displayName}`);
    } else {
      console.log("   ⚠️  Karthik not found");
    }
  }

  // 4. Create parent story
  console.log("\n4. Creating parent story...");
  const parentResult = await api("POST", "/rest/api/3/issue", {
    fields: {
      project: { id: PROJECT_ID },
      issuetype: { id: storyType.id },
      summary: "[Test Regime v1.0] Review all 26 test cases before beta sign-off",
      description: buildParentDescription(),
      labels: ["test-regime", "review-required", "sprint-4"],
      priority: { name: "High" },
    },
  });

  if (!parentResult?.key) {
    console.error("   ❌ Failed to create parent story");
    process.exit(1);
  }
  console.log(`   ✓ Created ${parentResult.key}`);

  // 5. Create subtasks
  console.log("\n5. Creating test case subtasks...\n");
  let created = 0;
  let failed = 0;

  // Group by section for visual output
  let currentSection = "";

  for (const tc of TEST_CASES) {
    if (tc.section !== currentSection) {
      currentSection = tc.section;
      console.log(`   📂 ${currentSection}`);
    }

    await delay(300);

    const fields = {
      project: { id: PROJECT_ID },
      issuetype: { id: childType.id },
      summary: `[${tc.tcId}] ${tc.title}`,
      description: buildDescription(tc),
      labels: ["test-regime", tc.section.toLowerCase().replace(/\s+/g, "-")],
      priority: { name: "Medium" },
    };

    // Link as subtask if using subtask type
    if (subtaskType) {
      fields.parent = { key: parentResult.key };
    }

    const result = await api("POST", "/rest/api/3/issue", { fields });

    if (result?.key) {
      console.log(`      ✓ ${result.key} — ${tc.tcId}: ${tc.title.substring(0, 50)}...`);
      created++;

      // If not using subtask type, link manually
      if (!subtaskType && result.key) {
        await api("POST", "/rest/api/3/issueLink", {
          type: { name: "Blocks" },
          outwardIssue: { key: result.key },
          inwardIssue: { key: parentResult.key },
        });
      }
    } else {
      console.log(`      ✗ FAILED — ${tc.tcId}`);
      failed++;
    }
  }

  // 6. Add watchers (Karen and Karthik)
  if (karenId) {
    await api("POST", `/rest/api/3/issue/${parentResult.key}/watchers`, JSON.stringify(karenId));
    console.log("\n   ✓ Karen added as watcher");
  }
  if (karthikId) {
    await api("POST", `/rest/api/3/issue/${parentResult.key}/watchers`, JSON.stringify(karthikId));
    console.log("   ✓ Karthik added as watcher");
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("  ✅ Test Regime v1.0 — Jira setup complete");
  console.log("═".repeat(60));
  console.log(`\n  Parent: https://${HOST}/browse/${parentResult.key}`);
  console.log(`  Created: ${created} subtasks | Failed: ${failed}`);
  console.log(`\n  Test page: ${TEST_PAGE_URL}`);
  console.log(`  Platform:  ${PLATFORM_URL}\n`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
