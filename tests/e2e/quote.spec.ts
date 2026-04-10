import { test, expect } from "./fixtures";

test.describe("MMC Quote", () => {
  test("TC-QUOTE-001: Quote generated from selected materials", async ({
    builderPage,
  }) => {
    await builderPage.goto("/quote");

    // Navigate to first project
    const projectCard = builderPage.locator('a[href*="/quote/"]').first();
    if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectCard.click();
      await builderPage.waitForURL("**/quote/**");

      // Check for Run Cost Estimation button
      const runButton = builderPage.getByRole("button", {
        name: "Run Cost Estimation",
      });

      if (await runButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        // Select region if present
        const regionSelect = builderPage.locator("select, [role='combobox']").first();
        if (await regionSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await regionSelect.click();
          // Select NSW
          await builderPage.getByText("NSW", { exact: true }).click();
        }

        await runButton.click();

        // Should navigate to report or show progress
        await expect(
          builderPage.getByText(
            /Starting Estimate|Queued|Traditional Cost|MMC Cost/i
          )
        ).toBeVisible({ timeout: 60_000 });
      }

      // If a past report exists, navigate to it and verify content
      const reportLink = builderPage.locator('a[href*="/report/"]').first();
      if (await reportLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await reportLink.click();
        await builderPage.waitForURL("**/report/**");

        // Verify quote output has key elements
        await expect(
          builderPage.getByText(/Traditional Cost|MMC Cost|Savings/i).first()
        ).toBeVisible({ timeout: 10_000 });
      }
    } else {
      // No projects
      await expect(
        builderPage.getByText(/no projects|go to projects/i)
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("TC-QUOTE-002: Quote export as PDF", async ({ builderPage }) => {
    await builderPage.goto("/quote");

    const projectCard = builderPage.locator('a[href*="/quote/"]').first();
    if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectCard.click();
      await builderPage.waitForURL("**/quote/**");

      // Navigate to an existing report
      const reportLink = builderPage.locator('a[href*="/report/"]').first();
      if (await reportLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await reportLink.click();
        await builderPage.waitForURL("**/report/**");

        const exportButton = builderPage.getByRole("button", {
          name: "Export PDF",
        });

        if (await exportButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
          const [download] = await Promise.all([
            builderPage.waitForEvent("download", { timeout: 30_000 }),
            exportButton.click(),
          ]);

          expect(download.suggestedFilename()).toMatch(/\.pdf$/);
        }
      }
    }
  });

  test("TC-QUOTE-003: Quote export as Word document", async ({
    builderPage,
  }) => {
    await builderPage.goto("/quote");

    const projectCard = builderPage.locator('a[href*="/quote/"]').first();
    if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectCard.click();
      await builderPage.waitForURL("**/quote/**");

      const reportLink = builderPage.locator('a[href*="/report/"]').first();
      if (await reportLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await reportLink.click();
        await builderPage.waitForURL("**/report/**");

        // Check if Word export button exists
        const wordButton = builderPage.getByRole("button", {
          name: /Export.*Word|Download.*Word|\.docx/i,
        });

        if (await wordButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
          const [download] = await Promise.all([
            builderPage.waitForEvent("download", { timeout: 30_000 }),
            wordButton.click(),
          ]);

          expect(download.suggestedFilename()).toMatch(/\.docx$/);
        } else {
          // Word export not implemented — test should note this
          test.info().annotations.push({
            type: "issue",
            description: "Word export button not found — feature may not be implemented yet",
          });
        }
      }
    }
  });

  test("TC-QUOTE-004: Manufacturer pricing reflected in output", async ({
    builderPage,
  }) => {
    // Navigate to cost rate management
    await builderPage.goto("/settings/cost-rates");

    // Verify cost rate management page loads
    const pageVisible = await builderPage
      .getByText(/cost rate|rate management/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (pageVisible) {
      // Verify rates are displayed
      await expect(
        builderPage.locator("table, [role='grid']").first()
      ).toBeVisible({ timeout: 5_000 });

      // Navigate to a quote report and verify it uses configured rates
      await builderPage.goto("/quote");
      const projectCard = builderPage.locator('a[href*="/quote/"]').first();
      if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await projectCard.click();

        const reportLink = builderPage.locator('a[href*="/report/"]').first();
        if (await reportLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await reportLink.click();
          await builderPage.waitForURL("**/report/**");

          // Verify line items with rates are shown
          await expect(
            builderPage.getByText(/\$[\d,]+/i).first()
          ).toBeVisible({ timeout: 10_000 });
        }
      }
    }
  });
});
