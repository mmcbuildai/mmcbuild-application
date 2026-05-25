import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForms } from "./profile-forms";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your Profile</h1>
        <p className="text-muted-foreground">
          Your account. Update your display name and change your password here.
        </p>
      </div>

      <ProfileForms
        initialName={profile?.full_name ?? ""}
        email={profile?.email ?? user.email ?? ""}
      />
    </div>
  );
}
