import { describe, it, expect, vi, beforeEach } from "vitest";

const submitToHubSpotForm = vi.fn();
vi.mock("@/lib/hubspot/forms", () => ({
  submitToHubSpotForm: (...args: unknown[]) => submitToHubSpotForm(...args),
}));

// `leads` is not in the generated types, so the module uses the untyped
// service-role helper. Swap it for an in-memory double.
let currentClient: unknown = null;
vi.mock("@/lib/supabase/db", () => ({ db: () => currentClient }));

import { recordSignupLead } from "@/lib/hubspot/signup";

/**
 * Sign-up is about to become the destination of the social-ad CTA (client call
 * 2026-07-29). Only /api/leads wrote to HubSpot before this, so the repoint would
 * have taken CRM capture to zero.
 *
 * Two properties are locked here, and the second is the important one:
 *  1. the lead is recorded with a sane name split before HubSpot is called;
 *  2. NOTHING in this path may throw. It runs inside provisionUser, in the auth
 *     path of a REGULATED product — a HubSpot outage or a CRM schema change must
 *     never stop someone creating an account.
 */
type InsertCall = Record<string, unknown>;

function makeAdmin(opts: { insertError?: boolean; throwOn?: "insert" } = {}) {
  const inserts: InsertCall[] = [];
  const updates: InsertCall[] = [];
  const admin = {
    from(table: string) {
      return {
        insert(row: InsertCall) {
          if (opts.throwOn === "insert") throw new Error("connection reset");
          if (table === "leads") inserts.push(row);
          return {
            select: () => ({
              single: async () =>
                opts.insertError
                  ? { data: null, error: { message: "insert failed" } }
                  : { data: { id: "lead-1" }, error: null },
            }),
          };
        },
        update(row: InsertCall) {
          updates.push(row);
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
  };
  return { admin, inserts, updates };
}

describe("recordSignupLead", () => {
  beforeEach(() => {
    submitToHubSpotForm.mockReset();
    submitToHubSpotForm.mockResolvedValue({ ok: true, submittedAt: 1 });
  });

  it("records the lead and marks it synced when HubSpot accepts", async () => {
    const { admin, inserts, updates } = makeAdmin();
    currentClient = admin;
    await recordSignupLead({
      email: "Ada@Example.com",
      fullName: "Ada Lovelace",
      orgName: "Analytical Engines",
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      form_type: "signup",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com", // normalised
      company: "Analytical Engines",
    });
    expect(submitToHubSpotForm).toHaveBeenCalledTimes(1);
    expect(updates[0]).toMatchObject({ hubspot_sync_status: "synced" });
  });

  it("splits a multi-word surname into a single last name", async () => {
    const { admin, inserts } = makeAdmin();
    currentClient = admin;
    await recordSignupLead({
      email: "k@example.com",
      fullName: "Karen van der Burns",
    });
    expect(inserts[0]).toMatchObject({
      first_name: "Karen",
      last_name: "van der Burns",
    });
  });

  it("falls back to the email local-part when no name is given", async () => {
    const { admin, inserts } = makeAdmin();
    currentClient = admin;
    await recordSignupLead({ email: "builder@mmc.com.au" });
    expect(inserts[0]).toMatchObject({ first_name: "builder", last_name: null });
  });

  it("records the failure on the row when HubSpot rejects, and still does not throw", async () => {
    submitToHubSpotForm.mockResolvedValue({
      ok: false,
      status: 400,
      error: "INVALID_PAGE_URI",
    });
    const { admin, updates } = makeAdmin();
    currentClient = admin;
    await expect(
      recordSignupLead({ email: "a@b.com", fullName: "A B" }),
    ).resolves.toBeUndefined();
    expect(updates[0]).toMatchObject({
      hubspot_sync_status: "failed",
      hubspot_error: "INVALID_PAGE_URI",
    });
  });

  it("does not call HubSpot when the durable row could not be written", async () => {
    const { admin } = makeAdmin({ insertError: true });
    currentClient = admin;
    await recordSignupLead({ email: "a@b.com", fullName: "A B" });
    // Our own record is the source of truth; without it there is nothing to
    // record a sync verdict against, so the CRM call is skipped.
    expect(submitToHubSpotForm).not.toHaveBeenCalled();
  });

  it("NEVER throws, even if the database client blows up mid-call", async () => {
    const { admin } = makeAdmin({ throwOn: "insert" });
    currentClient = admin;
    await expect(
      recordSignupLead({ email: "a@b.com", fullName: "A B" }),
    ).resolves.toBeUndefined();
  });

  it("NEVER throws when HubSpot itself rejects the promise", async () => {
    submitToHubSpotForm.mockRejectedValue(new Error("network down"));
    const { admin } = makeAdmin();
    currentClient = admin;
    await expect(
      recordSignupLead({ email: "a@b.com", fullName: "A B" }),
    ).resolves.toBeUndefined();
  });

  it("ignores an empty email rather than writing a junk lead", async () => {
    const { admin, inserts } = makeAdmin();
    currentClient = admin;
    await recordSignupLead({ email: "   " });
    expect(inserts).toHaveLength(0);
    expect(submitToHubSpotForm).not.toHaveBeenCalled();
  });
});
