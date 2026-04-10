import { test, expect, loginViaUI, TEST_USERS, seedTestUser, adminClient } from "./fixtures";

test.describe("Onboarding", () => {
  test("TC-ONB-001: New user registration and persona selection", async ({
    browser,
  }) => {
    // Use the "fresh" test user — seeded via admin API with no persona
    // (Public signup rejects test email domains, so we test the onboarding
    // flow using an admin-seeded user who has never selected a persona)
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Login as the fresh user (no persona set)
    await loginViaUI(page, TEST_USERS.fresh);

    // Should redirect to /onboarding since persona is null
    await page.waitForURL("**/onboarding", { timeout: 15_000 });
    await expect(page.getByText("Welcome to MMC Build")).toBeVisible();

    // Select Builder persona
    await page.getByRole("button", { name: "Builder" }).first().click();
    await page.getByRole("button", { name: "Continue" }).click();

    // Should land on /dashboard
    await page.waitForURL("**/dashboard", { timeout: 15_000 });

    // Sidebar should show Builder modules
    const sidebar = page.locator("nav");
    await expect(sidebar.getByText("MMC Comply")).toBeVisible();
    await expect(sidebar.getByText("MMC Build")).toBeVisible();

    // Reset persona back to null for future test runs
    const sb = adminClient();
    const { data } = await sb.auth.admin.listUsers();
    const user = data?.users?.find((u) => u.email === TEST_USERS.fresh.email);
    if (user) {
      await sb.from("profiles").update({ persona: null }).eq("user_id", user.id);
    }

    await ctx.close();
  });

  test("TC-ONB-002: Persona reset via settings", async ({ builderPage }) => {
    // Builder is already logged in with builder persona
    // Navigate directly to the profile settings page
    await builderPage.goto("/settings/profile");

    // Should see current role displayed as "Builder"
    await expect(builderPage.getByText("Builder", { exact: true })).toBeVisible();

    // Click "Change role"
    await builderPage.getByRole("button", { name: "Change role" }).click();

    // Confirm in the alert dialog — button text is "Continue"
    const dialog = builderPage.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Continue" }).click();

    // Should redirect to onboarding
    await builderPage.waitForURL("**/onboarding", { timeout: 15_000 });
    await expect(builderPage.getByText("Welcome to MMC Build")).toBeVisible();

    // Select Consultant persona this time
    await builderPage.getByRole("button", { name: "Consultant" }).click();
    await builderPage.getByRole("button", { name: "Continue" }).click();

    // Should land on dashboard
    await builderPage.waitForURL("**/dashboard", { timeout: 15_000 });

    // Sidebar should now show Consultant modules (Comply only)
    const sidebar = builderPage.locator("nav");
    await expect(sidebar.locator('a:has-text("MMC Comply")')).toBeVisible();
    // Build should NOT be visible for consultant
    await expect(sidebar.getByText("MMC Build")).not.toBeVisible();

    // Reset back to builder for other tests (via admin API)
    const sb = adminClient();
    const { data } = await sb.auth.admin.listUsers();
    const user = data?.users?.find((u) => u.email === TEST_USERS.builder.email);
    if (user) {
      await sb
        .from("profiles")
        .update({ persona: "builder" })
        .eq("user_id", user.id);
    }
  });

  test("TC-ONB-003: First login redirect to onboarding if persona not set", async ({
    browser,
  }) => {
    // Use the "nopersona" test user — persona is deliberately null
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await loginViaUI(page, TEST_USERS.nopersona);

    // User should be redirected to /onboarding, not /dashboard
    // loginViaUI waits for redirect away from /login — check where we landed
    await page.waitForURL("**/onboarding", { timeout: 15_000 });
    await expect(page.getByText("Welcome to MMC Build")).toBeVisible();

    await ctx.close();
  });
});
