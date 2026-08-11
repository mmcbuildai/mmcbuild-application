import { db } from "@/lib/supabase/db";
import type { Attribution } from "@/lib/attribution/first-touch";
import { leadSchema, type LeadInput } from "@/lib/validators/lead";
import { submitToHubSpotForm } from "./forms";

/**
 * Record a NEW self-signup as a lead: a durable row in `leads`, then a HubSpot
 * contact sync whose outcome is written back onto that row.
 *
 * WHY THIS EXISTS (client call 2026-07-29)
 * Only /api/leads writes to HubSpot today. Sign-up touches neither `leads` nor
 * HubSpot. The agreed plan repoints the Facebook/social CTA from the marketing
 * contact page to the in-app sign-up page — "when somebody looks at an ad on
 * social media, we would want them to sign up, because we want that data from
 * them" (Karthik) — and Dennis on the same call: "it should go to Stripe, it
 * should go to Supabase, it should also go to HubSpot. Everything should go to
 * three locations."
 *
 * Without this, the day that CTA is repointed CRM capture drops to zero. It would
 * look exactly like the "HubSpot isn't capturing anything" symptom already being
 * reported — except that one turned out to be no submissions at all, and this one
 * would be real.
 *
 * CONTRACT: this MUST NEVER throw and MUST NEVER block provisioning. It runs
 * inside the auth path of a REGULATED product; a HubSpot outage or a CRM schema
 * change cannot be allowed to stop someone creating an account. Every failure is
 * swallowed — but recorded on the row, so "why is this person not in HubSpot?" is
 * answerable from the data rather than from a log nobody kept (the same reasoning
 * as the leads route, and as beta_page_feedback's alert tracking).
 *
 * Idempotency comes from the caller: provisionUser only reports `self_signup` on
 * the request that actually creates the profile, so this fires once per user.
 * HubSpot itself dedupes by email, so a repeat would update rather than duplicate.
 */
export async function recordSignupLead(input: {
  email: string;
  fullName?: string | null;
  orgName?: string | null;
  /**
   * First-touch campaign data, when the CALLER can see it.
   *
   * `provisionUser` runs in the auth callback and cannot — it has no request
   * cookies for the visitor's first touch. The `signUp` server action CAN, so
   * it reads `mmc_attr` and passes it here. Without this an ad click produces a
   * lead with no campaign attached, which is the exact complaint this work
   * exists to answer, so "captured but unattributed" would be only half a fix.
   */
  attribution?: Partial<Attribution> | null;
  /** HubSpot's own visitor token (`hubspotutk`), when the caller can read it. */
  hutk?: string | null;
}): Promise<void> {
  try {
    // `leads` is not in the generated Database types, so it goes through the
    // untyped service-role helper — the same reason /api/leads uses db().
    const supabase = db();
    const email = input.email.trim().toLowerCase();
    if (!email) return;

    // "Ada Lovelace" -> first "Ada", last "Lovelace". A single-word name becomes
    // the first name with an empty last name; HubSpot requires firstname, and
    // buildFields drops empty values rather than sending blanks.
    const parts = (input.fullName ?? "").trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] || email.split("@")[0] || "Unknown";
    const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";

    // Built through the schema rather than as a bare literal, so the ten
    // attribution fields SCRUM-373 added (hutk, utm*, fbclid, gclid,
    // landingPage, referrer) pick up their documented empty defaults instead of
    // having to be restated here — and so the next field added to a lead does
    // not break this call site again.
    //
    // This file typechecked green on its own branch and RED on main: it was
    // written against a LeadInput from 30 July and the attribution fields landed
    // in between, so the literal was missing ten required properties the moment
    // the two met. A literal must be edited every time the type grows; parse()
    // must not.
    //
    // Campaign data depends on WHO CALLS THIS. The UTM values live in the
    // browser's first-touch cookie: the `signUp` server action can read it and
    // passes it in; `provisionUser` (auth callback) cannot see it and passes
    // nothing. Empty is therefore the honest value in that second case, not a
    // placeholder for something we failed to collect.
    const lead: LeadInput = leadSchema.parse({
      formType: "signup",
      firstName,
      lastName,
      email,
      company: input.orgName?.trim() || "",
      message: "Created an account in the MMC Build app.",
      sourcePage: "https://app.mmcbuild.com.au/signup",
      // Empty stays the honest value when the caller has no cookie to read —
      // the schema defaults every attribution field to "" and buildFields drops
      // empties, so an unattributed signup is recorded as unattributed rather
      // than as a guess.
      hutk: input.hutk ?? "",
      utmSource: input.attribution?.utmSource ?? "",
      utmMedium: input.attribution?.utmMedium ?? "",
      utmCampaign: input.attribution?.utmCampaign ?? "",
      utmTerm: input.attribution?.utmTerm ?? "",
      utmContent: input.attribution?.utmContent ?? "",
      fbclid: input.attribution?.fbclid ?? "",
      gclid: input.attribution?.gclid ?? "",
      landingPage: input.attribution?.landingPage ?? "",
      referrer: input.attribution?.referrer ?? "",
    });

    // 1. Durable row first, exactly as /api/leads does — the CRM is downstream of
    //    our own record, never the other way round, so a HubSpot problem can
    //    never lose the person.
    const { data: inserted, error: insertErr } = await supabase
      .from("leads")
      .insert({
        form_type: lead.formType,
        first_name: lead.firstName,
        last_name: lead.lastName || null,
        email: lead.email,
        phone_country: null,
        phone: null,
        company: lead.company || null,
        role: null,
        interest: null,
        message: lead.message || null,
        source_page: lead.sourcePage || null,
        utm_source: lead.utmSource || null,
        utm_medium: lead.utmMedium || null,
        utm_campaign: lead.utmCampaign || null,
        utm_term: lead.utmTerm || null,
        utm_content: lead.utmContent || null,
        fbclid: lead.fbclid || null,
        gclid: lead.gclid || null,
        landing_page: lead.landingPage || null,
        referrer: lead.referrer || null,
        hubspot_utk: lead.hutk || null,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      console.error("[recordSignupLead] leads insert failed:", insertErr?.message);
      return;
    }
    const leadId = (inserted as { id: string }).id;

    // 2. HubSpot sync. Non-fatal, but the verdict is persisted either way.
    const hs = await submitToHubSpotForm(lead);
    if (hs.ok) {
      await supabase
        .from("leads")
        .update({
          hubspot_sync_status: "synced",
          hubspot_synced_at: new Date().toISOString(),
          hubspot_error: null,
        })
        .eq("id", leadId);
    } else {
      console.warn("[recordSignupLead] hubspot sync failed:", hs.error);
      await supabase
        .from("leads")
        .update({
          hubspot_sync_status: "failed",
          hubspot_error: hs.error,
          hubspot_retry_count: 1,
          hubspot_last_retry_at: new Date().toISOString(),
        })
        .eq("id", leadId);
    }
  } catch (e) {
    // Belt and braces: nothing in here may surface into the auth path.
    console.error("[recordSignupLead] threw (non-fatal):", (e as Error).message);
  }
}
