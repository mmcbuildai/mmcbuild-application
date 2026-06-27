"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2 } from "lucide-react";

/**
 * The Sign Out submit button, split out so it can read `useFormStatus()` —
 * which only works in a component rendered INSIDE the <form>. Without this the
 * button gave zero feedback while the server action ran (a GoTrue /logout
 * round-trip + redirect), so it looked like it "did nothing" for a beat and
 * felt broken (Karen, 2026-06-27). Now it disables + shows a spinner instantly.
 */
export function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      variant="ghost"
      className="min-h-11 w-full justify-start gap-3 px-3 text-slate-400 hover:text-red-400 hover:bg-white/5 md:min-h-0"
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      {pending ? "Signing out…" : "Sign Out"}
    </Button>
  );
}
