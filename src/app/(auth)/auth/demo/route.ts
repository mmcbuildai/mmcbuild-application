import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Demo beta-tester sign-in. Unlike /auth/callback (which falls back to an
 * existing session — so an operator clicking the demo link would just stay
 * themselves), this route ALWAYS clears the current browser session first, then
 * signs in as the demo via the token_hash, and goes straight to /beta. That's
 * what makes "walk through as a new beta tester" actually switch you into the
 * clean demo account instead of showing your own projects.
 *
 * scope:'local' clears only this browser, not the operator's other sessions.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });

  if (tokenHash) {
    // A magic-link token_hash verifies with type "email" (Supabase's generic
    // email-OTP type); "magiclink" is rejected. Try "email" first, then fall
    // back through the other email types just in case.
    const types: EmailOtpType[] = ["email", "magiclink", "signup"];
    for (const type of types) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (!error) {
        return NextResponse.redirect(`${origin}/beta`);
      }
      console.error(`[auth/demo] verifyOtp (${type}) failed:`, error.message);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Demo session could not be started. Try again.")}`,
  );
}
