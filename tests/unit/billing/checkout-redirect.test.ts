import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// SCRUM-332 regression. The checkout button was dead for the entire life of the
// product, and it looked exactly like a configuration problem — which is why it
// survived so long and cost so much diagnosis.
//
// The action returned `{ clientSecret, sessionId }`. `client_secret` is ALWAYS
// null on a hosted Checkout session (Stripe populates it only for
// `ui_mode: 'embedded'`), and the client redirected only when it was truthy. So
// every click created a real Stripe session and went nowhere: no navigation, no
// error on screen, nothing in the console, and a growing pile of abandoned
// sessions in the Stripe account that nobody was looking at.
//
// These tests pin the two properties that make the button work:
//   1. the action returns Stripe's own hosted `url`
//   2. a failure returns a NAMED error rather than a silent empty result
//
// Neither is expressible as a type — `{clientSecret, sessionId}` typechecked
// perfectly — so a test is the only thing that holds this.

const ENV_KEY = "STRIPE_ESSENTIAL_MONTHLY_PRICE_ID";
const originalPrice = process.env[ENV_KEY];

const mockGetUser = vi.fn();
const mockServerFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser }, from: mockServerFrom }),
}));

const mockDbFrom = vi.fn();
vi.mock("@/lib/supabase/db", () => ({ db: () => ({ from: mockDbFrom }) }));

const { sessionsCreate, customersCreate, portalCreate } = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  customersCreate: vi.fn(),
  portalCreate: vi.fn(),
}));
vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    checkout: { sessions: { create: sessionsCreate } },
    customers: { create: customersCreate },
    billingPortal: { sessions: { create: portalCreate } },
  },
}));
vi.mock("@/lib/stripe/subscription", () => ({ getSubscriptionStatus: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
// createCheckoutSession reads the `_ga` cookie for GA4 attribution — `cookies()`
// requires a live Next.js request scope, which does not exist in a plain
// vitest run, so it must be mocked like every other framework boundary here.
// No cookie present is the correct default: gaClientId ends up null and the
// tests below are unaffected by GA4 metadata either way.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(data: unknown): any {
  const payload = { data, error: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    update: vi.fn(() => c),
    single: vi.fn().mockResolvedValue(payload),
    then: (f: (v: typeof payload) => unknown) => Promise.resolve(payload).then(f),
  };
  return c;
}

/** The action reads PLANS at module scope, so price env must be set before import. */
async function loadActions() {
  vi.resetModules();
  process.env[ENV_KEY] = "price_essential_monthly";
  return import("@/app/(dashboard)/billing/actions");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "qa@example.com" } } });
  mockServerFrom.mockReturnValue(chain({ org_id: "org-1" }));
  mockDbFrom.mockReturnValue(chain({ id: "org-1", name: "QA Org", stripe_customer_id: "cus_1" }));
});

afterAll(() => {
  if (originalPrice === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalPrice;
});

describe("createCheckoutSession — the redirect contract (SCRUM-332)", () => {
  it("returns Stripe's hosted url, which is what the browser is sent to", async () => {
    sessionsCreate.mockResolvedValue({
      id: "cs_test_123",
      // A hosted session: client_secret is null. This is the exact shape that
      // used to make the button do nothing.
      client_secret: null,
      url: "https://checkout.stripe.com/c/pay/cs_test_123#fidFragment",
    });

    const { createCheckoutSession } = await loadActions();
    const result = await createCheckoutSession("essential");

    expect(result.url).toBe("https://checkout.stripe.com/c/pay/cs_test_123#fidFragment");
  });

  it("does not depend on client_secret, which is null for every hosted session", async () => {
    sessionsCreate.mockResolvedValue({
      id: "cs_test_123",
      client_secret: null,
      url: "https://checkout.stripe.com/c/pay/cs_test_123#fid",
    });

    const { createCheckoutSession } = await loadActions();
    const result = await createCheckoutSession("essential");

    // The regression: a truthy url must be returned even though client_secret
    // is null. If someone reintroduces a client_secret dependency, this fails.
    expect(result.url).toBeTruthy();
  });

  it("never returns a url that was rebuilt from the session id", async () => {
    // The old code navigated to `checkout.stripe.com/c/pay/<sessionId>`. That
    // address is incomplete — Stripe's real url carries a required fragment —
    // so a reconstructed one fails for the user even when everything else is
    // configured correctly.
    sessionsCreate.mockResolvedValue({
      id: "cs_test_abc",
      client_secret: null,
      url: "https://checkout.stripe.com/c/pay/cs_test_abc#fidREQUIRED",
    });

    const { createCheckoutSession } = await loadActions();
    const result = await createCheckoutSession("essential");

    expect(result.url).toContain("#fid");
    expect(result.url).not.toBe("https://checkout.stripe.com/c/pay/cs_test_abc");
  });

  it("names the failure instead of returning an empty result", async () => {
    // Stripe rejects the session — e.g. Stripe Tax not enabled, or a price id
    // that does not exist. The caller must get something it can show, or the
    // failure is indistinguishable from a dead button.
    sessionsCreate.mockRejectedValue(new Error("No such price: 'prod_abc'"));

    const { createCheckoutSession } = await loadActions();
    const result = await createCheckoutSession("essential");

    expect(result.url).toBeUndefined();
    expect(result.error).toContain("No such price");
  });

  it("refuses an unconfigured plan before calling Stripe at all", async () => {
    vi.resetModules();
    delete process.env[ENV_KEY];
    delete process.env.STRIPE_ESSENTIAL_EARLY_PRICE_ID;

    const { createCheckoutSession } = await import("@/app/(dashboard)/billing/actions");
    const result = await createCheckoutSession("essential");

    expect(result.error).toBe("Plan not configured in Stripe");
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("asks Stripe to calculate tax — the GST line depends on it", async () => {
    sessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: null, url: "https://checkout.stripe.com/x#f" });

    const { createCheckoutSession } = await loadActions();
    await createCheckoutSession("essential");

    const args = sessionsCreate.mock.calls[0][0];
    // Prices are quoted tax-EXCLUSIVE. Without this the session charges a flat
    // $49 while every price surface in the app says "+ GST".
    expect(args.automatic_tax).toEqual({ enabled: true });
    // Stripe Tax needs an address, and refuses the session without one.
    expect(args.billing_address_collection).toBe("required");
    expect(args.customer_update?.address).toBe("auto");
  });
});
