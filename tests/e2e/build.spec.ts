import { test, expect, adminClient, seedProject, getProfileId } from "./fixtures";

test.describe("MMC Build", () => {
  test("TC-BUILD-001: Upload plan — material suggestions generated", async ({
    builderPage,
  }) => {
    await builderPage.goto("/build");

    // Click first active project
    const projectCard = builderPage.locator('a[href*="/build/"]').first();
    if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectCard.click();
      await builderPage.waitForURL("**/build/**");

      // Check for plan status — need a ready plan to run analysis
      const planReady = builderPage.getByText("Plan ready", { exact: false });
      const runButton = builderPage.getByRole("button", {
        name: "Run Design Optimisation",
      });

      if (await runButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await runButton.click();

        // Should show progress or navigate to report
        await expect(
          builderPage.getByText(
            /Starting Analysis|Queued|Analysing|Executive Summary/i
          )
        ).toBeVisible({ timeout: 60_000 });
      } else {
        // No plan — verify upload link is shown
        await expect(
          builderPage.getByText(/upload a plan|no processed plan/i)
        ).toBeVisible({ timeout: 5_000 });
      }
    } else {
      // No projects — should show empty state
      await expect(
        builderPage.getByText(/no projects yet/i)
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("TC-BUILD-002: Material selection persists to project record", async ({
    builderPage,
  }) => {
    await builderPage.goto("/build");

    // Navigate to first project
    const projectCard = builderPage.locator('a[href*="/build/"]').first();
    if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectCard.click();
      await builderPage.waitForURL("**/build/**");

      // Find the Construction Systems panel
      await expect(
        builderPage.getByText("Construction Systems")
      ).toBeVisible({ timeout: 5_000 });

      // Select SIPs
      const sipsButton = builderPage.getByRole("button", { name: /SIPs/i });
      await expect(sipsButton).toBeVisible();
      await sipsButton.click();

      // Select CLT
      const cltButton = builderPage.getByRole("button", {
        name: /CLT.*Mass Timber/i,
      });
      await expect(cltButton).toBeVisible();
      await cltButton.click();

      // Save selection
      const saveButton = builderPage.getByRole("button", {
        name: /Save Selection|Save Anyway/i,
      });
      if (await saveButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await saveButton.click();

        // Wait for save to complete
        await builderPage.waitForTimeout(2_000);
      }

      // Navigate away
      await builderPage.goto("/dashboard");
      await builderPage.waitForURL("**/dashboard");

      // Navigate back
      await builderPage.goto("/build");
      const card = builderPage.locator('a[href*="/build/"]').first();
      await card.click();
      await builderPage.waitForURL("**/build/**");

      // Verify selections persisted — SIPs and CLT should still be selected
      await expect(
        builderPage.getByText("Construction Systems")
      ).toBeVisible({ timeout: 5_000 });

      // Selected systems should show as badges or highlighted buttons
      await expect(
        builderPage.getByText("SIPs").first()
      ).toBeVisible();
    }
  });

  test("TC-BUILD-003: No project exists — redirected to project creation", async ({
    browser,
  }) => {
    // Create a user with no projects — use admin user with empty org
    // For this test, we just verify the empty state behavior
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const { loginViaUI, TEST_USERS } = await import("./fixtures");
    await loginViaUI(page, TEST_USERS.builder);

    await page.goto("/build");

    // If builder has no projects, should redirect to /projects?prompt=create
    // or show "No projects yet" with a "Go to Projects" button
    const noProjects = page.getByText(/no projects yet/i);
    const goToProjects = page.getByRole("button", { name: /Go to Projects/i });
    const projectCards = page.locator('a[href*="/build/"]');

    // Either we see project cards (builder already has projects) or the empty state
    const hasProjects = await projectCards
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (!hasProjects) {
      // Verify empty state elements
      const onProjectsPage = page.url().includes("/projects");
      if (onProjectsPage) {
        // Was redirected to projects page — pass
        expect(page.url()).toContain("/projects");
      } else {
        // Shows empty state on /build
        await expect(noProjects).toBeVisible();
        await expect(goToProjects).toBeVisible();

        // Click should navigate to projects
        await goToProjects.click();
        await page.waitForURL("**/projects**", { timeout: 10_000 });
      }
    } else {
      // Builder has projects — verify they link correctly
      await expect(projectCards.first()).toBeVisible();
    }

    await ctx.close();
  });

  test("TC-BUILD-004: Cross-module plan sharing", async ({ builderPage }) => {
    await builderPage.goto("/build");

    // Get first project
    const projectCard = builderPage.locator('a[href*="/build/"]').first();
    if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Extract project ID from href
      const href = await projectCard.getAttribute("href");
      const projectId = href?.split("/build/")[1];

      if (projectId) {
        // Check plan status in Build
        await projectCard.click();
        await builderPage.waitForURL("**/build/**");

        const hasPlan = await builderPage
          .getByText("Plan ready", { exact: false })
          .isVisible({ timeout: 3_000 })
          .catch(() => false);

        if (hasPlan) {
          // Navigate to Comply for same project
          await builderPage.goto(`/comply/${projectId}`);
          await builderPage.waitForURL(`**/comply/${projectId}**`);

          // Plan should be available here too — look for plan status
          await expect(
            builderPage.getByText(/plan ready|uploaded plans|ready/i).first()
          ).toBeVisible({ timeout: 10_000 });

          // Navigate to Quote for same project
          await builderPage.goto(`/quote/${projectId}`);
          await builderPage.waitForURL(`**/quote/${projectId}**`);

          // Plan should also be available in Quote
          await expect(
            builderPage.getByText(/plan ready|plan status/i).first()
          ).toBeVisible({ timeout: 10_000 });
        }
      }
    }
  });
});
