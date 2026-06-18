"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Invite "Accept invitation" links are admin-initiated, so Supabase returns the
 * session in the URL fragment (#access_token=…) via the implicit flow. The
 * server-rendered home page can't read a fragment, so the invitee lands on the
 * marketing page instead of being routed into the app, and the server-side
 * "redirect authenticated users to /dashboard" never fires (no cookie yet).
 *
 * This client detector runs only when the URL actually carries an auth fragment
 * (otherwise a normal anonymous visit is untouched): it lets the browser client
 * process the fragment, then forwards the now-signed-in user into the app, where
 * the dashboard layout idempotently provisions their org/profile from the
 * pending invite. Belt-and-suspenders alongside the /auth/callback handling.
 */
export function InviteSessionRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash.includes("access_token")) return;

    const supabase = createClient();

    // The browser client processes the hash on init; catch the sign-in event,
    // and also check immediately in case it already resolved.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/dashboard");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  return null;
}
