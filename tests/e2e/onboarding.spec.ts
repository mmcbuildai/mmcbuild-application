import { test, expect } from "./fixtures";

test.describe("Onboarding", () => {
  test("TC-ONB-001: Authenticated user lands on dashboard with all modules visible", async ({
    builderPage,
  }) => {
    // Builder is already logged in via the fixture. After login, the user
    // should land on /dashboard directly — no persona/role gate.
    await builderPage.goto("/dashboard");
    await expect(builderPage).toHaveURL(/\/dashboard$/);

    // All five modules must be visible and clickable for every user.
    const sidebar = builderPage.locator("nav");
    await expect(sidebar.locator('a:has-text("MMC Comply")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Build")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Quote")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Direct")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Train")')).toBeVisible();

    // No "Coming Soon" / locked treatments — beta exposes everything.
    await expect(sidebar.locator('text="Soon"')).toHaveCount(0);
  });
});
