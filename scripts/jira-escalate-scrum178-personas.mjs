#!/usr/bin/env node
/**
 * Escalate SCRUM-178 (persona conflict) — assign to Karen, raise priority,
 * rewrite the description to frame the conflict explicitly, attach Karen's
 * Figma user-journey screenshots, and post a comment with the Monday deadline.
 *
 * Trigger: 2026-05-01 Build module review revealed Karen's Figma board shows
 * structurally different journey stages PER PERSONA (Jason has Directory &
 * Supplier Referral; Michael has DA Approved; Architects board has its own
 * stage set). This conflicts with the v0.4.x decision to remove the persona
 * layer — must be reconciled before any further UX work depends on it.
 */
import { readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import https from "https";

const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const [k, ...r] = line.split("=");
    if (k && r.length && !process.env[k.trim()])
      process.env[k.trim()] = r.join("=").trim().replace(/^["']|["']$/g, "");
  });
}

const HOST = process.env.JIRA_HOST || "corporateaisolutions-team.atlassian.net";
const KEY = "SCRUM-178";
const KAREN_ACCOUNT_ID = "712020:394dbedd-1ff0-48c1-ab5d-4f6a49136935";
const AUTH = Buffer.from(
  `${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN || process.env.JIRA_API_KEY}`,
).toString("base64");

const ATTACHMENT_DIR = join(process.cwd(), "scrum178-attachments");
const ATTACHMENTS = [
  { file: "01-architects-page4-journey.png", caption: "Architects board, Page 4 — full journey row (anonymous architect persona)" },
  { file: "02-page2-da-approved-journey.png", caption: "Page 2 — journey with stages: Awareness → Concept Design & Build → DA Approved → Compliance" },
  { file: "03-michael-developer-persona.png", caption: "Page 3 — Michael persona card (Developer, age 39, Melbourne)" },
  { file: "04-michael-developer-journey.png", caption: "Page 3 — Michael's journey row (Developer)" },
  { file: "05-jason-electrician-journey.png", caption: "Page 4 — Jason persona card + journey (Electrician, age 31, Melbourne) — note Directory & Supplier Referral replaces DA Approved" },
];

function adfDoc(text) {
  return {
    type: "doc",
    version: 1,
    content: text.split("\n\n").map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p }],
    })),
  };
}

function api(method, path, body, extraHeaders = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: HOST,
        path,
        method,
        headers: {
          Authorization: `Basic ${AUTH}`,
          Accept: "application/json",
          ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let parsed = null;
          if (raw) {
            try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on("error", (e) => resolve({ status: 0, body: { error: e.message } }));
    req.setTimeout(60000, () => { req.destroy(); resolve({ status: 0, body: "timeout" }); });
    if (data) req.write(data);
    req.end();
  });
}

