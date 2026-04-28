import { test, expect } from "./fixtures";

test.describe("Access Control", () => {
  test("TC-ACCESS-001: All authenticated users see all five modules", async ({
    builderPage,
  }) => {
    // Persona-based module gating was removed — beta exposes every module
    // to every authenticated user so usage patterns can be observed.
    await builderPage.goto("/dashboard");
    const sidebar = builderPage.locator("nav");

    await expect(sidebar.locator('a:has-text("MMC Comply")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Build")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Quote")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Direct")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Train")')).toBeVisible();
  });

  test("TC-ACCESS-002: Unauthenticated user is redirected to /login", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await ctx.close();
  });
});
