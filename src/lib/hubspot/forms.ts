import type { LeadInput } from "@/lib/validators/lead";

const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID ?? "442558966";
const HUBSPOT_CONTACT_FORM_ID =
  process.env.HUBSPOT_CONTACT_FORM_ID ?? "9ef67321-b4cb-45b5-b3c1-e9d2301e0710";

type HubSpotField = { name: string; value: string };

/**
 * Send utm_* as explicit HubSpot contact properties. OFF by default, and that
 * default is load-bearing.
 *
 * HubSpot rejects a submission containing a field that does not exist on the
 * target form — the whole submission 400s, not just the unknown field. Enabling
 * this before the properties exist in the portal would therefore break lead
 * capture completely, on both websites, for every form.
 *
 * The properties needed (create in HubSpot, then set this to "true"):
 *   utm_source, utm_medium, utm_campaign, utm_term, utm_content
 *
 * Note this is a granularity upgrade, not the main event: `context.hutk` below
 * already gives HubSpot its own native Original Source attribution, which is
 * what campaign reporting actually runs on. That part carries no such risk and
 * is therefore never gated.
 */
const SEND_UTM_FIELDS = process.env.HUBSPOT_SEND_UTM_FIELDS === "true";

function buildFields(lead: LeadInput): HubSpotField[] {
  const phoneNumber =
    lead.phone && lead.phoneCountry ? `${lead.phoneCountry} ${lead.phone}` : lead.phone || "";
  const fields: HubSpotField[] = [
    { name: "firstname", value: lead.firstName },
    { name: "lastname", value: lead.lastName },
    { name: "email", value: lead.email },
    { name: "phone", value: phoneNumber },
    { name: "company", value: lead.company },
    { name: "jobrole", value: lead.role },
    { name: "message", value: lead.message },
  ];
  if (lead.interest) fields.push({ name: "interest", value: lead.interest });
  if (SEND_UTM_FIELDS) {
    fields.push(
      { name: "utm_source", value: lead.utmSource ?? "" },
      { name: "utm_medium", value: lead.utmMedium ?? "" },
      { name: "utm_campaign", value: lead.utmCampaign ?? "" },
      { name: "utm_term", value: lead.utmTerm ?? "" },
      { name: "utm_content", value: lead.utmContent ?? "" }
    );
  }
  return fields.filter((f) => f.value !== "");
}

export type HubSpotSubmitResult =
  | { ok: true; submittedAt: number }
  | { ok: false; status: number; error: string };

// HubSpot rejects a non-URI pageUri (e.g. a value with stray spaces), which fails the
// whole form submission. Normalise to a valid URI, or fall back to the default, so a
// malformed sourcePage can never break the sync.
function toValidPageUri(raw: string | null | undefined, fallback: string): string {
  if (raw) {
    try {
      const u = new URL(raw.trim());
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch {
      // not a parseable URL — use the fallback below
    }
  }
  return fallback;
}

export async function submitToHubSpotForm(lead: LeadInput): Promise<HubSpotSubmitResult> {
  const url = `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_CONTACT_FORM_ID}`;

  const body = {
    fields: buildFields(lead),
    context: {
      // Prefer the true first-touch landing page over the page the form sits on:
      // the landing page carries the campaign query string, which is what makes
      // this attributable. Falls back to the form page, then to the site root.
      pageUri: toValidPageUri(
        lead.landingPage || lead.sourcePage,
        "https://mmcbuild.com.au"
      ),
      pageName: lead.formType,
      // The HubSpot visitor token. This single field is what joins the
      // submission to the visitor's tracked session, and therefore to the ad
      // that produced it. Omitted when absent — HubSpot rejects an empty hutk,
      // and a lead with no attribution must still be captured.
      ...(lead.hutk ? { hutk: lead.hutk } : {}),
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: errorText.slice(0, 500) || `HubSpot returned ${response.status}`,
      };
    }
    return { ok: true, submittedAt: Date.now() };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Unknown HubSpot error",
    };
  }
}
