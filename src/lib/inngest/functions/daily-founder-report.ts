import { inngest } from "../client";
import { db } from "@/lib/supabase/db";
import { sendEmail } from "@/lib/email/resend";
import { PLANS, normalizePlanId, type PlanId } from "@/lib/stripe/plans";
import { MODEL_REGISTRY } from "@/lib/ai/models/registry";
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
 * FOUR SECTIONS, PER AN EXPLICIT SPEC FROM THE REPORT'S ACTUAL READER: 1)
 * Summary (signup/subscription/cancellation counts, runs by product, AI cost
 * by product), 2) Detail (each signup/subscription/cancellation from the
 * last 24h), 3) Engagement (each real user's runs per product, plus plans
 * uploaded and projects created, 24h AND 7d — a user whose only activity is
 * uploading a plan would otherwise vanish from a table that only counted
 * Comply/Build/Quote runs),
 * 4) Needs Attention. See daily-report-pdf.ts's file header for what an
 * earlier version of this report had and why it was cut back to this.
 *
 * EVERYTHING IS SCOPED TO REAL USERS. `profiles.seat_type` distinguishes
 * `internal` (staff/QA/dogfooding seats — includes literal test domains like
 * e2e-test.mmcbuild.local) from real customer seats (`beta`, `external`,
 * `viewer`). At the point this filtering was added, 46 of 63 profiles across
 * 42 of 45 orgs were internal — a report of "the business" that counted them
 * wasn't a report of the business. `realProfileIds`/`realOrgIds` are computed
 * ONCE up front (a plain profiles fetch — data volume here is small) and
 * every other query in this function filters against them: `created_by` rows
 * (compliance/build/quote runs, signups themselves) against `realProfileIds`,
 * org-only rows (subscriptions, ai_usage_log, stuck uploads) against
 * `realOrgIds`. A `created_by` that's null is NOT counted as real — we can't
 * confirm attribution, so per the REGULATED-tier rule ("flag ambiguity
 * rather than assume"), it's excluded rather than guessed.
 *
 * AI SPEND IS RECOMPUTED FROM RAW TOKENS, NOT `estimated_cost_usd`. That
 * column is poisoned by SCRUM-121 (see registry.ts / router.ts history): the
 * registry stored per-million prices but the cost formula divided by 1,000,
 * inflating every logged cost 1000x. The bug was fixed 2026-04-20, but old
 * rows were deliberately NOT backfilled — the fix commit says to treat
 * `scripts/token-usage-report.mjs`, which recalculates from `model_id` +
 * `input_tokens`/`output_tokens` against the (now-correct) registry pricing,
 * as "the trusted source for any forward analysis." This function does the
 * same recomputation (`recalculateAiCost`) rather than trusting the stored
 * column — caught via a manual test send that showed $11,619 lifetime spend
 * against a from-tokens recalculation of $81.
 *
 * AI COST BY PRODUCT USES `ai_function`, NOT `check_id`. Only Comply calls
 * carry a `check_id` linking back to the specific run — Build/Quote don't
 * (yet), so a true per-run cost join isn't possible for those two. Cost is
 * bucketed by the `ai_function` tag instead: compliance_primary/validator →
 * Comply, design_primary → Build, cost_primary → Quote, everything else
 * (embeddings, plan classification, R&D classification, assistant, …) →
 * Other. Build/Quote will legitimately show $0 until those code paths start
 * tagging calls with module-specific function names.
 */

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function planLabel(planId: string | null): string {
  if (!planId) return "unknown";
  const normalised = normalizePlanId(planId) as PlanId;
  return PLANS[normalised]?.name ?? planId;
}

function recalculateAiCost(modelId: string | null, inputTokens: number | null, outputTokens: number | null): number {
  if (!modelId) return 0;
  const model = MODEL_REGISTRY[modelId];
  if (!model) return 0;
  return ((inputTokens ?? 0) / 1_000_000) * model.costPer1MInput + ((outputTokens ?? 0) / 1_000_000) * model.costPer1MOutput;
}

type ProductBucket = "compliance" | "build" | "quote" | "other";

function productBucketForAiFunction(fn: string | null): ProductBucket {
  if (fn === "compliance_primary" || fn === "compliance_validator") return "compliance";
  if (fn === "design_primary") return "build";
  if (fn === "cost_primary") return "quote";
  return "other";
}

export const dailyFounderReport = inngest.createFunction(
  { id: "daily-founder-report", name: "Daily Founder Report" },
  { cron: "TZ=Australia/Sydney 0 21 * * *" },
  async ({ step }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const admin = db();

    const raw = await step.run("gather-data", async () => {
      // --- Phase 1: who counts as "real"? Every other query below filters
      // against this, so it has to resolve first. ---
      const { data: allProfilesRaw, error: allProfilesError } = await admin
        .from("profiles")
        .select("id, org_id, seat_type");
      if (allProfilesError) throw allProfilesError;
      const allProfiles = (allProfilesRaw ?? []) as { id: string; org_id: string; seat_type: string }[];
      const realProfiles = allProfiles.filter((p) => p.seat_type !== "internal");
      const realProfileIds = realProfiles.map((p) => p.id);
      const realOrgIds = Array.from(new Set(realProfiles.map((p) => p.org_id)));
      // PostgREST's `.in("col", [])` returns zero rows rather than erroring —
      // safe even in the (currently hypothetical) case every seat is internal.

      // --- Phase 2: everything else, filtered against Phase 1 ---
      const [
        newProfiles,
        newSubs,
        cancelledSubs,
        aiUsage24h,
        checksRun24h,
        buildRuns24h,
        quoteRuns24h,
        plansUploaded24h,
        projectsCreated24h,
        newProfiles7d,
        newSubs7d,
        cancelledSubs7d,
        aiUsage7d,
        checksRun7d,
        buildRuns7d,
        quoteRuns7d,
        plansUploaded7d,
        projectsCreated7d,
        stuckPlans,
        pastDueSubs,
      ] = await Promise.all([
        admin
          .from("profiles")
          .select("full_name, email, org_id, created_at")
          .neq("seat_type", "internal")
          .gte("created_at", since)
          .order("created_at"),
        admin
          .from("subscriptions")
          .select("org_id, plan_id, status, created_at")
          .in("org_id", realOrgIds)
          .gte("created_at", since),
        admin
          .from("subscriptions")
          .select("org_id, plan_id, updated_at")
          .in("org_id", realOrgIds)
          .eq("cancel_at_period_end", true)
          .gte("updated_at", since),
        admin
          .from("ai_usage_log")
          .select("org_id, ai_function, model_id, input_tokens, output_tokens")
          .in("org_id", realOrgIds)
          .gte("created_at", since),
        admin.from("compliance_checks").select("org_id, created_by").in("created_by", realProfileIds).gte("created_at", since),
        admin.from("design_checks").select("org_id, created_by").in("created_by", realProfileIds).gte("created_at", since),
        admin.from("cost_estimates").select("org_id, created_by").in("created_by", realProfileIds).gte("created_at", since),
        admin.from("plans").select("org_id, created_by").in("created_by", realProfileIds).gte("created_at", since),
        admin.from("projects").select("org_id, created_by").in("created_by", realProfileIds).gte("created_at", since),
        admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .neq("seat_type", "internal")
          .gte("created_at", since7d),
        admin
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .in("org_id", realOrgIds)
          .gte("created_at", since7d),
        admin
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .in("org_id", realOrgIds)
          .eq("cancel_at_period_end", true)
          .gte("updated_at", since7d),
        admin
          .from("ai_usage_log")
          .select("org_id, ai_function, model_id, input_tokens, output_tokens")
          .in("org_id", realOrgIds)
          .gte("created_at", since7d),
        admin.from("compliance_checks").select("org_id, created_by").in("created_by", realProfileIds).gte("created_at", since7d),
        admin.from("design_checks").select("org_id, created_by").in("created_by", realProfileIds).gte("created_at", since7d),
        admin.from("cost_estimates").select("org_id, created_by").in("created_by", realProfileIds).gte("created_at", since7d),
        admin.from("plans").select("org_id, created_by").in("created_by", realProfileIds).gte("created_at", since7d),
        admin.from("projects").select("org_id, created_by").in("created_by", realProfileIds).gte("created_at", since7d),
        admin
          .from("plans")
          .select("org_id, file_name, error_message, ops_status, ops_next_steps")
          .in("org_id", realOrgIds)
          .eq("status", "manual_review"),
        admin.from("subscriptions").select("org_id, plan_id").in("org_id", realOrgIds).eq("status", "past_due"),
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
      collectOrgIds(aiUsage24h.data);
      collectOrgIds(checksRun7d.data);
      collectOrgIds(buildRuns7d.data);
      collectOrgIds(quoteRuns7d.data);
      collectOrgIds(plansUploaded7d.data);
      collectOrgIds(projectsCreated7d.data);
      collectOrgIds(stuckPlans.data);
      collectOrgIds(pastDueSubs.data);
      collectProfileIds(checksRun7d.data);
      collectProfileIds(buildRuns7d.data);
      collectProfileIds(quoteRuns7d.data);
      collectProfileIds(plansUploaded7d.data);
      collectProfileIds(projectsCreated7d.data);

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
        newProfiles: (newProfiles.data ?? []) as { full_name: string | null; email: string; org_id: string }[],
        newSubs: (newSubs.data ?? []) as { org_id: string; plan_id: string; status: string }[],
        cancelledSubs: (cancelledSubs.data ?? []) as { org_id: string; plan_id: string }[],
        aiUsage24h: (aiUsage24h.data ?? []) as {
          org_id: string;
          ai_function: string | null;
          model_id: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
        }[],
        checksRun24h: (checksRun24h.data ?? []) as { org_id: string; created_by: string | null }[],
        buildRuns24h: (buildRuns24h.data ?? []) as { org_id: string; created_by: string | null }[],
        quoteRuns24h: (quoteRuns24h.data ?? []) as { org_id: string; created_by: string | null }[],
        plansUploaded24h: (plansUploaded24h.data ?? []) as { org_id: string; created_by: string | null }[],
        projectsCreated24h: (projectsCreated24h.data ?? []) as { org_id: string; created_by: string | null }[],
        signupsCount7d: newProfiles7d.count ?? 0,
        newSubscriptionsCount7d: newSubs7d.count ?? 0,
        cancellationsCount7d: cancelledSubs7d.count ?? 0,
        aiUsage7d: (aiUsage7d.data ?? []) as {
          org_id: string;
          ai_function: string | null;
          model_id: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
        }[],
        checksRun7d: (checksRun7d.data ?? []) as { org_id: string; created_by: string | null }[],
        buildRuns7d: (buildRuns7d.data ?? []) as { org_id: string; created_by: string | null }[],
        quoteRuns7d: (quoteRuns7d.data ?? []) as { org_id: string; created_by: string | null }[],
        plansUploaded7d: (plansUploaded7d.data ?? []) as { org_id: string; created_by: string | null }[],
        projectsCreated7d: (projectsCreated7d.data ?? []) as { org_id: string; created_by: string | null }[],
        stuckPlans: (stuckPlans.data ?? []) as {
          org_id: string;
          file_name: string;
          error_message: string | null;
          ops_status: string | null;
          ops_next_steps: string | null;
        }[],
        pastDueSubs: (pastDueSubs.data ?? []) as { org_id: string; plan_id: string }[],
        orgNames,
        profileNames,
      };
    });

    const { pdfBuffer, dateLabel, signupsCount, newSubscriptionsCount, cancellationsCount, totalRuns24h, totalAiCost24h } =
      await step.run("build-report", () => {
        const orgName = (id: string) => raw.orgNames[id] ?? "(unknown org)";
        const userName = (id: string | null) => (id ? raw.profileNames[id] ?? "(unknown user)" : "(unknown user)");

        // Per-user runs, per window, keyed by (created_by, org_id) — a person
        // could in principle act inside more than one org, so the pair is
        // the real key, not just the user id.
        type UserKey = string; // `${profileId}::${orgId}`
        type Counts = { complianceRuns: number; buildRuns: number; quoteRuns: number; plansUploaded: number; projectsCreated: number };
        const emptyCounts = (): Counts => ({
          complianceRuns: 0,
          buildRuns: 0,
          quoteRuns: 0,
          plansUploaded: 0,
          projectsCreated: 0,
        });

        function buildUserCounts(
          checks: { org_id: string; created_by: string | null }[],
          builds: { org_id: string; created_by: string | null }[],
          quotes: { org_id: string; created_by: string | null }[],
          plans: { org_id: string; created_by: string | null }[],
          projects: { org_id: string; created_by: string | null }[],
        ): Map<UserKey, { userId: string; orgId: string } & Counts> {
          const map = new Map<UserKey, { userId: string; orgId: string } & Counts>();
          const touch = (createdBy: string | null, orgId: string) => {
            const userId = createdBy ?? "unknown";
            const key: UserKey = `${userId}::${orgId}`;
            if (!map.has(key)) map.set(key, { userId, orgId, ...emptyCounts() });
            return map.get(key)!;
          };
          for (const r of checks) touch(r.created_by, r.org_id).complianceRuns++;
          for (const r of builds) touch(r.created_by, r.org_id).buildRuns++;
          for (const r of quotes) touch(r.created_by, r.org_id).quoteRuns++;
          for (const r of plans) touch(r.created_by, r.org_id).plansUploaded++;
          for (const r of projects) touch(r.created_by, r.org_id).projectsCreated++;
          return map;
        }

        const counts24h = buildUserCounts(
          raw.checksRun24h,
          raw.buildRuns24h,
          raw.quoteRuns24h,
          raw.plansUploaded24h,
          raw.projectsCreated24h,
        );
        const counts7d = buildUserCounts(
          raw.checksRun7d,
          raw.buildRuns7d,
          raw.quoteRuns7d,
          raw.plansUploaded7d,
          raw.projectsCreated7d,
        );

        // Union of every (user, org) that showed up in either window — a
        // user active only in the 24h window and one active only earlier in
        // the 7d window both need a row.
        const allKeys = new Set<UserKey>([...counts24h.keys(), ...counts7d.keys()]);
        const userActivity = Array.from(allKeys).map((key) => {
          const [userId, orgId] = key.split("::");
          const c24 = counts24h.get(key) ?? { userId, orgId, ...emptyCounts() };
          const c7 = counts7d.get(key) ?? { userId, orgId, ...emptyCounts() };
          return {
            user: userName(userId === "unknown" ? null : userId),
            org: orgName(orgId),
            last24h: {
              complianceRuns: c24.complianceRuns,
              buildRuns: c24.buildRuns,
              quoteRuns: c24.quoteRuns,
              plansUploaded: c24.plansUploaded,
              projectsCreated: c24.projectsCreated,
            },
            last7d: {
              complianceRuns: c7.complianceRuns,
              buildRuns: c7.buildRuns,
              quoteRuns: c7.quoteRuns,
              plansUploaded: c7.plansUploaded,
              projectsCreated: c7.projectsCreated,
            },
          };
        });

        // AI cost by product — see file header for why this is bucketed by
        // ai_function rather than joined via check_id. Same bucketing logic
        // runs over both windows; only the input row-set differs.
        const bucketAiCost = (rows: typeof raw.aiUsage24h) => {
          const out = { compliance: 0, build: 0, quote: 0, other: 0 };
          for (const u of rows) {
            const bucket = productBucketForAiFunction(u.ai_function);
            out[bucket] += recalculateAiCost(u.model_id, u.input_tokens, u.output_tokens);
          }
          return out;
        };
        const aiCostByProduct = bucketAiCost(raw.aiUsage24h);
        const aiCostByProduct7d = bucketAiCost(raw.aiUsage7d);
        const totalAiCost24h =
          aiCostByProduct.compliance + aiCostByProduct.build + aiCostByProduct.quote + aiCostByProduct.other;

        const runsByProduct = {
          compliance: raw.checksRun24h.length,
          build: raw.buildRuns24h.length,
          quote: raw.quoteRuns24h.length,
        };
        const runsByProduct7d = {
          compliance: raw.checksRun7d.length,
          build: raw.buildRuns7d.length,
          quote: raw.quoteRuns7d.length,
        };
        const totalRuns24h = runsByProduct.compliance + runsByProduct.build + runsByProduct.quote;

        const dateLabel = new Date().toLocaleDateString("en-AU", {
          timeZone: "Australia/Sydney",
          dateStyle: "full",
        });
        const generatedAtLabel = new Date().toLocaleString("en-AU", {
          timeZone: "Australia/Sydney",
          dateStyle: "medium",
          timeStyle: "short",
        });

        const reportData: DailyReportData = {
          dateLabel,
          generatedAtLabel,
          signupsCount: raw.newProfiles.length,
          newSubscriptionsCount: raw.newSubs.length,
          cancellationsCount: raw.cancelledSubs.length,
          runsByProduct,
          aiCostByProduct,
          signupsCount7d: raw.signupsCount7d,
          newSubscriptionsCount7d: raw.newSubscriptionsCount7d,
          cancellationsCount7d: raw.cancellationsCount7d,
          runsByProduct7d,
          aiCostByProduct7d,
          signups: raw.newProfiles.map((p) => ({ name: p.full_name || p.email, org: orgName(p.org_id) })),
          newSubscriptions: raw.newSubs.map((s) => ({
            org: orgName(s.org_id),
            plan: planLabel(s.plan_id),
            status: s.status,
          })),
          cancellations: raw.cancelledSubs.map((c) => ({ org: orgName(c.org_id), plan: planLabel(c.plan_id) })),
          userActivity,
          stuckUploads: raw.stuckPlans.map((p) => ({
            org: orgName(p.org_id),
            fileName: p.file_name,
            reason: p.error_message ?? "—",
            status: p.ops_status ?? "Unresolved",
            nextSteps: p.ops_next_steps ?? "—",
          })),
          pastDue: raw.pastDueSubs.map((s) => ({ org: orgName(s.org_id), plan: planLabel(s.plan_id) })),
        };

        // Buffer crosses the step boundary as base64 — Inngest JSON-serializes
        // step.run's return value, and a raw Buffer/Uint8Array does not survive
        // that round-trip as binary; base64 text does.
        const pdfBase64 = generateDailyReportPdf(reportData).toString("base64");

        return {
          pdfBuffer: pdfBase64,
          dateLabel,
          signupsCount: reportData.signupsCount,
          newSubscriptionsCount: reportData.newSubscriptionsCount,
          cancellationsCount: reportData.cancellationsCount,
          totalRuns24h,
          totalAiCost24h,
        };
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
          `New signups: ${signupsCount}  ·  New subscriptions: ${newSubscriptionsCount}  ·  Cancellations: ${cancellationsCount}\n` +
          `Product runs: ${totalRuns24h}  ·  AI cost: ${fmtMoney(totalAiCost24h)}\n`,
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
