import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/db", () => ({
  db: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

import { getSubscriptionStatus, checkAndIncrementUsage } from "@/lib/stripe/subscription";

// Supabase query builders are thenable: `await client.from(...).select(...).eq(...).order(...)`
// resolves to `{ data, error }`. The mock chain mirrors that — every chain method returns
// `chain`, the whole chain resolves on await, and `.single()` resolves to the same payload.
function mockChain(data: unknown, error: unknown = null) {
  const result = { data, error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(result),
    then: (onFulfilled: (value: typeof result) => unknown) => Promise.resolve(result).then(onFulfilled),
  };
  return chain;
}

describe("getSubscriptionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active subscription status for paid user", async () => {
    const sub = {
      plan_id: "professional",
      status: "active",
      usage_count: 15,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
    };

    mockFrom.mockReturnValue(mockChain([sub]));

    const status = await getSubscriptionStatus("org-1");

    expect(status.tier).toBe("professional");
    expect(status.status).toBe("active");
    expect(status.usageCount).toBe(15);
    expect(status.usageLimit).toBe(30);
    expect(status.canRunCheck).toBe(true);
  });

  it("returns canRunCheck=false when at usage limit", async () => {
    const sub = {
      plan_id: "basic",
      status: "active",
      usage_count: 10,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
    };

    mockFrom.mockReturnValue(mockChain([sub]));

    const status = await getSubscriptionStatus("org-1");

    expect(status.canRunCheck).toBe(false);
    expect(status.usageCount).toBe(10);
    expect(status.usageLimit).toBe(10);
  });

  it("returns canRunCheck=false for past_due subscription", async () => {
    const sub = {
      plan_id: "professional",
      status: "past_due",
      usage_count: 5,
      current_period_end: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
    };

    mockFrom.mockReturnValue(mockChain([sub]));

    const status = await getSubscriptionStatus("org-1");

    expect(status.canRunCheck).toBe(false);
    expect(status.status).toBe("past_due");
  });

  it("returns trial status for org with no subscription", async () => {
    const subsQuery = mockChain([]); // no active subs
    const orgQuery = mockChain({
      trial_started_at: new Date().toISOString(),
      trial_ends_at: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      trial_usage_count: 1,
    });

    mockFrom.mockReturnValueOnce(subsQuery).mockReturnValueOnce(orgQuery);

    const status = await getSubscriptionStatus("org-1");

    expect(status.tier).toBe("trial");
    expect(status.status).toBe("trialing");
    expect(status.usageCount).toBe(1);
    expect(status.usageLimit).toBe(3);
    expect(status.canRunCheck).toBe(true);
  });

  it("returns expired when trial runs exhausted", async () => {
    const subsQuery = mockChain([]);
    const orgQuery = mockChain({
      trial_started_at: new Date().toISOString(),
      trial_ends_at: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      trial_usage_count: 3,
    });

    mockFrom.mockReturnValueOnce(subsQuery).mockReturnValueOnce(orgQuery);

    const status = await getSubscriptionStatus("org-1");

    expect(status.tier).toBe("expired");
    expect(status.canRunCheck).toBe(false);
  });

  it("returns expired when trial period has elapsed", async () => {
    const subsQuery = mockChain([]);
    const orgQuery = mockChain({
      trial_started_at: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString(),
      trial_ends_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      trial_usage_count: 1,
    });

    mockFrom.mockReturnValueOnce(subsQuery).mockReturnValueOnce(orgQuery);

    const status = await getSubscriptionStatus("org-1");

    expect(status.tier).toBe("expired");
    expect(status.canRunCheck).toBe(false);
  });
});

describe("checkAndIncrementUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks when usage limit reached", async () => {
    const sub = {
      plan_id: "basic",
      status: "active",
      usage_count: 10,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
    };

    mockFrom.mockReturnValue(mockChain([sub]));

    const result = await checkAndIncrementUsage("org-1");

    expect(result.allowed).toBe(false);
    expect(result.newCount).toBe(10);
  });

  it("allows and increments when under limit", async () => {
    const sub = {
      plan_id: "professional",
      status: "active",
      usage_count: 5,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
    };

    mockFrom.mockReturnValue(mockChain([sub]));
    mockRpc.mockResolvedValue({ data: 6 });

    const result = await checkAndIncrementUsage("org-1");

    expect(result.allowed).toBe(true);
    expect(result.newCount).toBe(6);
  });
});
