import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOperatorEmail } from "@/lib/auth/operator";

export const dynamic = "force-dynamic";

/**
 * Operator gate for EVERY /admin route.
 *
 * Why this exists rather than trusting each page to guard itself: two of them
 * didn't. `/admin/test-regime` and `/admin/directory` checked
 *
 *     profile.role !== "owner" && profile.role !== "admin"
 *
 * which passes for every user who has ever signed up, because a self-signup is
 * made the OWNER of their own personal org. `lib/auth/operator.ts` says so in
 * its first paragraph — "every self-signup is an owner of something" — and the
 * role check was written anyway. A brand-new account with no permissions of any
 * kind could open the global directory moderation queue, and did.
 *
 * The sidebar never showed those links (it gates on isOperator), so nothing was
 * visible — but the pages were reachable by URL, and every QA ticket publishes
 * the /admin/test-regime one, which is how it was found.
 *
 * SCRUM-345 swept the same mistake out of the server ACTIONS in July. These two
 * pages were missed. A per-page rule only holds while everyone remembers it, so
 * the rule now lives here, once, where a new admin page inherits it by existing.
 * The page-level checks are kept as well — this is the backstop, not a
 * replacement.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isOperatorEmail(user.email)) redirect("/dashboard");

  return <>{children}</>;
}
