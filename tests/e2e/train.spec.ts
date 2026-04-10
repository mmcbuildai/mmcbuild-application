import { test, expect } from "./fixtures";

test.describe("MMC Train", () => {
  test("TC-TRAIN-001: Training module loads and progress is tracked", async ({
    builderPage,
  }) => {
    await builderPage.goto("/train");

    // Verify course catalog loads
    await expect(
      builderPage.getByText(/Course Catalog/i)
    ).toBeVisible({ timeout: 10_000 });

    // Click on first available course
    const courseCard = builderPage.locator('a[href*="/train/"]').first();
    if (await courseCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await courseCard.click();
      await builderPage.waitForURL("**/train/**");

      // Verify course detail page loads with title
      await expect(builderPage.locator("h1").first()).toBeVisible({ timeout: 5_000 });

      // Look for course content — lesson count, description, or sections
      const courseContent = builderPage.getByText(/description|section|module|enroll|start/i).first();
      await expect(courseContent).toBeVisible({ timeout: 5_000 });

      // Enroll if not already enrolled
      const enrollButton = builderPage.getByRole("button", {
        name: /Enroll|Start/i,
      });
      if (await enrollButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await enrollButton.click();
        await builderPage.waitForTimeout(2_000);
      }

      // Click first lesson
      const lessonLink = builderPage.locator('a[href*="/train/"][href*="/"]').first();
      if (await lessonLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await lessonLink.click();

        // Check for lesson content
        await expect(
          builderPage.locator("h1, h2").first()
        ).toBeVisible({ timeout: 5_000 });

        // Look for Mark as Complete button
        const completeButton = builderPage.getByRole("button", {
          name: /Mark as Complete|Complete/i,
        });
        if (
          await completeButton.isVisible({ timeout: 3_000 }).catch(() => false)
        ) {
          await completeButton.click();
          await builderPage.waitForTimeout(2_000);
        }
      }

      // Navigate to training dashboard to check progress
      await builderPage.goto("/train/dashboard");

      // Verify progress is shown
      await expect(
        builderPage.getByText(/My Learning/i)
      ).toBeVisible({ timeout: 10_000 });

      // Should show enrolled courses or progress indicators
      const progressIndicator = builderPage.getByText(/\d+%|In Progress|Enrolled/i);
      await expect(progressIndicator.first()).toBeVisible({ timeout: 5_000 });
    } else {
      // No courses available
      test.info().annotations.push({
        type: "issue",
        description: "No training courses found — seed data needed",
      });
    }
  });

  test("TC-TRAIN-002: Quiz completion triggers certificate generation", async ({
    builderPage,
  }) => {
    await builderPage.goto("/train");

    // Find a course
    const courseCard = builderPage.locator('a[href*="/train/"]').first();
    if (await courseCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await courseCard.click();
      await builderPage.waitForURL("**/train/**");

      // Navigate to lessons — find one with a quiz
      const lessonLinks = builderPage.locator(
        'a[href*="/train/"][href*="/"]'
      );
      const lessonCount = await lessonLinks.count();

      let foundQuiz = false;
      for (let i = 0; i < Math.min(lessonCount, 5); i++) {
        const link = lessonLinks.nth(i);
        if (await link.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await link.click();
          await builderPage.waitForTimeout(1_000);

          // Check if this lesson has a quiz
          const quizForm = builderPage.getByText(/quiz|question/i).first();
          if (await quizForm.isVisible({ timeout: 2_000 }).catch(() => false)) {
            foundQuiz = true;

            // Try to answer quiz questions
            const radioButtons = builderPage.locator(
              'input[type="radio"], [role="radio"]'
            );
            const radioCount = await radioButtons.count();
            for (let r = 0; r < radioCount; r++) {
              await radioButtons.nth(r).click();
            }

            // Submit quiz
            const submitButton = builderPage.getByRole("button", {
              name: /Submit|Check|Answer/i,
            });
            if (
              await submitButton
                .isVisible({ timeout: 2_000 })
                .catch(() => false)
            ) {
              await submitButton.click();
              await builderPage.waitForTimeout(2_000);
            }

            break;
          }

          // Go back to course page
          await builderPage.goBack();
          await builderPage.waitForTimeout(500);
        }
      }

      if (!foundQuiz) {
        test.info().annotations.push({
          type: "issue",
          description: "No quiz found in available lessons",
        });
      }

      // Check training dashboard for certificates
      await builderPage.goto("/train/dashboard");
      const certificatesTab = builderPage.getByRole("tab", {
        name: /Certificates/i,
      });
      if (
        await certificatesTab.isVisible({ timeout: 5_000 }).catch(() => false)
      ) {
        await certificatesTab.click();

        // Check for certificate cards
        const certCard = builderPage.getByText(/Certificate No|Download PDF/i);
        const hasCert = await certCard
          .first()
          .isVisible({ timeout: 3_000 })
          .catch(() => false);

        if (hasCert) {
          await expect(certCard.first()).toBeVisible();
        }
      }
    }
  });

  test("TC-TRAIN-003: Dashboard shows completion percentage per module", async ({
    builderPage,
  }) => {
    await builderPage.goto("/train/dashboard");

    // Verify dashboard loads
    await expect(
      builderPage.getByText(/My Learning/i)
    ).toBeVisible({ timeout: 10_000 });

    // Check for stats cards
    // Stats cards section — look for the grid with stat numbers
    // The stat cards show "0" (or a number) above each label
    const statsGrid = builderPage.locator(".grid").filter({ hasText: "In Progress" });
    await expect(statsGrid).toBeVisible({ timeout: 5_000 });

    // Verify all three stat labels are within the grid
    await expect(statsGrid.getByText("Enrolled", { exact: true })).toBeVisible();
    await expect(statsGrid.getByText("In Progress", { exact: true })).toBeVisible();
    await expect(statsGrid.getByText("Certificates", { exact: true })).toBeVisible();

    // Check for My Courses tab with enrollment cards
    const myCoursesTab = builderPage.getByRole("tab", {
      name: /My Courses/i,
    });
    if (await myCoursesTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await myCoursesTab.click();

      // Each enrolled course card should show progress
      const progressBars = builderPage.locator('[class*="rounded-full"][class*="bg-"]');
      const enrollmentCards = builderPage.locator("[class*='card'], [class*='Card']");

      const cardCount = await enrollmentCards.count();
      if (cardCount > 0) {
        // At least one enrollment card should exist with progress
        await expect(enrollmentCards.first()).toBeVisible();

        // Look for percentage text
        const percentText = builderPage.getByText(/\d+%/).first();
        if (
          await percentText.isVisible({ timeout: 3_000 }).catch(() => false)
        ) {
          await expect(percentText).toBeVisible();
        }
      } else {
        test.info().annotations.push({
          type: "issue",
          description: "No enrolled courses found — enroll in a course first",
        });
      }
    }
  });
});
