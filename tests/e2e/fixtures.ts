import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase admin client — uses service-role key so we can seed/teardown users
// ---------------------------------------------------------------------------
export function adminClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ---------------------------------------------------------------------------
// Test user definitions — one per persona
// ---------------------------------------------------------------------------
export interface TestUser {
  email: string;
  password: string;
  fullName: string;
  orgName: string;
  persona: string | null; // null = no persona (for onboarding tests)
}

const suffix = process.env.TEST_EMAIL_SUFFIX || "@e2e-test.mmcbuild.local";

export const TEST_USERS: Record<string, TestUser> = {
  builder: {
    email: `e2e-builder${suffix}`,
    password: "Test1234!secure",
    fullName: "E2E Builder",
    orgName: "E2E Builder Org",
    persona: "builder",
  },
  consultant: {
    email: `e2e-consultant${suffix}`,
    password: "Test1234!secure",
    fullName: "E2E Consultant",
    orgName: "E2E Consultant Org",
    persona: "consultant",
  },
  admin: {
    email: `e2e-admin${suffix}`,
    password: "Test1234!secure",
    fullName: "E2E Admin",
    orgName: "E2E Admin Org",
    persona: "admin",
  },
  trade: {
    email: `e2e-trade${suffix}`,
    password: "Test1234!secure",
    fullName: "E2E Trade",
    orgName: "E2E Trade Org",
    persona: "trade",
  },
  nopersona: {
    email: `e2e-nopersona${suffix}`,
    password: "Test1234!secure",
    fullName: "E2E NoPersona",
    orgName: "E2E NoPersona Org",
    persona: null, // deliberately unset
  },
  fresh: {
    email: `e2e-fresh${suffix}`,
    password: "Test1234!secure",
    fullName: "E2E Fresh",
    orgName: "E2E Fresh Org",
    persona: null,
  },
};

// ---------------------------------------------------------------------------
// Seed a test user via Supabase admin API (idempotent)
// ---------------------------------------------------------------------------
export async function seedTestUser(user: TestUser) {
  const sb = adminClient();

  // Try to find existing user by email
  const { data: existing } = await sb.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email === user.email);

  let userId: string;

  if (found) {
    userId = found.id;
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    if (error) throw new Error(`Failed to create user ${user.email}: ${error.message}`);
    userId = data.user.id;
  }

  // Ensure org exists
  const { data: existingProfile } = await sb
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", userId)
    .maybeSingle();

  let orgId: string;

  if (existingProfile?.org_id) {
    orgId = existingProfile.org_id;
  } else {
    const { data: org, error: orgErr } = await sb
      .from("organisations")
      .insert({ name: user.orgName })
      .select("id")
      .single();
    if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);
    orgId = org.id;
  }

  // Upsert profile
  if (existingProfile) {
    await sb
      .from("profiles")
      .update({ persona: user.persona, full_name: user.fullName })
      .eq("id", existingProfile.id);
  } else {
    await sb.from("profiles").insert({
      org_id: orgId,
      user_id: userId,
      role: "owner",
      full_name: user.fullName,
      email: user.email,
      persona: user.persona,
    });
  }

  return { userId, orgId };
}

// ---------------------------------------------------------------------------
// UI login helper — signs in via the /login page
// ---------------------------------------------------------------------------
export async function loginViaUI(page: Page, user: TestUser) {
  await page.goto("/login");
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Helper: create a project via Supabase admin (for tests that need one)
// ---------------------------------------------------------------------------
export async function seedProject(orgId: string, profileId: string, name = "E2E Test Project") {
  const sb = adminClient();

  // Check if project already exists
  const { data: existing } = await sb
    .from("projects")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", name)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data, error } = await sb
    .from("projects")
    .insert({
      org_id: orgId,
      name,
      address: "123 Test Street, Sydney NSW 2000",
      status: "active",
      created_by: profileId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create project: ${error.message}`);
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Helper: get profile ID for a user
// ---------------------------------------------------------------------------
export async function getProfileId(userId: string) {
  const sb = adminClient();
  const { data } = await sb
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .single();
  return data?.id as string;
}

// ---------------------------------------------------------------------------
// Helper: set subscription tier via admin
// ---------------------------------------------------------------------------
export async function setSubscriptionTier(orgId: string, tier: string) {
  const sb = adminClient();
  await sb.from("organisations").update({ subscription_tier: tier }).eq("id", orgId);
}

// ---------------------------------------------------------------------------
// Helper: set run count for an org (for limit testing)
// ---------------------------------------------------------------------------
export async function setRunCount(orgId: string, count: number) {
  const sb = adminClient();
  // Reset or set the monthly run count
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: existing } = await sb
    .from("usage_tracking")
    .select("id")
    .eq("org_id", orgId)
    .eq("month", monthKey)
    .maybeSingle();

  if (existing) {
    await sb.from("usage_tracking").update({ run_count: count }).eq("id", existing.id);
  } else {
    await sb.from("usage_tracking").insert({
      org_id: orgId,
      month: monthKey,
      run_count: count,
    });
  }
}

// ---------------------------------------------------------------------------
// Cleanup — remove all E2E test users
// ---------------------------------------------------------------------------
export async function cleanupTestUsers() {
  const sb = adminClient();
  const { data } = await sb.auth.admin.listUsers();
  const e2eUsers = data?.users?.filter((u) => u.email?.includes("e2e-")) || [];

  for (const user of e2eUsers) {
    // Delete profile, org, projects first (cascade may handle this)
    const { data: profile } = await sb
      .from("profiles")
      .select("id, org_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      await sb.from("projects").delete().eq("org_id", profile.org_id);
      await sb.from("profiles").delete().eq("id", profile.id);
      await sb.from("organisations").delete().eq("id", profile.org_id);
    }

    await sb.auth.admin.deleteUser(user.id);
  }
}

// ---------------------------------------------------------------------------
// Extended Playwright test fixture with pre-authenticated pages
// ---------------------------------------------------------------------------
type Fixtures = {
  builderPage: Page;
  consultantPage: Page;
  adminPage: Page;
  tradePage: Page;
};

export const test = base.extend<Fixtures>({
  builderPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginViaUI(page, TEST_USERS.builder);
    await use(page);
    await ctx.close();
  },
  consultantPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginViaUI(page, TEST_USERS.consultant);
    await use(page);
    await ctx.close();
  },
  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginViaUI(page, TEST_USERS.admin);
    await use(page);
    await ctx.close();
  },
  tradePage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginViaUI(page, TEST_USERS.trade);
    await use(page);
    await ctx.close();
  },
});

export { expect };
