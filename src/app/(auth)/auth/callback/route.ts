import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureMembership } from "@/lib/auth/membership";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    // Email link prefetchers (scanners, previewers) often hit the callback
    // before the human, consuming the single-use code. The exchange then
    // fails on the real click — but the session cookie from the first hit
    // is already valid. If a session exists, treat this as success.
    if (error) {
      const { data: { user: existingUser } } = await supabase.auth.getUser();
      if (existingUser) {
        return NextResponse.redirect(`${origin}${redirect}`);
      }
    }

    if (!error && data.user) {
      const admin = createAdminClient();
      const userId = data.user.id;
      const userEmail = data.user.email!.toLowerCase();
      const fullName =
        data.user.user_metadata?.full_name ||
        data.user.email?.split("@")[0] ||
        "User";

      // Identity row (one per user). Its absence => brand-new user.
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, org_id")
        .eq("user_id", userId)
        .single();

      // A pending invitation is processed for BOTH new AND existing users, so an
      // existing user can join a SECOND org (multi-org) instead of colliding on
      // the single profile row (the original bug).
      const { data: invite } = await admin
        .from("org_invitations")
        .select("id, org_id, role, seat_type, project_ids")
        .eq("email", userEmail)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (invite) {
        const inv = invite as {
          id: string;
          org_id: string;
          role: string;
          seat_type?: string | null;
          project_ids?: string[] | null;
        };
        const seatType = inv.seat_type ?? "internal";

        // Source-of-truth membership in the invited org. New user => make it
        // active; existing user => leave their current active org (OD1, no
        // auto-switch — they pick it from the org switcher).
        await ensureMembership(admin, userId, inv.org_id, inv.role, seatType, {
          setActive: !existingProfile,
        });

        // Brand-new user: create their single profile (mirrors the active org).
        let profileId: string | null = existingProfile
          ? (existingProfile as { id: string }).id
          : null;
        if (!existingProfile) {
          const { data: createdProfile } = await admin
            .from("profiles")
            .insert({
              org_id: inv.org_id,
              user_id: userId,
              // role + seat_type enums include 'beta' on live; generated types lag,
              // so cast through never (runtime values are valid on the DB).
              role: inv.role as never,
              seat_type: seatType as never,
              full_name: fullName,
              email: userEmail,
            })
            .select("id")
            .single();
          profileId = createdProfile ? (createdProfile as { id: string }).id : null;
        }

        // External / viewer invites: grant project-scoped access rows.
        if (
          profileId &&
          (seatType === "external" || seatType === "viewer") &&
          inv.project_ids &&
          inv.project_ids.length > 0
        ) {
          const accessRows = inv.project_ids.map((projectId) => ({
            project_id: projectId,
            profile_id: profileId,
            org_id: inv.org_id,
            role: seatType,
          }));
          await admin.from("project_user_access").insert(accessRows as never);
        }

        // Mark invitation accepted.
        await admin
          .from("org_invitations")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
          } as never)
          .eq("id", inv.id);
      } else if (!existingProfile) {
        // No invite + no profile => fresh org + owner profile + membership.
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
            user_id: userId,
            role: "owner",
            full_name: fullName,
            email: userEmail,
          });
          await ensureMembership(admin, userId, org.id as string, "owner", "internal", {
            setActive: true,
          });
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
