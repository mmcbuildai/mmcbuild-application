"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureMembership } from "@/lib/auth/membership";
import { recordSignupLead } from "@/lib/hubspot/signup";
import { notifyKarthikOfNewUser } from "@/lib/email/user-registered";
import {
  ATTRIBUTION_COOKIE,
  parseAttribution,
} from "@/lib/attribution/first-touch";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TERMS_VERSION } from "@/lib/legal/terms";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const orgName = formData.get("org_name") as string;
  const redirectTo = (formData.get("redirect") as string) || "/dashboard";

  /*
   * Terms acceptance is recorded HERE, not by the dashboard's blocking modal.
   *
   * Sign-up now redirects into Stripe checkout (2026-08-13), which never
   * reaches the dashboard layout that used to gate on this — so without
   * capturing it on the form, a customer would give us a card before agreeing
   * to the terms that describe the charge.
   *
   * Checked server-side as well as by the `required` attribute: an HTML
   * attribute is a convenience for the honest, not a control.
   */
  const termsAccepted = formData.get("terms_accepted") === "yes";
  if (!termsAccepted) {
    redirect(
      `/signup?error=${encodeURIComponent(
        "Please accept the Terms and Conditions to create your account.",
      )}`,
    );
  }

  const callbackUrl = redirectTo !== "/dashboard"
    ? `${appUrl}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
    : `${appUrl}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl,
      data: {
        full_name: fullName,
        org_name: orgName,
      },
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // If email confirmation is disabled, create org + profile immediately
  if (data.user && data.session) {
    const admin = createAdminClient();

    const { data: org } = await admin
      .from("organisations")
      .insert({ name: orgName || "My Organisation" })
      .select("id")
      .single();

    if (org) {
      await admin.from("profiles").insert({
        org_id: org.id as string,
        user_id: data.user.id,
        role: "owner",
        full_name: fullName || email.split("@")[0],
        email,
        persona: "builder",
        // Recorded at sign-up so acceptance provably precedes payment, and so
        // the dashboard's terms modal does not fire at someone who has just
        // ticked the box on the previous screen.
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
      });
      // Source-of-truth membership + active org for the new owner.
      await ensureMembership(admin, data.user.id, org.id as string, "owner", "internal", {
        setActive: true,
      });

      // Record the CRM lead HERE, because this is the branch that creates the
      // account when email confirmation is disabled — which is how production
      // is configured.
      //
      // ⚠️ THIS IS WHY NO SIGN-UP WAS EVER CAPTURED. The capture was wired into
      // `provisionUser`, on its `self_signup` branch — "the request that
      // actually creates the profile". That was true when it was written, and
      // is still true for magic-link, OAuth and invited users. It is NOT true
      // here: this action creates the org, profile and membership inline, so by
      // the time `provisionUser` runs (auth callback / dashboard layout) the
      // profile already exists, it returns "existing", and the capture never
      // fires. Two provisioning paths, and the lead was attached to the one an
      // email-and-password signup does not take.
      //
      // Measured 2026-08-11: ZERO leads with form_type 'signup' had ever been
      // written, across every account created since the capture shipped on
      // 9 August — while contact, waitlist and trades-supplier leads recorded
      // normally. Calling recordSignupLead directly against production inserted
      // and synced to HubSpot first time, so the function was never the problem.
      //
      // Attribution is read HERE and nowhere else: the first-touch cookie is on
      // the request that submits this form, and `provisionUser` never sees it.
      // Capturing the lead without the campaign would have been half a fix —
      // the point of the work is telling Karen which ad produced the customer.
      //
      // Awaited before the redirect, deliberately. `redirect()` throws to unwind
      // the request, so anything after it never runs; and work left pending on
      // Vercel after a response is not guaranteed to finish. recordSignupLead
      // never throws, so sign-up cannot fail because of it.
      const jar = await cookies();
      await recordSignupLead({
        email,
        fullName,
        orgName: orgName || null,
        attribution: parseAttribution(jar.get(ATTRIBUTION_COOKIE)?.value),
        hutk: jar.get("hubspotutk")?.value ?? null,
      });

      // Same reasoning as recordSignupLead above: this inline branch is the one
      // that actually runs in production (email confirmation disabled), so the
      // Karthik alert must fire HERE too — provisionUser's self_signup branch
      // is unreachable for an email-and-password signup.
      const notifyResult = await notifyKarthikOfNewUser({
        email,
        fullName: fullName || email.split("@")[0],
        orgName: orgName || "My Organisation",
        outcome: "self_signup",
      });
      if (!notifyResult.ok) {
        console.warn("[signUp] Karthik notification (self_signup) failed:", notifyResult.error);
      }
    }

    redirect(redirectTo);
  }

  // Email confirmation enabled — show check-email message
  redirect("/login?message=Check your email to confirm your account");
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();

  const redirectTo = (formData.get("redirect") as string) || "";
  const callbackUrl = redirectTo
    ? `${appUrl}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`
    : `${appUrl}/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // signInWithOAuth returns the provider consent URL to send the user to; the
  // /auth/callback route already exchanges the returned code for a session and
  // provisions the org/profile (shared with the email flows), so no callback
  // change is needed for Google.
  if (data?.url) {
    redirect(data.url);
  }

  redirect(
    `/login?error=${encodeURIComponent("Could not start Google sign-in. Please try again.")}`
  );
}

export async function signInWithMagicLink(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?message=Check your email for a login link");
}

export async function forgotPassword(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?redirect=/reset-password`,
  });

  if (error) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(error.message)}`
    );
  }

  redirect("/login?message=Check your email for a password reset link");
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (!password || password.length < 8) {
    redirect(
      `/reset-password?error=${encodeURIComponent("Password must be at least 8 characters")}`
    );
  }

  if (password !== confirmPassword) {
    redirect(
      `/reset-password?error=${encodeURIComponent("Passwords do not match")}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/forgot-password?error=${encodeURIComponent("Reset link expired or invalid. Request a new one.")}`
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(
      `/reset-password?error=${encodeURIComponent(error.message)}`
    );
  }

  await supabase.auth.signOut();

  redirect("/login?message=Password updated. Sign in with your new password.");
}

export async function signOut() {
  const supabase = await createClient();
  // Local scope: sign out THIS device only, clearing the local session +
  // cookies without a network round-trip to revoke every session. The default
  // global scope calls the GoTrue /logout endpoint, which can hang or fail
  // (notably with migrated sessions) — when it hangs, the redirect below never
  // fires and the button appears to "do nothing". "Sign out everywhere" is a
  // separate, deliberate action (Settings), not the sidebar button.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Never block the redirect on a sign-out hiccup — local cookies are cleared
    // by the SSR client either way; get the user to /login regardless.
  }
  redirect("/login");
}
