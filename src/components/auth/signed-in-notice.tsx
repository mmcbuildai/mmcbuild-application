"use client";

import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/(auth)/actions";

/**
 * Shown at the top of /signup when the visitor is ALREADY signed in.
 *
 * Middleware used to bounce a signed-in visitor off /signup to /dashboard. That
 * is correct for /login — they asked to log in and already are — but wrong for
 * /signup, where they asked to create an account and instead landed silently on
 * someone else's dashboard.
 *
 * Karen hit it: "trying to create a new account with a different name email
 * address but it is not allowing me. Do I need to clear my cache?" Nothing was
 * broken. She was signed in, so the form was unreachable, and an invisible
 * redirect feels exactly like stale state — hence the cache instinct.
 *
 * The redirect is gone; this explains the situation instead. Two real cases it
 * serves: someone with a second business who wants a second account, and anyone
 * signed in who clicks "Get started" on the marketing site once the purchase
 * CTA goes live (those buttons point at /signup).
 *
 * Renders nothing when signed out, which is the overwhelmingly common case, so
 * the normal signup path is untouched.
 */
export function SignedInNotice() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setEmail(data.user?.email ?? null);
      })
      // Signed out is the normal case and getUser() rejects for a missing
      // session on some versions — treat any failure as "not signed in"
      // rather than letting it surface as a broken signup page.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!email) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="text-sm">
          <p className="font-medium text-amber-900">
            You&apos;re already signed in as {email}
          </p>
          <p className="mt-1 text-amber-800">
            You can still create a separate account below — for a different
            business, say. Signing up will replace the session on this device.
          </p>
          <form action={signOut} className="mt-2">
            <button
              type="submit"
              className="min-h-[44px] text-sm font-medium text-amber-900 underline hover:text-amber-950"
            >
              Sign out first
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
