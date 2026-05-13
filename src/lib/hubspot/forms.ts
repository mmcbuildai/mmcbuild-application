import type { LeadInput } from "@/lib/validators/lead";

const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID ?? "442558966";
const HUBSPOT_CONTACT_FORM_ID =
  process.env.HUBSPOT_CONTACT_FORM_ID ?? "9ef67321-b4cb-45b5-b3c1-e9d2301e0710";

type HubSpotField = { name: string; value: string };

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
  return fields.filter((f) => f.value !== "");
}

export type HubSpotSubmitResult =
  | { ok: true; submittedAt: number }
  | { ok: false; status: number; error: string };

export async function submitToHubSpotForm(lead: LeadInput): Promise<HubSpotSubmitResult> {
  const url = `https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_PORTAL_ID}/${HUBSPOT_CONTACT_FORM_ID}`;

  const body = {
    fields: buildFields(lead),
    context: {
      pageUri: lead.sourcePage || "https://mmcbuild.com.au",
      pageName: lead.formType,
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
