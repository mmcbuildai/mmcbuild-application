"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";

// Bump this when the T&C text materially changes to force re-acceptance.
export const TERMS_VERSION = "beta-2026-06";

/**
 * Record that the signed-in user accepted the current T&C. Called by the
 * TermsGate on "I accept". Writes via the admin client after verifying the
 * user, so it works regardless of the profiles RLS update policy.
 */
export async function acceptTerms(): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await db()
    .from("profiles")
    .update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
    } as never)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { ok: true };
}
