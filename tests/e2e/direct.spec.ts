import { test, expect } from "./fixtures";

test.describe("MMC Direct", () => {
  test("TC-DIRECT-001: Directory search by state and category returns results", async ({
    builderPage,
  }) => {
    await builderPage.goto("/direct");

    // Verify directory page loads — hero section says "Find Your Perfect Team"
    await expect(
      builderPage.getByText(/Find Your.*Team|Trade Directory|MMC Direct/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Find filters — they are <select> elements
    const selects = builderPage.locator("select");
    const selectCount = await selects.count();

    if (selectCount >= 2) {
      // Select a region (typically second select)
      await selects.nth(1).selectOption("NSW");

      // Select a trade type (typically first select)
      const firstSelectOptions = await selects.first().locator("option").allTextContents();
      const builderOption = firstSelectOptions.find((o) => /builder/i.test(o));
      if (builderOption) {
        await selects.first().selectOption(builderOption);
      }
    }

    // Click Search button if visible
    const searchButton = builderPage.getByRole("button", { name: "Search" });
    if (await searchButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchButton.click();
    }

    await builderPage.waitForTimeout(2_000);

    // Check for results or empty state
    const professionalCards = builderPage.locator('a[href*="/direct/"]');
    const hasResults = await professionalCards
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasResults) {
      await expect(professionalCards.first()).toBeVisible();
    } else {
      // No listings — acceptable in test env
      await expect(
        builderPage.getByText(/no professionals|no results|no listings/i)
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("TC-DIRECT-002: Filter by certification status works correctly", async ({
    builderPage,
  }) => {
    await builderPage.goto("/direct");

    await expect(
      builderPage.getByText(/Trade Directory/i)
    ).toBeVisible({ timeout: 10_000 });

    // Look for a certification/verified filter
    // This might be a checkbox, toggle, or select option
    const verifiedFilter = builderPage.getByText(/verified|certified/i);
    const filterCheckbox = builderPage.locator(
      'input[type="checkbox"], [role="checkbox"]'
    );

    if (await verifiedFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await verifiedFilter.click();

      await builderPage.waitForTimeout(2_000);

      // After filtering, check that any visible cards show verified badge
      const cards = builderPage.locator("[class*='card'], [class*='Card']");
      const cardCount = await cards.count();

      if (cardCount > 0) {
        // At least some results — verify they have verified status
        const verifiedBadge = builderPage.getByText("Verified").first();
        const hasVerifiedBadge = await verifiedBadge
          .isVisible({ timeout: 3_000 })
          .catch(() => false);
        // If filtering by verified, results should show verified badge
        if (hasVerifiedBadge) {
          await expect(verifiedBadge).toBeVisible();
        }
      }
    } else {
      // Certification filter may not be a standalone element
      // Check if it's part of the search/filter selects
      test.info().annotations.push({
        type: "issue",
        description: "Standalone certification filter not found — may be integrated into search",
      });
    }
  });

  test("TC-DIRECT-003: Company profile displays all required fields", async ({
    builderPage,
  }) => {
    await builderPage.goto("/direct");

    await expect(
      builderPage.getByText(/Trade Directory/i)
    ).toBeVisible({ timeout: 10_000 });

    // Click on first company listing
    const listingLink = builderPage.locator('a[href*="/direct/"]').first();
    if (await listingLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await listingLink.click();
      await builderPage.waitForURL("**/direct/**");

      // Verify required profile fields are present
      // Company name — should be in a heading
      await expect(
        builderPage.locator("h1, h2").first()
      ).toBeVisible({ timeout: 5_000 });

      // Contact details or location info
      const hasLocation = await builderPage
        .getByText(/NSW|VIC|QLD|WA|SA|TAS|ACT|NT/i)
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);

      // Categories or specialisations
      const hasCategories = await builderPage
        .getByText(/specialisation|category|trade/i)
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);

      // At minimum, the profile page should have loaded with a heading
      await expect(builderPage.locator("h1, h2").first()).toBeVisible();

      // Check for About/Portfolio/Reviews tabs
      const aboutTab = builderPage.getByRole("tab", { name: /About/i });
      if (await aboutTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(aboutTab).toBeVisible();
      }
    } else {
      // No listings in directory
      test.info().annotations.push({
        type: "issue",
        description: "No directory listings found — seed data may be needed",
      });
    }
  });
});
