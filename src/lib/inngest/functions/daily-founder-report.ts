import { inngest } from "../client";
import { db } from "@/lib/supabase/db";
import { sendEmail } from "@/lib/email/resend";
import { PLANS, normalizePlanId, type PlanId } from "@/lib/stripe/plans";
import { generateDailyReportPdf, type DailyReportData } from "@/lib/reporting/daily-report-pdf";

/**
 * Daily founder digest — Karen + Karthik, every night, as a PDF attachment.
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
 * PER-USER, EXCEPT AI SPEND. compliance_checks, design_checks, cost_estimates
 * and projects all carry created_by, so runs and project creation are
 * attributed to the actual person. ai_usage_log does NOT carry a user column
 * (only org_id) — so AI usage stays org-level, honestly, rather than guessing
 * which user in a multi-seat org triggered which call.
 *
 * PDF, NOT AN EMAIL BODY. Generated with the same jsPDF + jspdf-autotable
 * stack every other report in this codebase already uses (comply, build,
 * quote), same margins and grey header styling, so this doesn't introduce a
 * second visual language. The email itself carries just a one-line summary;
 * the attachment is the report.
 */

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
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
        buildRuns,
        quoteRuns,
        plansUploaded,
        projectsCreated,
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
        admin.from("compliance_checks").select("org_id, created_by").gte("created_at", since),
        admin.from("design_checks").select("org_id, created_by").gte("created_at", since),
        admin.from("cost_estimates").select("org_id, created_by").gte("created_at", since),
        admin.from("plans").select("org_id, created_by, status").gte("created_at", since),
        admin.from("projects").select("org_id, created_by").gte("created_at", since),
        admin
          .from("plans")
          .select("org_id, file_name, error_message")
          .eq("status", "manual_review"),
        admin.from("subscriptions").select("org_id, plan_id").eq("status", "past_due"),
      ]);

      // Two name lookups, done once here rather than per-row below: orgs (for
      // every section) and profiles (for the per-user activity table). Both
      // end up as plain Records, not Maps — this whole object is what
      // step.run persists as JSON for Inngest's replay/durability, and
      // JSON.stringify(new Map()) silently produces "{}", which would drop
      // every name with no error anywhere.
      const orgIds = new Set<string>();
      const profileIds = new Set<string>();
      const collectOrgIds = (rows: { org_id: string }[] | null) => {
        for (const r of rows ?? []) if (r.org_id) orgIds.add(r.org_id);
      };
      const collectProfileIds = (rows: { created_by: string | null }[] | null) => {
        for (const r of rows ?? []) if (r.created_by) profileIds.add(r.created_by);
      };
      collectOrgIds(newProfiles.data);
      collectOrgIds(newSubs.data);
      collectOrgIds(cancelledSubs.data);
      collectOrgIds(allSubs.data);
      collectOrgIds(aiUsage.data);
      collectOrgIds(checksRun.data);
      collectOrgIds(buildRuns.data);
      collectOrgIds(quoteRuns.data);
      collectOrgIds(plansUploaded.data);
      collectOrgIds(projectsCreated.data);
      collectOrgIds(stuckPlans.data);
      collectOrgIds(pastDueSubs.data);
      collectProfileIds(checksRun.data);
      collectProfileIds(buildRuns.data);
      collectProfileIds(quoteRuns.data);
      collectProfileIds(plansUploaded.data);
      collectProfileIds(projectsCreated.data);

      const [{ data: orgRows }, { data: profileRows }] = await Promise.all([
        admin.from("organisations").select("id, name").in("id", Array.from(orgIds)),
        admin.from("profiles").select("id, full_name, email").in("id", Array.from(profileIds)),
      ]);
      const orgNames: Record<string, string> = Object.fromEntries(
        ((orgRows ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]),
      );
      const profileNames: Record<string, string> = Object.fromEntries(
        ((profileRows ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [
          p.id,
          p.full_name || p.email,
        ]),
      );

      return {
        newProfiles: (newProfiles.data ?? []) as {
          full_name: string | null;
          email: string;
          org_id: string;
        }[],
        newSubs: (newSubs.data ?? []) as { org_id: string; plan_id: string; status: string }[],
        cancelledSubs: (cancelledSubs.data ?? []) as { org_id: string; plan_id: string }[],
        allSubs: (allSubs.data ?? []) as { org_id: string; plan_id: string; status: string }[],
        aiUsage: (aiUsage.data ?? []) as {
          org_id: string;
          provider: string;
          input_tokens: number | null;
          output_tokens: number | null;
          estimated_cost_usd: number | null;
        }[],
        checksRun: (checksRun.data ?? []) as { org_id: string; created_by: string | null }[],
        buildRuns: (buildRuns.data ?? []) as { org_id: string; created_by: string | null }[],
        quoteRuns: (quoteRuns.data ?? []) as { org_id: string; created_by: string | null }[],
        plansUploaded: (plansUploaded.data ?? []) as { org_id: string; created_by: string | null }[],
        projectsCreated: (projectsCreated.data ?? []) as { org_id: string; created_by: string | null }[],
        stuckPlans: (stuckPlans.data ?? []) as {
          org_id: string;
          file_name: string;
          error_message: string | null;
        }[],
        pastDueSubs: (pastDueSubs.data ?? []) as { org_id: string; plan_id: string }[],
        orgNames,
        profileNames,
      };
    });

    const { pdfBuffer, dateLabel, active, trialing, mrr } = await step.run("build-report", () => {
      const orgName = (id: string) => raw.orgNames[id] ?? "(unknown org)";
      const userName = (id: string | null) => (id ? raw.profileNames[id] ?? "(unknown user)" : "(unknown user)");

      const active = raw.allSubs.filter((s) => s.status === "active");
      const trialing = raw.allSubs.filter((s) => s.status === "trialing");
      const mrr = active.reduce((sum, s) => {
        const plan = PLANS[normalizePlanId(s.plan_id) as PlanId];
        return sum + (plan && typeof plan.price === "number" ? plan.price : 0);
      }, 0);
      const aiSpendUsd = raw.aiUsage.reduce((sum, u) => sum + (u.estimated_cost_usd ?? 0), 0);

      // Per-user activity, keyed by (created_by, org_id) — a person could in
      // principle act inside more than one org, so the pair is the real key,
      // not just the user id.
      type UserKey = string; // `${profileId}::${orgId}`
      const userActivity = new Map<
        UserKey,
        { userId: string; orgId: string; complianceRuns: number; buildRuns: number; quoteRuns: number; plansUploaded: number; projectsCreated: number }
      >();
      const touch = (createdBy: string | null, orgId: string) => {
        const userId = createdBy ?? "unknown";
        const key: UserKey = `${userId}::${orgId}`;
        if (!userActivity.has(key)) {
          userActivity.set(key, {
            userId,
            orgId,
            complianceRuns: 0,
            buildRuns: 0,
            quoteRuns: 0,
            plansUploaded: 0,
            projectsCreated: 0,
          });
        }
        return userActivity.get(key)!;
      };
      for (const r of raw.checksRun) touch(r.created_by, r.org_id).complianceRuns++;
      for (const r of raw.buildRuns) touch(r.created_by, r.org_id).buildRuns++;
      for (const r of raw.quoteRuns) touch(r.created_by, r.org_id).quoteRuns++;
      for (const r of raw.plansUploaded) touch(r.created_by, r.org_id).plansUploaded++;
      for (const r of raw.projectsCreated) touch(r.created_by, r.org_id).projectsCreated++;

      // AI usage stays ORG-level — ai_usage_log has no created_by column, so
      // per-user attribution here would be a guess, not a fact.
      const orgActivity = new Map<string, { calls: number; tokens: number; costByProvider: Map<string, number> }>();
      for (const u of raw.aiUsage) {
        if (!orgActivity.has(u.org_id)) {
          orgActivity.set(u.org_id, { calls: 0, tokens: 0, costByProvider: new Map() });
        }
        const entry = orgActivity.get(u.org_id)!;
        entry.calls++;
        entry.tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
        entry.costByProvider.set(
          u.provider,
          (entry.costByProvider.get(u.provider) ?? 0) + (u.estimated_cost_usd ?? 0),
        );
      }

      const dateLabel = new Date().toLocaleDateString("en-AU", {
        timeZone: "Australia/Sydney",
        dateStyle: "full",
      });

      const reportData: DailyReportData = {
        dateLabel,
        signups: raw.newProfiles.map((p) => ({ name: p.full_name || p.email, org: orgName(p.org_id) })),
        newSubscriptions: raw.newSubs.map((s) => ({
          org: orgName(s.org_id),
          plan: planLabel(s.plan_id),
          status: s.status,
        })),
        cancellations: raw.cancelledSubs.map((c) => ({ org: orgName(c.org_id), plan: planLabel(c.plan_id) })),
        activeSubs: active.length,
        trialingSubs: trialing.length,
        mrrAud: mrr,
        aiSpendUsd,
        userActivity: Array.from(userActivity.values()).map((a) => ({
          user: userName(a.userId === "unknown" ? null : a.userId),
          org: orgName(a.orgId),
          complianceRuns: a.complianceRuns,
          buildRuns: a.buildRuns,
          quoteRuns: a.quoteRuns,
          projectsCreated: a.projectsCreated,
        })),
        orgAiUsage: Array.from(orgActivity.entries()).map(([orgId, a]) => ({
          org: orgName(orgId),
          calls: a.calls,
          tokens: a.tokens,
          costByProvider: Array.from(a.costByProvider.entries()).map(([provider, cost]) => ({ provider, cost })),
        })),
        stuckUploads: raw.stuckPlans.map((p) => ({
          org: orgName(p.org_id),
          fileName: p.file_name,
          reason: p.error_message ?? "—",
        })),
        pastDue: raw.pastDueSubs.map((s) => ({ org: orgName(s.org_id), plan: planLabel(s.plan_id) })),
      };

      // Buffer crosses the step boundary as base64 — Inngest JSON-serializes
      // step.run's return value, and a raw Buffer/Uint8Array does not survive
      // that round-trip as binary; base64 text does.
      const pdfBase64 = generateDailyReportPdf(reportData).toString("base64");

      return { pdfBuffer: pdfBase64, dateLabel, active: active.length, trialing: trialing.length, mrr };
    });

    const to = [
      process.env.KAREN_EMAIL || "karen.engel@mmcbuild.com.au",
      process.env.KARTHIK_EMAIL || "karthik.rao@mmcbuild.com.au",
    ];

    await step.run("send-report", async () => {
      await sendEmail({
        to,
        subject: `MMC Build — Daily Report, ${dateLabel}`,
        text:
          `Today's report is attached.\n\n` +
          `Active subscriptions: ${active}  ·  Trialing: ${trialing}  ·  MRR: ${fmtMoney(mrr)} AUD\n`,
        attachments: [
          {
            filename: `mmc-build-daily-report-${new Date().toISOString().slice(0, 10)}.pdf`,
            content: Buffer.from(pdfBuffer, "base64"),
          },
        ],
      });
    });

    return { sent: true };
  },
);
