import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/db", () => ({
  db: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

// Import after mocks are set up
import { getSubscriptionStatus, checkAndIncrementUsage } from "@/lib/stripe/subscription";

function mockQuery(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

// TODO(SCRUM-122): mocks target @/lib/supabase/db but the subscription
// module was refactored to use @/lib/supabase/admin (createAdminClient) and
// now reads different fields on the organisations row. Rewrite mocks.
describe.skip("getSubscriptionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active subscription status for paid user", async () => {
    const mockSub = {
      plan_id: "professional",
      status: "active",
      usage_count: 15,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
    };

    mockFrom.mockReturnValue(mockQuery(mockSub));

    const status = await getSubscriptionStatus("org-1");

    expect(status.tier).toBe("professional");
    expect(status.status).toBe("active");
    expect(status.usageCount).toBe(15);
    expect(status.usageLimit).toBe(30);
    expect(status.canRunCheck).toBe(true);
  });

  it("returns canRunCheck=false when at usage limit", async () => {
    const mockSub = {
      plan_id: "basic",
      status: "active",
      usage_count: 10,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
    };

    mockFrom.mockReturnValue(mockQuery(mockSub));

    const status = await getSubscriptionStatus("org-1");

    expect(status.canRunCheck).toBe(false);
    expect(status.usageCount).toBe(10);
    expect(status.usageLimit).toBe(10);
  });

  it("returns canRunCheck=false for past_due subscription", async () => {
    const mockSub = {
      plan_id: "professional",
      status: "past_due",
      usage_count: 5,
      current_period_end: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
    };

    mockFrom.mockReturnValue(mockQuery(mockSub));

    const status = await getSubscriptionStatus("org-1");

    expect(status.canRunCheck).toBe(false);
    expect(status.status).toBe("past_due");
  });

  it("returns trial status for org with no subscription", async () => {
    // First call: subscriptions query returns null
    const subQuery = mockQuery(null);
    // Second call: organisations query returns trial data
    const orgQuery = mockQuery({
      trial_started_at: new Date().toISOString(),
      trial_ends_at: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      trial_usage_count: 1,
    });

    mockFrom
      .mockReturnValueOnce(subQuery)
      .mockReturnValueOnce(orgQuery);

    const status = await getSubscriptionStatus("org-1");

    expect(status.tier).toBe("trial");
    expect(status.status).toBe("trialing");
    expect(status.usageCount).toBe(1);
    expect(status.usageLimit).toBe(3);
    expect(status.canRunCheck).toBe(true);
  });

  it("returns expired when trial runs exhausted", async () => {
    const subQuery = mockQuery(null);
    const orgQuery = mockQuery({
      trial_started_at: new Date().toISOString(),
      trial_ends_at: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      trial_usage_count: 3,
    });

    mockFrom
      .mockReturnValueOnce(subQuery)
      .mockReturnValueOnce(orgQuery);

    const status = await getSubscriptionStatus("org-1");

    expect(status.tier).toBe("expired");
    expect(status.canRunCheck).toBe(false);
  });

  it("returns expired when trial period has elapsed", async () => {
    const subQuery = mockQuery(null);
    const orgQuery = mockQuery({
      trial_started_at: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString(),
      trial_ends_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      trial_usage_count: 1,
    });

    mockFrom
      .mockReturnValueOnce(subQuery)
      .mockReturnValueOnce(orgQuery);

    const status = await getSubscriptionStatus("org-1");

    expect(status.tier).toBe("expired");
    expect(status.canRunCheck).toBe(false);
  });
});

describe.skip("checkAndIncrementUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks when usage limit reached", async () => {
    const mockSub = {
      plan_id: "basic",
      status: "active",
      usage_count: 10,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
    };

    mockFrom.mockReturnValue(mockQuery(mockSub));

    const result = await checkAndIncrementUsage("org-1");

    expect(result.allowed).toBe(false);
    expect(result.newCount).toBe(10);
  });

  it("allows and increments when under limit", async () => {
    const mockSub = {
      plan_id: "professional",
      status: "active",
      usage_count: 5,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
    };

    mockFrom.mockReturnValue(mockQuery(mockSub));
    mockRpc.mockResolvedValue({ data: 6 });

    const result = await checkAndIncrementUsage("org-1");

    expect(result.allowed).toBe(true);
    expect(result.newCount).toBe(6);
  });
});
