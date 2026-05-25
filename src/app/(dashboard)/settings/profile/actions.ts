"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ProfileActionResult = { ok: true } | { ok: false; error: string };

/**
 * Update the signed-in user's display name on their own profiles row.
 * Uses the RLS-scoped server client (users may update only their own row).
 */
export async function updateProfile(formData: FormData): Promise<ProfileActionResult> {
  const fullName = ((formData.get("full_name") as string) ?? "").trim();
  if (!fullName) return { ok: false, error: "Name is required." };
  if (fullName.length > 100) return { ok: false, error: "Name must be 100 characters or fewer." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/profile");
  return { ok: true };
}

/**
 * Change the signed-in user's password. The current session stays valid
 * (Supabase keeps the session on an in-app password update), so the user is
 * not signed out — unlike the recovery-link reset flow.
 */
export async function changePassword(formData: FormData): Promise<ProfileActionResult> {
  const password = (formData.get("password") as string) ?? "";
  const confirm = (formData.get("confirm_password") as string) ?? "";

  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (password !== confirm) return { ok: false, error: "Passwords do not match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
