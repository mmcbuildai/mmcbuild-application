#!/usr/bin/env node
/** Create the "lead with Projects; lock module cards until a project exists" ticket. */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import https from "https";

const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length && !process.env[key.trim()])
      process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  });
}

const HOST = process.env.JIRA_HOST || "corporateaisolutions-team.atlassian.net";
const PROJECT_KEY = process.env.JIRA_PROJECT || "SCRUM";
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_TOKEN || process.env.JIRA_API_KEY;
const AUTH = Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");

function adfDoc(text) {
  const paragraphs = text.split("\n\n").map((p) => ({
    type: "paragraph",
    content: [{ type: "text", text: p }],
  }));
  return { type: "doc", version: 1, content: paragraphs };
}

function api(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: HOST, path, method,
      headers: {
        Authorization: `Basic ${AUTH}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        let parsed = null;
        if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = raw; } }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", (e) => resolve({ status: 0, body: { error: e.message } }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: 0, body: "timeout" }); });
    if (data) req.write(data);
    req.end();
  });
}

const result = await api("POST", "/rest/api/3/issue", {
  fields: {
    project: { key: PROJECT_KEY },
    summary:
      "[Dashboard + Beta] Lead with Projects — show module cards locked until a project exists, then unlock",
    description: adfDoc(`Problem: new users and beta testers land on the dashboard / beta page and are unsure where to start. Every MMC module (Comply, Build, Quote, Direct, Train) runs inside a project, but that is not obvious from the module grid.

Decision: make Projects the clear first step, while still showing the modules so users understand what they are working towards.

Behaviour:
1. On the main dashboard and the beta testing page, show all five module cards at all times.
2. While the user has no project, the module cards are greyed out / locked (not actionable), with a short hint and the Projects card as the primary "Start here" action.
3. As soon as the user has a project, the module cards unlock and become usable — on beta this means "Start Testing" becomes available. Users see the cards visibly change from locked to open, which signals that creating a project was the right first step.

Why show-locked rather than hide: testers see the modules transition from greyed/unavailable to open the moment a project exists, which makes the "create a project first" flow self-explanatory.

Scope: UI only — main dashboard (DashboardModules) and beta testing dashboard (BetaDashboard). The unlock condition is "the org has at least one project" (the existing hasProjects signal both pages already load).`),
    issuetype: { name: "Task" },
    labels: ["ux", "dashboard", "beta", "onboarding"],
  },
});

if (result.body?.key) {
  console.log(`OK Created ${result.body.key}`);
  console.log(`   https://${HOST}/browse/${result.body.key}`);
} else {
  console.error("FAIL:", JSON.stringify(result.body).slice(0, 400));
}
