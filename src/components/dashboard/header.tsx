import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export async function DashboardHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <header className="flex h-16 items-center justify-end border-b px-6">
        <p className="text-sm text-muted-foreground">Not signed in</p>
      </header>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, org_id")
    .eq("user_id", user.id)
    .single();

  let orgName = "Organisation";
  if (profile?.org_id) {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organisations")
      .select("name")
      .eq("id", profile.org_id)
      .single();
    if (org?.name) orgName = org.name;
  }

  const initials =
    profile?.full_name
      ?.split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "U";

  return (
    <header className="flex h-16 items-center justify-between border-b px-6">
      <div>
        <p className="text-sm text-muted-foreground">{orgName}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium">{profile?.full_name ?? "User"}</p>
          <p className="text-xs capitalize text-muted-foreground">
            {profile?.role ?? "viewer"}
          </p>
        </div>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