function uploadAttachment(filePath, fileName) {
  return new Promise((resolve) => {
    const buf = readFileSync(filePath);
    const boundary = "----formdata-mmc-" + Math.random().toString(36).slice(2);
    const head =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: image/png\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([Buffer.from(head, "utf8"), buf, Buffer.from(tail, "utf8")]);
    const req = https.request(
      {
        hostname: HOST,
        path: `/rest/api/3/issue/${KEY}/attachments`,
        method: "POST",
        headers: {
          Authorization: `Basic ${AUTH}`,
          Accept: "application/json",
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
          "X-Atlassian-Token": "no-check",
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let parsed = null;
          if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = raw; } }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on("error", (e) => resolve({ status: 0, body: { error: e.message } }));
    req.setTimeout(120000, () => { req.destroy(); resolve({ status: 0, body: "timeout" }); });
    req.write(body);
    req.end();
  });
}

const NEW_SUMMARY =
  "[URGENT — decision needed Monday] Persona model conflict: removed in v0.4.x but Figma user-journeys require it back — pick the path forward";

const NEW_DESCRIPTION = `URGENT: needs a decision on Monday's call (2026-05-04) before any further UX work proceeds.

THE CONFLICT — TL;DR

In v0.4.x we deliberately REMOVED the persona layer (onboarding role picker, module-visibility gating, role reset in settings). Per the project memory and SCRUM-78 rescope: "Persona gating intentionally removed; beta reveals usage by behaviour, not role."

But Karen's Figma user-journey board ("MMC Build User Journeys - Architects", node ZTLA7Ak99hHRYkZKfFezW0) shows materially DIFFERENT user journeys per persona — not just role-tailored copy on shared UI, but structurally different journey stages. We cannot ship what Karen has designed without bringing some form of persona/role back into the product.

Five Figma screenshots are attached to this ticket — please review them inline.

WHAT THE FIGMA BOARDS SHOW

Page 2 — anonymous persona, journey stages: Awareness → Concept Design & Build → DA Approved → Compliance.

Page 3 — Michael persona card (Developer, 39, Melbourne; oversees residential and mixed-use developments; pain points: project delays, unreliable suppliers, compliance risk). Same DA Approved journey row as Page 2.

Page 4 — Jason persona card (Electrician, 31, Melbourne; small business with 4 employees; wants steady project flow, verified credentials, upskilling). Journey stages: Awareness → Concept Design & Build → Directory & Supplier Referral → Compliance. Note Jason has NO "DA Approved" stage — he goes through Directory instead.

Architects board (different page) — its own journey stages.

The KEY OBSERVATION: each persona has a different middle-stage column. Jason routes through Directory, Michael routes through DA Approved, Architects route through their own stage set. That is not implementable with shared UI and adaptive copy. It requires per-role product surfaces.

WHAT WAS REMOVED IN v0.4.x (so we know what we're undoing if we go back)

- Onboarding persona picker (Builder / Developer / Architect / Tradie / Certifier)
- Module-visibility gating per persona
- "Your role" reset action in settings
- Default seeding of persona = "builder" on signup (already removed in working tree at src/app/(auth)/actions.ts — uncommitted, awaiting this decision)

OPTIONS — KAREN PLEASE PICK

Option A — REINTRODUCE the full persona layer (reverse v0.4.x decision)

- Onboarding role picker on first login
- Sidebar + module visibility gated per role
- Per-role dashboard + journey CTAs aligned to your Figma stages
- "Change role" available in settings

Effort: ~2 sprints. Reversal of an explicit prior decision — needs the reasons recorded clearly so we don't oscillate again.

Option B — PROJECT-LEVEL ROLES (recommended)

- A user takes a different role on different projects (architect on one, developer client on another, certifier reviewing a third)
- "Your role on this project" is a question on the project intake (we can extend the new Project Status step from SCRUM-165 to include it)
- Module copy + journey emphasis adapts based on project_role + project_goals
- No global onboarding role gate; user identity is not role-locked
- Karen's Figma journey rows become per-project-role product flows

Effort: ~3 days for the schema + intake change + UI adaptation per module.

Why we recommend B: it honours the v0.4.x principle ("usage by behaviour, not role" — a user's role is contextual, not identity), AND it implements the structurally different journeys Karen has designed. Designers behaving as architects on a residential brief and as developers on a townhouse cluster get different surfaces on each project, which is closer to how the AEC industry actually works.

Option C — STATUS QUO + role-flavoured copy only (keep v0.4.x stance)

- No structural changes
- Existing SCRUM-165 project_goals drive emphasis on shared UI
- Karen's Figma journey maps inform marketing site / onboarding tour, NOT the product
- Beta feedback determines whether deeper personalisation is needed

Effort: zero product change.

Risk: Karen's design work doesn't translate to product. Architects may not see the architect-specific flow she's designed. Tradies may see modules they don't need.

DEPENDENCIES (so we know what's blocked)

- Any role-aware copy changes (cannot start until we know if we're in A, B, or C)
- N1 (suggestion-driven 3D filtering) — partial dependency
- N2 (goal-weighted scoring) — partial dependency
- Future module-visibility decisions (e.g. should Tradies see the Quote module?)
- The uncommitted persona-default removal in src/app/(auth)/actions.ts — we won't ship that until this is settled

DECISION DEADLINE: Monday 2026-05-04 call. Posting this as urgent so it's visible end of day Sunday and we can resolve in one conversation rather than via comment threads.`;

const KAREN_PING_COMMENT = `Karen — flagging this for the start of Monday's call.

Five screenshots from your "MMC Build User Journeys - Architects" board are attached. Walking through them at the meeting, the structural divergence between Jason's row (Directory & Supplier Referral) and Michael's row (DA Approved) is what tipped me from "this is a copy job" to "this needs a product decision".

Pick A, B, or C from the description and I can spec the implementation tickets the same day. My read is B (project-level roles) but I'm happy to be talked into A if there's a stronger reason than the journey maps themselves — sales conversations, audit trail, certifier sign-off requirements, beta feedback you've heard, anything along those lines.

Until this is settled I'm holding the persona-default removal in src/app/(auth)/actions.ts as uncommitted, and pausing all ticketing that depends on knowing user role.`;

async function main() {
  console.log(`Escalating ${KEY}...`);

  // 1. Get current priority list to find the right "Highest" / "High"
  const meta = await api("GET", `/rest/api/3/issue/${KEY}/editmeta`);
  const priorityField = meta.body?.fields?.priority;
  const allowedPriorities = priorityField?.allowedValues?.map((p) => p.name) ?? [];
  const targetPriority =
    allowedPriorities.find((n) => /^highest$/i.test(n)) ||
    allowedPriorities.find((n) => /^high$/i.test(n)) ||
    "High";
  console.log(`  Available priorities: ${allowedPriorities.join(", ") || "(unknown)"}`);
  console.log(`  Setting priority to: ${targetPriority}`);

  // 2. Update fields
  const updateBody = {
    fields: {
      summary: NEW_SUMMARY,
      description: adfDoc(NEW_DESCRIPTION),
      priority: { name: targetPriority },
      assignee: { accountId: KAREN_ACCOUNT_ID },
      labels: [
        "discussion",
        "ux",
        "karen-feedback",
        "meeting-2026-05-01",
        "needs-decision",
        "urgent",
        "blocker",
      ],
    },
  };

  const upd = await api("PUT", `/rest/api/3/issue/${KEY}`, updateBody);
  if (upd.status >= 400) {
    console.error(`  ✗ Update failed: ${upd.status}`, upd.body);
    return;
  }
  console.log(`  ✓ Fields updated (priority/assignee/summary/description/labels)`);

  // 3. Upload attachments
  console.log(`\nAttaching ${ATTACHMENTS.length} screenshots...`);
  for (const a of ATTACHMENTS) {
    const fp = join(ATTACHMENT_DIR, a.file);
    if (!existsSync(fp)) {
      console.log(`  ✗ ${a.file} — file not found at ${fp}`);
      continue;
    }
    const size = statSync(fp).size;
    const r = await uploadAttachment(fp, a.file);
    if (r.status >= 400 || !Array.isArray(r.body)) {
      console.log(`  ✗ ${a.file} — ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`);
    } else {
      console.log(`  ✓ ${a.file} (${(size / 1024).toFixed(0)}KB) — ${a.caption}`);
    }
  }

  // 4. Post the Karen-ping comment
  const cmt = await api("POST", `/rest/api/3/issue/${KEY}/comment`, {
    body: adfDoc(KAREN_PING_COMMENT),
  });
  if (cmt.status >= 400) {
    console.error(`\n  ✗ Comment failed: ${cmt.status}`, cmt.body);
  } else {
    console.log(`\n  ✓ Karen-ping comment posted`);
  }

  console.log(`\nDone. Karen will see ${KEY} as assigned to her with high priority and 5 attachments.`);
  console.log(`URL: https://${HOST}/browse/${KEY}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
