import { test as setup } from "@playwright/test";
import { seedTestUser, TEST_USERS } from "./fixtures";

/**
 * Global setup — seeds all test users in Supabase before any tests run.
 * Runs once as a Playwright "setup" project dependency.
 */
setup("seed test users", async () => {
  console.log("🔧 Seeding E2E test users...");

  const users = Object.entries(TEST_USERS);
  for (const [key, user] of users) {
    try {
      const { userId, orgId } = await seedTestUser(user);
      console.log(`  ✓ ${key}: ${user.email} (user=${userId}, org=${orgId})`);
    } catch (err) {
      console.error(`  ✗ ${key}: ${(err as Error).message}`);
      throw err;
    }
  }

  console.log("✅ All test users seeded");
});
