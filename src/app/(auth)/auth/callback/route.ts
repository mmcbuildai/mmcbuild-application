import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if user has a profile — if not, create org + profile (first-time signup)
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", data.user.id)
        .single();

      if (!existingProfile) {
        const admin = createAdminClient();
        const userEmail = data.user.email!.toLowerCase();
        const fullName =
          data.user.user_metadata?.full_name ||
          data.user.email?.split("@")[0] ||
          "User";

        // Check for a pending org invitation
        const { data: invite } = await admin
          .from("org_invitations")
          .select("id, org_id, role")
          .eq("email", userEmail)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (invite) {
          const inv = invite as { id: string; org_id: string; role: string };

          // Create profile in the inviter's org with pre-assigned role
          await admin.from("profiles").insert({
            org_id: inv.org_id,
            user_id: data.user.id,
            role: inv.role as "owner" | "admin" | "project_manager" | "architect" | "builder" | "trade" | "viewer",
            full_name: fullName,
            email: userEmail,
            persona: "builder",
          });

          // Mark invitation as accepted
          await admin
            .from("org_invitations")
            .update({
              status: "accepted",
              accepted_at: new Date().toISOString(),
            } as never)
            .eq("id", inv.id);
        } else {
          // No invite — create new org + owner profile (existing behaviour)
          const { data: org, error: orgError } = await admin
            .from("organisations")
            .insert({
              name: data.user.user_metadata?.org_name || "My Organisation",
            })
            .select("id")
            .single();

          if (!orgError && org) {
            await admin.from("profiles").insert({
              org_id: org.id as string,
              user_id: data.user.id,
              role: "owner",
              full_name: fullName,
              email: userEmail,
              persona: "builder",
            });
          }
        }
      }

      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Authentication failed. Please try signing in again.")}`
  );
}
