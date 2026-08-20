import { inngest } from "../client";
import { db } from "@/lib/supabase/db";
import { sendEmail } from "@/lib/email/resend";
import { PLANS, normalizePlanId, type PlanId } from "@/lib/stripe/plans";

/**
 * Daily founder digest — Karen + Karthik, every night.
 *
 * WHY THIS EXISTS
 * Every other alert in this codebase (signup, subscription, cancellation) is
 * event-driven — it tells you about ONE thing the moment it happens. Nothing
 * rolled those up into a daily picture, so the only way to see "how did today
 * go" was to re-read a day's worth of individual emails, or go query Stripe
 * and Supabase by hand — which is how this function came to exist at all.
 *
 * 9pm SYDNEY, DST-SAFE. `TZ=Australia/Sydney` in the cron string (Inngest
 * supports this — https://www.inngest.com/docs/guides/scheduled-functions) is
 * what makes this correct across the DST boundary; a fixed UTC offset (the
 * pattern the other crons in this file use, e.g. remind-trial-ending's
 * "23:00 UTC ≈ 09:00 Brisbane") would silently drift an hour twice a year.
 * 21:00 is nowhere near Sydney's DST transition (which happens ~2-3am local),
 * so this schedule doesn't hit the edge case Inngest's own docs warn about.
 *
 * SCOPE, deliberately: a snapshot of state (active subs, MRR, AI spend) plus
 * what changed in the last 24 hours (signups, subscriptions, cancellations,
 * per-org usage) and what needs a human (stuck uploads, past-due payments).
 * Not a historical trend report — that's a different, later feature if it
 * turns out to be wanted.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.mmcbuild.com.au";

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

function planLabel(planId: string | null): string {
  if (!planId) return "unknown";
  const normalised = normalizePlanId(planId) as PlanId;
  return PLANS[normalised]?.name ?? planId;
}

export const dailyFounderReport = inngest.createFunction(
  { id: "daily-founder-report", name: "Daily Founder Report" },
  { cron: "TZ=Australia/Sydney 0 21 * * *" },
  async ({ step }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const admin = db();

    const raw = await step.run("gather-data", async () => {
      const [
        newProfiles,
        newSubs,
        cancelledSubs,
        allSubs,
        aiUsage,
        checksRun,
        plansUploaded,
        stuckPlans,
        pastDueSubs,
      ] = await Promise.all([
        admin
          .from("profiles")
          .select("full_name, email, org_id, created_at")
          .gte("created_at", since)
          .order("created_at"),
        admin
          .from("subscriptions")
          .select("org_id, plan_id, status, created_at")
          .gte("created_at", since),
        admin
          .from("subscriptions")
          .select("org_id, plan_id, updated_at")
          .eq("cancel_at_period_end", true)
          .gte("updated_at", since),
        admin.from("subscriptions").select("org_id, plan_id, status"),
        admin
          .from("ai_usage_log")
          .select("org_id, provider, input_tokens, output_tokens, estimated_cost_usd")
          .gte("created_at", since),
        admin
          .from("compliance_checks")
          .select("org_id, status")
          .gte("created_at", since),
        admin.from("plans").select("org_id, status").gte("created_at", since),
        admin
          .from("plans")
          .select("org_id, file_name, error_message")
          .eq("status", "manual_review"),
        admin.from("subscriptions").select("org_id, plan_id").eq("status", "past_due"),
      ]);

      // One name lookup for every org referenced anywhere above — cheaper than
      // a lookup per section, and it's the only reason any of these need a
      // second query at all.
      const orgIds = new Set<string>();
      for (const rows of [
        newProfiles.data,
        newSubs.data,
        cancelledSubs.data,
        allSubs.data,
        aiUsage.data,
        checksRun.data,
        plansUploaded.data,
        stuckPlans.data,
        pastDueSubs.data,
      ]) {
        for (const r of (rows ?? []) as { org_id: string }[]) {
          if (r.org_id) orgIds.add(r.org_id);
        }
      }
      const { data: orgRows } = await admin
        .from("organisations")
        .select("id, name")
        .in("id", Array.from(orgIds));
      // Plain object, not a Map: this whole return value is what step.run
      // persists as this step's JSON output for Inngest's replay/durability —
      // a Map serializes to "{}" (JSON.stringify drops it silently), which
      // would lose every org name without ever throwing an error.
      const orgNames: Record<string, string> = Object.fromEntries(
        ((orgRows ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]),
      );

      return {
        newProfiles: (newProfiles.data ?? []) as {
          full_name: string | null;
          email: string;
          org_id: string;
          created_at: string;
        }[],
        newSubs: (newSubs.data ?? []) as {
          org_id: string;
          plan_id: string;
          status: string;
          created_at: string;
        }[],
        cancelledSubs: (cancelledSubs.data ?? []) as {
          org_id: string;
          plan_id: string;
          updated_at: string;
        }[],
        allSubs: (allSubs.data ?? []) as { org_id: string; plan_id: string; status: string }[],
        aiUsage: (aiUsage.data ?? []) as {
          org_id: string;
          provider: string;
          input_tokens: number | null;
          output_tokens: number | null;
          estimated_cost_usd: number | null;
        }[],
        checksRun: (checksRun.data ?? []) as { org_id: string; status: string }[],
        plansUploaded: (plansUploaded.data ?? []) as { org_id: string; status: string }[],
        stuckPlans: (stuckPlans.data ?? []) as {
          org_id: string;
          file_name: string;
          error_message: string | null;
        }[],
        pastDueSubs: (pastDueSubs.data ?? []) as { org_id: string; plan_id: string }[],
        orgNames,
      };
    });

    const report = await step.run("build-report", () => {
      const orgName = (id: string) => raw.orgNames[id] ?? "(unknown org)";
      const lines: string[] = [];

      lines.push(`MMC Build — Daily Report`);
      lines.push(new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "full" }));
      lines.push("");

      // ---- Since yesterday ----
      lines.push("SINCE YESTERDAY");
      lines.push(`New signups: ${raw.newProfiles.length}`);
      for (const p of raw.newProfiles) {
        lines.push(`  - ${p.full_name || p.email} (${orgName(p.org_id)})`);
      }
      lines.push(`New subscriptions: ${raw.newSubs.length}`);
      for (const s of raw.newSubs) {
        lines.push(`  - ${orgName(s.org_id)} — ${planLabel(s.plan_id)} (${s.status})`);
      }
      lines.push(`Cancellations requested: ${raw.cancelledSubs.length}`);
      for (const c of raw.cancelledSubs) {
        lines.push(`  - ${orgName(c.org_id)} — ${planLabel(c.plan_id)}`);
      }
      lines.push("");

      // ---- Snapshot ----
      const active = raw.allSubs.filter((s) => s.status === "active");
      const trialing = raw.allSubs.filter((s) => s.status === "trialing");
      const mrr = active.reduce((sum, s) => {
        const plan = PLANS[normalizePlanId(s.plan_id) as PlanId];
        return sum + (plan && typeof plan.price === "number" ? plan.price : 0);
      }, 0);
      const totalCost = raw.aiUsage.reduce((sum, u) => sum + (u.estimated_cost_usd ?? 0), 0);

      lines.push("SNAPSHOT");
      lines.push(`Active subscriptions: ${active.length}`);
      lines.push(`Trialing: ${trialing.length}`);
      lines.push(`MRR (active only): ${fmtMoney(mrr)} AUD`);
      lines.push(`AI spend, last 24h: ${fmtCost(totalCost)} USD`);
      lines.push("");

      // ---- Engagement, per org ----
      const orgActivity = new Map<
        string,
        { checks: number; uploads: number; calls: number; tokens: number; costByProvider: Map<string, number> }
      >();
      const touch = (orgId: string) => {
        if (!orgActivity.has(orgId)) {
          orgActivity.set(orgId, { checks: 0, uploads: 0, calls: 0, tokens: 0, costByProvider: new Map() });
        }
        return orgActivity.get(orgId)!;
      };
      for (const c of raw.checksRun) touch(c.org_id).checks++;
      for (const p of raw.plansUploaded) touch(p.org_id).uploads++;
      for (const u of raw.aiUsage) {
        const entry = touch(u.org_id);
        entry.calls++;
        entry.tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
        entry.costByProvider.set(
          u.provider,
          (entry.costByProvider.get(u.provider) ?? 0) + (u.estimated_cost_usd ?? 0),
        );
      }

      lines.push("ENGAGEMENT — WHO RAN WHAT");
      if (orgActivity.size === 0) {
        lines.push("  (nobody used the product in the last 24 hours)");
      }
      for (const [orgId, a] of orgActivity) {
        const costBits = Array.from(a.costByProvider.entries())
          .map(([provider, cost]) => `${provider} ${fmtCost(cost)}`)
          .join(", ");
        lines.push(
          `  ${orgName(orgId)}: ${a.checks} compliance check(s), ${a.uploads} plan(s) uploaded, ` +
            `${a.calls} AI call(s), ${a.tokens.toLocaleString("en-AU")} tokens` +
            (costBits ? ` (${costBits})` : ""),
        );
      }
      lines.push("");

      // ---- Needs attention ----
      lines.push("NEEDS ATTENTION");
      if (raw.stuckPlans.length === 0 && raw.pastDueSubs.length === 0) {
        lines.push("  Nothing outstanding.");
      }
      if (raw.stuckPlans.length > 0) {
        lines.push(`  Uploads stuck in manual_review: ${raw.stuckPlans.length}`);
        for (const p of raw.stuckPlans) {
          lines.push(`    - ${orgName(p.org_id)}: ${p.file_name}${p.error_message ? ` — ${p.error_message}` : ""}`);
        }
      }
      if (raw.pastDueSubs.length > 0) {
        lines.push(`  Past-due payments: ${raw.pastDueSubs.length}`);
        for (const s of raw.pastDueSubs) {
          lines.push(`    - ${orgName(s.org_id)} — ${planLabel(s.plan_id)}`);
        }
      }
      lines.push("");
      lines.push(`— ${APP_URL}/admin`);

      return lines.join("\n");
    });

    const to = [
      process.env.KAREN_EMAIL || "karen.engel@mmcbuild.com.au",
      process.env.KARTHIK_EMAIL || "karthik.rao@mmcbuild.com.au",
    ];

    await step.run("send-report", async () => {
      await sendEmail({
        to,
        subject: `MMC Build — Daily Report, ${new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" })}`,
        text: report,
      });
    });

    return { sent: true };
  },
);
