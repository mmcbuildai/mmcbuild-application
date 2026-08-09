import { describe, it, expect, vi, beforeEach } from "vitest";

// SCRUM-378 regression.
//
// Karen reported the same thing twice: a project is created, she is returned to
// Saved Projects, the project is not on the list, and re-entering the same name
// says it already exists. Both halves come from one place — after SCRUM-349
// removed revalidatePath("/projects") from createProject (it was racing the
// client's router.push and clobbering it), NOTHING refreshed the list. So any
// return to /projects showed the list as rendered BEFORE the project existed.
//
// The fix makes the two things happen in ONE server response: revalidate the
// list, then redirect. There is no client push left to race, so the revalidate
// is safe, and there is no window in which the list can be stale.
//
// These tests pin that pairing. Deleting either call — the revalidate or the
// redirect — brings back one of the two reported symptoms, so each is asserted
// on its own rather than as "it navigated somewhere".

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(),
  }),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockAdminFrom, storage: { from: vi.fn() } }),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

// redirect() is a throw in Next. Model that faithfully: a test that let it
// return would also pass against code that called redirect() and then carried
// on, which is not how the real thing behaves.
const mockRedirect = vi.fn((url: string) => {
  const err = new Error(`NEXT_REDIRECT ${url}`) as Error & { digest?: string };
  err.digest = `NEXT_REDIRECT;push;${url};307;`;
  throw err;
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/lib/site-intel", () => ({ deriveSiteIntel: vi.fn() }));
vi.mock("@/lib/services/mapbox", () => ({ getStaticMapUrl: () => null }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import { createProject } from "@/app/(dashboard)/projects/actions";
import { isRedirectError } from "@/lib/navigation/redirect-error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockChain(result: { data: unknown; error?: unknown }): any {
  const payload = { error: null, ...result };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(payload),
    maybeSingle: vi.fn().mockResolvedValue(payload),
    then: (onFulfilled: (value: typeof payload) => unknown) =>
      Promise.resolve(payload).then(onFulfilled),
  };
  return chain;
}

const PROFILE = { id: "prof-1", org_id: "org-1", role: "owner" };

function formWith(name: string) {
  const fd = new FormData();
  fd.set("name", name);
  return fd;
}

/** Run the action, absorbing the redirect throw so assertions can follow. */
async function run(fd: FormData) {
  try {
    return { result: await createProject(fd), threw: null as unknown };
  } catch (e) {
    return { result: undefined, threw: e };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("createProject — the list is fresh AND the user is moved (SCRUM-378)", () => {
  beforeEach(() => {
    mockAdminFrom
      .mockReturnValueOnce(mockChain({ data: PROFILE })) // getProfile()
      .mockReturnValueOnce(mockChain({ data: { id: "new-project-1" } })); // insert
  });

  it("revalidates /projects, so a return to the list cannot show a pre-create render", async () => {
    await run(formWith("Karen test 8"));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/projects");
  });

  it("redirects to the new project from the server, leaving no client push to race", async () => {
    await run(formWith("Karen test 8"));
    expect(mockRedirect).toHaveBeenCalledWith("/projects/new-project-1");
  });

  it("revalidates BEFORE redirecting — a redirect that throws first would skip it", async () => {
    await run(formWith("Karen test 8"));
    expect(mockRevalidatePath.mock.invocationCallOrder[0]).toBeLessThan(
      mockRedirect.mock.invocationCallOrder[0],
    );
  });

  it("lands on the Overview tab, which is the only tab a new project has", async () => {
    // ProjectTabs hides any tab above `setup_step`, and setup_step is 0 on a
    // new project — so the old `?tab=documents` target asked for a tab that was
    // not in the strip.
    await run(formWith("Karen test 8"));
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.not.stringContaining("tab="),
    );
  });
});

describe("createProject — a failure the user can act on still RETURNS (SCRUM-378)", () => {
  it("returns the duplicate-name message instead of redirecting", async () => {
    mockAdminFrom
      .mockReturnValueOnce(mockChain({ data: PROFILE }))
      .mockReturnValueOnce(
        mockChain({
          data: null,
          error: { code: "23505", message: "unique_project_name_per_org" },
        }),
      );

    const { result } = await run(formWith("Karen test 8"));

    expect(result?.error).toContain("already exists");
    expect(mockRedirect).not.toHaveBeenCalled();
    // Nothing was created, so nothing about the list changed. Revalidating here
    // would be harmless but dishonest — it would claim a write happened.
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("returns a missing-name message without touching the database", async () => {
    mockAdminFrom.mockReturnValueOnce(mockChain({ data: PROFILE }));

    const { result } = await run(formWith("   "));

    expect(result?.error).toBe("Project name is required");
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("isRedirectError — the dialog must not swallow a redirect", () => {
  // The create dialog awaits the action inside a try/catch that shows the
  // caught message to the user. Before this guard, a successful create would
  // have been caught there and rendered as a failure carrying Next's internal
  // string — the exact "meaningless message" defect SCRUM-378 started as.
  it("recognises the throw a server-action redirect produces", () => {
    const err = new Error("NEXT_REDIRECT") as Error & { digest?: string };
    err.digest = "NEXT_REDIRECT;push;/projects/new-project-1;307;";
    expect(isRedirectError(err)).toBe(true);
  });

  it("does not claim an ordinary failure is a redirect", () => {
    expect(isRedirectError(new Error("Failed to create project"))).toBe(false);
    expect(isRedirectError({ digest: "NEXT_NOT_FOUND" })).toBe(false);
    expect(isRedirectError(null)).toBe(false);
    expect(isRedirectError("NEXT_REDIRECT")).toBe(false);
  });
});
