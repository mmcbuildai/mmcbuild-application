import { test, expect } from "./fixtures";

test.describe("Access Control", () => {
  test("TC-ACCESS-001: Builder persona sees correct modules in sidebar", async ({
    builderPage,
  }) => {
    await builderPage.goto("/dashboard");
    const sidebar = builderPage.locator("nav");

    // Builder should see all 5 modules
    await expect(sidebar.getByText("MMC Comply")).toBeVisible();
    await expect(sidebar.getByText("MMC Build")).toBeVisible();
    await expect(sidebar.getByText("MMC Quote")).toBeVisible();
    await expect(sidebar.getByText("MMC Direct")).toBeVisible();
    await expect(sidebar.getByText("MMC Train")).toBeVisible();

    // All should be clickable links, not locked
    await expect(sidebar.locator('a:has-text("MMC Comply")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Build")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Quote")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Direct")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Train")')).toBeVisible();
  });

  test("TC-ACCESS-002: Consultant persona sees Comply only", async ({
    consultantPage,
  }) => {
    await consultantPage.goto("/dashboard");
    const sidebar = consultantPage.locator("nav");

    // Consultant should see Comply
    await expect(sidebar.getByText("MMC Comply")).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Comply")')).toBeVisible();

    // Other modules should not be visible at all (hidden, not locked)
    await expect(sidebar.getByText("MMC Build")).not.toBeVisible();
    await expect(sidebar.getByText("MMC Quote")).not.toBeVisible();
    await expect(sidebar.getByText("MMC Direct")).not.toBeVisible();
    await expect(sidebar.getByText("MMC Train")).not.toBeVisible();
  });

  test("TC-ACCESS-003: Admin user has access to all modules", async ({
    adminPage,
  }) => {
    await adminPage.goto("/dashboard");
    const sidebar = adminPage.locator("nav");

    // Admin should see all 5 modules as clickable links
    await expect(sidebar.locator('a:has-text("MMC Comply")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Build")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Quote")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Direct")')).toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Train")')).toBeVisible();
  });

  test("TC-ACCESS-004: Trade persona sees Coming Soon state", async ({
    tradePage,
  }) => {
    await tradePage.goto("/dashboard");
    const sidebar = tradePage.locator("nav");

    // All 5 module names should be visible
    await expect(sidebar.getByText("MMC Comply")).toBeVisible();
    await expect(sidebar.getByText("MMC Build")).toBeVisible();
    await expect(sidebar.getByText("MMC Quote")).toBeVisible();
    await expect(sidebar.getByText("MMC Direct")).toBeVisible();
    await expect(sidebar.getByText("MMC Train")).toBeVisible();

    // None should be clickable links
    await expect(sidebar.locator('a:has-text("MMC Comply")')).not.toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Build")')).not.toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Quote")')).not.toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Direct")')).not.toBeVisible();
    await expect(sidebar.locator('a:has-text("MMC Train")')).not.toBeVisible();

    // Should show "Soon" labels (the Coming Soon badge text)
    const soonBadges = sidebar.locator('text="Soon"');
    await expect(soonBadges).toHaveCount(5);
  });
});
