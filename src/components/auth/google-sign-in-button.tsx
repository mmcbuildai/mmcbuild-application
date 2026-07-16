"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/app/(auth)/actions";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

/**
 * "Continue with Google" — shared across login and signup. Posts to the
 * signInWithGoogle server action, which starts the Supabase OAuth flow and hands
 * off to the existing /auth/callback route for the code exchange + provisioning.
 *
 * NOTE: this requires the Google provider to be enabled in Supabase Auth with a
 * Google Cloud OAuth client (ID + secret). Until that is configured the button
 * renders but the provider call returns an error surfaced on /login.
 */
export function GoogleSignInButton({
  redirectTo,
  label = "Continue with Google",
}: {
  redirectTo?: string;
  label?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <form
      action={(formData) => {
        setIsLoading(true);
        return signInWithGoogle(formData);
      }}
    >
      {redirectTo ? (
        <input type="hidden" name="redirect" value={redirectTo} />
      ) : null}
      <Button
        type="submit"
        variant="outline"
        className="w-full h-11"
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon className="mr-2 h-4 w-4" />
        )}
        {label}
      </Button>
    </form>
  );
}
