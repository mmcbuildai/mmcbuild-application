"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureMembership } from "@/lib/auth/membership";
import { redirect } from "next/navigation";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const orgName = formData.get("org_name") as string;
  const redirectTo = (formData.get("redirect") as string) || "/dashboard";

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
      });
      // Source-of-truth membership + active org for the new owner.
      await ensureMembership(admin, data.user.id, org.id as string, "owner", "internal", {
        setActive: true,
      });
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
