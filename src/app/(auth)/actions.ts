"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
    redirectTo: `${appUrl}/auth/callback?redirect=/settings`,
  });

  if (error) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(error.message)}`
    );
  }

  redirect("/login?message=Check your email for a password reset link");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
