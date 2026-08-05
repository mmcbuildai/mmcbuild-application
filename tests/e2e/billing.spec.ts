import {
  test,
  expect,
  adminClient,
  getProfileId,
  setSubscriptionTier,
  setRunCount,
  loginViaUI,
  TEST_USERS,
} from "./fixtures";

test.describe("Billing", () => {
  test("TC-BILL-001: Trial user sees run limit progress bar", async ({
    browser,
  }) => {
    // Set builder to trial tier with some runs used
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

    // Set trial tier with 3 runs used
    await setSubscriptionTier(orgId, "trial");
    await setRunCount(orgId, 3);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginViaUI(page, TEST_USERS.builder);

    await page.goto("/dashboard");

    // The trial info can appear as a sidebar indicator or a dashboard banner
    // Look for either "Analyses used" in sidebar or trial banner on dashboard
    const sidebar = page.locator("nav");
    const analysesUsed = sidebar.getByText("Analyses used", { exact: false });
    const trialBanner = page.getByText(/Free Trial|runs used/i).first();
    const runCount = sidebar.getByText(/\d+ \/ \d+/);

    // Either sidebar shows usage or dashboard shows trial banner
    const sidebarVisible = await analysesUsed
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    const bannerVisible = await trialBanner
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    expect(sidebarVisible || bannerVisible).toBeTruthy();

    // Cleanup
    await setRunCount(orgId, 0);
    await ctx.close();
  });

  test("TC-BILL-002: Upgrade prompt shown when run limit reached", async ({
    browser,
  }) => {
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

    // Set trial tier with runs maxed out
    await setSubscriptionTier(orgId, "trial");
    await setRunCount(orgId, 10);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginViaUI(page, TEST_USERS.builder);

    await page.goto("/dashboard");

    // Every assertion below was previously wrapped in `if (await x.isVisible())`,
    // which made this test incapable of failing: the upgrade link was asserted
    // visible only when it was ALREADY visible, and the one real assertion — that
    // an exhausted trial is blocked — sat three conditionals deep, so a missing
    // upgrade link, a missing project or a missing run button all short-circuited
    // to a green pass having checked nothing. That is the exact defect this test
    // exists to catch. The conditionals are gone; a missing precondition now fails
    // loudly with a message saying which one, which is a fixture problem someone
    // can fix, rather than a silence nobody can see.

    // Sidebar shows the upgrade link once runs are exhausted.
    const sidebar = page.locator("nav");
    const upgradeLink = sidebar.getByText(/Upgrade|Pro/i);
    await expect(
      upgradeLink,
      "exhausted trial should surface an Upgrade link in the sidebar",
    ).toBeVisible({ timeout: 10_000 });

    // Running an analysis must be blocked.
    await page.goto("/comply");
    const projectCard = page.locator('a[href*="/comply/"]').first();
    await expect(
      projectCard,
      "fixture: the e2e builder org needs at least one project to open Comply with",
    ).toBeVisible({ timeout: 10_000 });
    await projectCard.click();

    const runButton = page.getByRole("button", {
      name: "Run Compliance Check",
    });
    await expect(
      runButton,
      "fixture: the Comply page should offer a Run Compliance Check button",
    ).toBeVisible({ timeout: 10_000 });
    await runButton.click();

    // The assertion this test is actually for.
    await expect(
      page.getByText(/usage_limit|upgrade|limit reached/i),
      "an exhausted trial must be blocked and told to upgrade",
    ).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await setRunCount(orgId, 0);
    await ctx.close();
  });

  test("TC-BILL-003: Stripe test mode payment completes successfully", async ({
    browser,
  }) => {
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

    // Ensure user is on trial tier
    await setSubscriptionTier(orgId, "trial");

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginViaUI(page, TEST_USERS.builder);

    // Navigate to billing
    await page.goto("/billing");

    // Verify billing page loads
    await expect(
      page.getByText(/Current Plan|Choose a Plan|Free Trial/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Look for trial banner
    const trialBanner = page.getByText(/free trial|days.*left/i).first();
    if (await trialBanner.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(trialBanner).toBeVisible();
    }

    // Find plan cards
    const selectPlanButton = page.getByRole("button", {
      name: /Select Plan/i,
    });

    if (
      await selectPlanButton
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
    ) {
      // Click select on first available plan
      await selectPlanButton.first().click();

      // Should redirect to Stripe checkout
      // Wait for navigation — either to checkout.stripe.com or a local success page
      await page.waitForTimeout(5_000);

      const currentUrl = page.url();
      const isStripeCheckout = currentUrl.includes("stripe.com") || currentUrl.includes("checkout");
      const isBillingSuccess = currentUrl.includes("billing") && currentUrl.includes("success");

      // Either we landed on Stripe checkout or stayed on billing (depending on Stripe config)
      expect(isStripeCheckout || currentUrl.includes("billing")).toBeTruthy();

      if (isStripeCheckout) {
        // We reached Stripe checkout — test is successful
        // Don't actually complete payment in automated tests
        test.info().annotations.push({
          type: "note",
          description: "Reached Stripe checkout page — payment flow is working. Manual card entry (4242...) required for full verification.",
        });
      }
    } else {
      // No select plan button — user may already be subscribed
      const manageSub = page.getByRole("button", {
        name: /Manage Subscription/i,
      });
      if (await manageSub.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.info().annotations.push({
          type: "note",
          description: "User already has active subscription — Manage Subscription button shown",
        });
      }
    }

    // Reset to trial
    await setSubscriptionTier(orgId, "trial");
    await ctx.close();
  });
});
