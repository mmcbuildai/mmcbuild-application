import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isOperatorEmail } from "@/lib/auth/operator";
import { getDirectoryListings } from "./actions";
import { DirectoryAdminQueue } from "@/components/admin/directory-admin-queue";

export default async function AdminDirectoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // This is the GLOBAL directory moderation queue — every organisation's
  // listings, with approve and reject. It was gated on
  // `role !== "owner" && role !== "admin"`, which passes for every signed-up
  // user, because a self-signup owns their own personal org. So any account
  // could moderate the directory. Operator identity is an email allowlist.
  if (!isOperatorEmail(user.email)) redirect("/dashboard");

  const listings = await getDirectoryListings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Directory Submissions</h1>
        <p className="text-muted-foreground">
          Review and approve public directory listing submissions
        </p>
      </div>
      <DirectoryAdminQueue listings={listings} />
    </div>
  );
}
