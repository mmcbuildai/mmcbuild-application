import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionUser } from "@/lib/auth/provision";
import { isBetaTestingEnabled } from "@/lib/beta/enabled";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Invite / signup-confirm links built from {{ .ConfirmationURL }} (or a
  // {{ .TokenHash }} template) arrive as ?token_hash=&type= instead of ?code=.
  // The callback used to handle ONLY ?code, so every token_hash link dead-ended
  // on "Authentication failed" and the user was never provisioned. Handle both.
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // An EXPLICIT ?redirect (e.g. password-reset -> /reset-password) always wins.
  // When absent, the post-auth destination is role-based (see below): beta
  // testers land in the Beta Testing area, everyone else on the dashboard.
  const explicitRedirect = searchParams.get("redirect");

  const supabase = await createClient();

  // Establish the session from whichever credential the link carried.
  let sessionUser = null as Awaited<
    ReturnType<typeof supabase.auth.getUser>
  >["data"]["user"];
  let exchangeError: unknown = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) exchangeError = error;
    else sessionUser = data.user;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) exchangeError = error;
    else sessionUser = data.user;
  }

  // Email link prefetchers (Yahoo!/Outlook scanners, previewers) often hit the
  // callback before the human, consuming the single-use credential. The exchange
  // then fails on the real click — but a session cookie from an earlier hit in
  // THIS browser may already be valid. If a session exists, treat as success.
  if (!sessionUser && (exchangeError || (!code && !tokenHash))) {
    const {
      data: { user: existingUser },
    } = await supabase.auth.getUser();
    sessionUser = existingUser;
  }

  if (sessionUser?.email) {
    // Idempotently ensure org + profile + membership (joins a pending-invite org
    // when one exists, else creates a personal org). Running this here — not just
    // on first signup — is what repairs scanner-stranded confirmations.
    const admin = createAdminClient();
    await provisionUser(admin, {
      id: sessionUser.id,
      email: sessionUser.email,
      fullName:
        (sessionUser.user_metadata?.full_name as string | undefined) ?? null,
      orgNameFallback:
        (sessionUser.user_metadata?.org_name as string | undefined) ?? null,
    });

    // Destination: an explicit ?redirect wins; otherwise beta testers go to the
    // Beta Testing area and everyone else to the dashboard. This covers the
    // invite link AND the magic-link logins the recovered testers are using.
    let dest = explicitRedirect ?? "/dashboard";
    if (!explicitRedirect) {
      const { data: prof } = await admin
        .from("profiles")
        .select("role")
        .eq("user_id", sessionUser.id)
        .single();
      // Beta testers land on /beta only while the beta module is enabled
      // (SCRUM-351) — otherwise the normal dashboard.
      if ((prof as { role?: string } | null)?.role === "beta" && isBetaTestingEnabled()) {
        dest = "/beta";
      }
    }
    return NextResponse.redirect(`${origin}${dest}`);
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Authentication failed. Please try signing in again.")}`
  );
}
