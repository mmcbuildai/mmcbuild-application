import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? "/projects";

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

        // Create organisation
        const { data: org, error: orgError } = await admin
          .from("organisations")
          .insert({
            name: data.user.user_metadata?.org_name || "My Organisation",
          })
          .select("id")
          .single();

        if (!orgError && org) {
          // Create profile as owner
          await admin.from("profiles").insert({
            org_id: org.id as string,
            user_id: data.user.id,
            role: "owner",
            full_name:
              data.user.user_metadata?.full_name ||
              data.user.email?.split("@")[0] ||
              "User",
            email: data.user.email!,
          });
        }
      }

      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
