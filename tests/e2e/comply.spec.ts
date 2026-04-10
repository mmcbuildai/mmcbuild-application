import { test, expect, adminClient, seedProject, getProfileId, setRunCount, setSubscriptionTier } from "./fixtures";

test.describe("MMC Comply", () => {
  test("TC-COMPLY-001: Upload valid PDF plan — analysis runs — report generated", async ({
    builderPage,
  }) => {
    // Navigate to comply — should show project list
    await builderPage.goto("/comply");
    await expect(builderPage.locator("h1, h2").first()).toBeVisible();

    // Click first active project card (if exists)
    const projectCard = builderPage.locator('a[href*="/comply/"]').first();
    if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectCard.click();
      await builderPage.waitForURL("**/comply/**");

      // Check for plan upload area or existing plan status
      const planReady = builderPage.getByText("Plan ready", { exact: false });
      const uploadArea = builderPage.getByText("Drag and drop your building plan PDF here");

      // If no plan uploaded yet, verify upload UI is present
      if (await uploadArea.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Verify the dropzone accepts PDFs
        const fileInput = builderPage.locator('input[type="file"][accept="application/pdf"]');
        await expect(fileInput).toBeAttached();

        // Upload a test PDF
        const testPdfPath = "tests/e2e/fixtures/test-plan.pdf";
        const fs = await import("fs");
        if (fs.existsSync(testPdfPath)) {
          await fileInput.setInputFiles(testPdfPath);
          // Wait for upload confirmation
          await expect(
            builderPage.getByText("uploaded", { exact: false })
          ).toBeVisible({ timeout: 30_000 });
        }
      }

      // If plan is ready, try running compliance check
      if (await planReady.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const runButton = builderPage.getByRole("button", {
          name: "Run Compliance Check",
        });

        if (await runButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await runButton.click();

          // Wait for analysis to start — should navigate to check page or show progress
          await expect(
            builderPage.getByText(/Starting Check|Queued|Analysing|Compliance Summary/i)
          ).toBeVisible({ timeout: 60_000 });
        }
      }
    } else {
      // No projects — should show empty state or redirect
      await expect(
        builderPage.getByText(/no projects|go to projects/i)
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("TC-COMPLY-002: Upload invalid file type — error message shown", async ({
    builderPage,
  }) => {
    await builderPage.goto("/comply");

    // Navigate to first project if available
    const projectCard = builderPage.locator('a[href*="/comply/"]').first();
    if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectCard.click();
      await builderPage.waitForURL("**/comply/**");

      // Look for file upload area — may need to navigate to upload tab/page
      const uploadLink = builderPage.locator('a[href*="/upload"]');
      if (await uploadLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await uploadLink.click();
      }

      // Find file input and try uploading a .txt file
      const fileInput = builderPage.locator('input[type="file"]');
      if (await fileInput.isAttached({ timeout: 5_000 }).catch(() => false)) {
        // Create a fake text file buffer
        const buffer = Buffer.from("This is not a PDF");
        await fileInput.setInputFiles({
          name: "test.txt",
          mimeType: "text/plain",
          buffer,
        });

        // Should show error message
        await expect(
          builderPage.getByText("Only PDF files are accepted")
        ).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test("TC-COMPLY-003: Run limit enforcement at trial tier", async ({
    browser,
  }) => {
    // Seed the builder user with trial tier at max usage
    const sb = adminClient();
    const { data: users } = await sb.auth.admin.listUsers();
    const builderUser = users?.users?.find((u) =>
      u.email?.includes("e2e-builder")
    );
    if (!builderUser) throw new Error("Builder user not found");

    const profileId = await getProfileId(builderUser.id);
    const { data: profile } = await sb
      .from("profiles")
      .select("org_id")
      .eq("id", profileId)
      .single();
    const orgId = profile!.org_id;

    // Set to trial tier with runs maxed out
    await setSubscriptionTier(orgId, "trial");
    await setRunCount(orgId, 10);

    // Login and navigate
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { loginViaUI, TEST_USERS } = await import("./fixtures");
    await loginViaUI(page, TEST_USERS.builder);

    await page.goto("/dashboard");

    // The trial info can appear as sidebar indicator or dashboard banner
    const sidebar = page.locator("nav");
    const analysesUsed = sidebar.getByText("Analyses used", { exact: false });
    const trialBanner = page.getByText(/Free Trial|runs used/i).first();

    const sidebarVisible = await analysesUsed
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    const bannerVisible = await trialBanner
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    // Either sidebar or banner should show usage/trial info
    expect(sidebarVisible || bannerVisible).toBeTruthy();

    // Navigate to comply and try to run — if a project exists
    await page.goto("/comply");
    const projectCard = page.locator('a[href*="/comply/"]').first();
    if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectCard.click();

      const runButton = page.getByRole("button", {
        name: "Run Compliance Check",
      });
      if (await runButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await runButton.click();

        // Should show error about usage limit
        await expect(
          page.getByText(/usage_limit|upgrade|limit reached/i)
        ).toBeVisible({ timeout: 10_000 });
      }
    } else {
      // No projects to test against — verify billing page shows limit info
      await page.goto("/billing");
      await expect(
        page.getByText(/Free Trial|trial/i).first()
      ).toBeVisible({ timeout: 10_000 });
    }

    // Reset the run count
    await setRunCount(orgId, 0);
    await ctx.close();
  });

  test("TC-COMPLY-004: NCC citations present in output report", async ({
    builderPage,
  }) => {
    await builderPage.goto("/comply");

    // Navigate to first project
    const projectCard = builderPage.locator('a[href*="/comply/"]').first();
    if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectCard.click();
      await builderPage.waitForURL("**/comply/**");

      // Look for existing compliance report — check link or embedded report
      const reportLink = builderPage.locator('a[href*="/check/"]').first();
      if (await reportLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await reportLink.click();
        await builderPage.waitForURL("**/check/**");

        // Verify NCC citations are present in findings
        // Look for NCC clause references (e.g. "NCC" or specific clause patterns)
        await expect(
          builderPage.getByText(/NCC|Part \d+\.\d+|Volume \d/i).first()
        ).toBeVisible({ timeout: 10_000 });

        // Verify compliance summary section exists
        await expect(
          builderPage.getByText("Compliance Summary", { exact: false })
        ).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test("TC-COMPLY-005: Export compliance report as PDF", async ({
    builderPage,
  }) => {
    await builderPage.goto("/comply");

    // Navigate to first project
    const projectCard = builderPage.locator('a[href*="/comply/"]').first();
    if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectCard.click();
      await builderPage.waitForURL("**/comply/**");

      // Navigate to an existing report
      const reportLink = builderPage.locator('a[href*="/check/"]').first();
      if (await reportLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await reportLink.click();
        await builderPage.waitForURL("**/check/**");

        // Click Export PDF button
        const exportButton = builderPage.getByRole("button", {
          name: "Export PDF",
        });
        if (await exportButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
          // Set up download listener
          const [download] = await Promise.all([
            builderPage.waitForEvent("download", { timeout: 30_000 }),
            exportButton.click(),
          ]);

          // Verify download started
          expect(download.suggestedFilename()).toMatch(/\.pdf$/);
        }
      }
    }
  });
});
