import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitToHubSpotForm } from "@/lib/hubspot/forms";
import { leadSchema, type LeadInput } from "@/lib/validators/lead";

/**
 * These pin the two things that decide whether campaign attribution works at
 * all, and the one thing that could break live lead capture if it regressed:
 *
 *  - `context.hutk` is sent when known, and OMITTED when not (HubSpot rejects an
 *    empty hutk, and an unattributed lead must still be captured).
 *  - utm_* form fields are NOT sent unless explicitly enabled, because HubSpot
 *    400s an entire submission that names a field the form does not define.
 */

function lead(overrides: Partial<LeadInput> = {}): LeadInput {
  return leadSchema.parse({
    formType: "contact",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    ...overrides,
  });
}

function lastRequestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0];
  return JSON.parse((init as RequestInit).body as string);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("HubSpot submission — visitor token", () => {
  it("sends hutk when the submitting page supplied one", async () => {
    await submitToHubSpotForm(lead({ hutk: "utk-abc-123" }));
    expect(lastRequestBody(fetchMock).context.hutk).toBe("utk-abc-123");
  });

  it("omits hutk entirely when unknown, rather than sending an empty string", async () => {
    await submitToHubSpotForm(lead());
    expect(lastRequestBody(fetchMock).context).not.toHaveProperty("hutk");
  });

  it("still submits the lead when there is no attribution at all", async () => {
    const result = await submitToHubSpotForm(lead());
    expect(result.ok).toBe(true);
  });
});

describe("HubSpot submission — pageUri", () => {
  it("prefers the first-touch landing page, which carries the campaign", async () => {
    await submitToHubSpotForm(
      lead({
        landingPage: "https://mmcbuild.com.au/?utm_source=facebook",
        sourcePage: "https://mmcbuild.com.au/contact",
      })
    );
    expect(lastRequestBody(fetchMock).context.pageUri).toBe(
      "https://mmcbuild.com.au/?utm_source=facebook"
    );
  });

  it("falls back to the form page when no landing page was recorded", async () => {
    await submitToHubSpotForm(lead({ sourcePage: "https://mmcbuild.com.au/contact" }));
    expect(lastRequestBody(fetchMock).context.pageUri).toBe("https://mmcbuild.com.au/contact");
  });
});

describe("HubSpot submission — utm fields are opt-in", () => {
  it("does NOT send utm_* by default", async () => {
    await submitToHubSpotForm(lead({ utmSource: "facebook", utmCampaign: "aug" }));
    const names = lastRequestBody(fetchMock).fields.map((f: { name: string }) => f.name);
    expect(names).not.toContain("utm_source");
    expect(names).not.toContain("utm_campaign");
  });

  it("sends utm_* only once explicitly enabled", async () => {
    vi.stubEnv("HUBSPOT_SEND_UTM_FIELDS", "true");
    vi.resetModules();
    const { submitToHubSpotForm: fresh } = await import("@/lib/hubspot/forms");

    await fresh(lead({ utmSource: "facebook", utmCampaign: "aug" }));
    const fields = lastRequestBody(fetchMock).fields as Array<{ name: string; value: string }>;
    expect(fields).toContainEqual({ name: "utm_source", value: "facebook" });
    expect(fields).toContainEqual({ name: "utm_campaign", value: "aug" });
  });
});

describe("lead contract", () => {
  it("accepts a payload with no attribution — the currently-deployed marketing site", async () => {
    // The live brochure site keeps posting the old shape until it is redeployed.
    // If this ever throws, every lead from the live site is rejected.
    const parsed = leadSchema.safeParse({
      formType: "waitlist",
      firstName: "Ada",
      email: "ada@example.com",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.hutk).toBe("");
  });
});
