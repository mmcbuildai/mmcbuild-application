"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUp } from "../actions";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { isGoogleSignInEnabled } from "@/lib/auth/google-signin-enabled";
import { SignedInNotice } from "@/components/auth/signed-in-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  signupCardClauseShort,
  trialLengthAdjective,
} from "@/lib/legal/commercial-facts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function SignupForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const isBeta = searchParams.get("beta") === "true";
  const plan = searchParams.get("plan");
  const interval = searchParams.get("interval") === "year" ? "year" : "month";
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Where sign-up lands.
   *
   * Until 2026-08-13 this was `/dashboard`, which meant a visitor who clicked
   * "Get started" under a $49 price was given a free 14-day trial and never
   * shown a card field — on both websites, from all 13 pages. Karen's Option A
   * (card at sign-up, SCRUM-366) was built and deployed, but nothing routed to
   * it, so no purchase was possible anywhere.
   *
   * ⚠️ The default is checkout, NOT the dashboard. A visitor arriving at a bare
   * `/signup` with no plan chosen is exactly the case the old behaviour got
   * wrong, so it must not be the case that opts out.
   */
  const checkoutRedirect = plan
    ? `/billing/start?plan=${encodeURIComponent(plan)}&interval=${interval}`
    : "/billing/start";

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    // Beta testers are not buying anything and keep their own path.
    formData.set("redirect", isBeta ? "/beta" : checkoutRedirect);
    try {
      await signUp(formData);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-3">
          <Image
            src="/mmcbuildlogo.png"
            alt="MMC Build"
            width={64}
            height={64}
            className="h-16 w-16 rounded-lg"
            priority
          />
        </div>
        <CardTitle className="text-2xl sm:text-3xl font-bold">
          Create your MMC Build account
        </CardTitle>
        <CardDescription>
          {isBeta
            ? "Sign up to join the MMC Build beta testing program."
            : `Start with a ${trialLengthAdjective()} free trial. All modules unlocked. ${signupCardClauseShort()}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Renders only when the visitor is already signed in. Middleware used
            to redirect them to /dashboard instead, which read as the product
            refusing to let them create an account. */}
        <SignedInNotice />

        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {decodeURIComponent(error)}
          </div>
        )}

        {/* SCRUM-240 — see the note on the login page. Button and divider are
            gated together so "or sign up with email" is never left dangling. */}
        {isGoogleSignInEnabled() && (
          <>
            {/* Same destination as the email form — a Google sign-up must not
                be a second way to skip checkout. */}
            <GoogleSignInButton
              redirectTo={isBeta ? "/beta" : checkoutRedirect}
              label="Sign up with Google"
            />

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  or sign up with email
                </span>
              </div>
            </div>
          </>
        )}

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              placeholder="Jane Smith"
              className="h-11"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org_name">Organisation Name</Label>
            <Input
              id="org_name"
              name="org_name"
              type="text"
              placeholder="Smith Constructions Pty Ltd"
              className="h-11"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com.au"
              className="h-11"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              minLength={8}
              className="h-11"
              required
            />
            <p className="text-xs text-muted-foreground">
              Minimum 8 characters
            </p>
          </div>
          <Button type="submit" className="w-full h-11" disabled={isLoading}>
            {isLoading ? "Creating account..." : "Create Account"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-center text-sm">
        <p className="text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
