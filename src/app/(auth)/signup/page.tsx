"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUp } from "../actions";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
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
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    if (isBeta) formData.set("redirect", "/beta");
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
            : "Start with a 14-day free trial. All modules unlocked. No credit card required."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {decodeURIComponent(error)}
          </div>
        )}

        <GoogleSignInButton
          redirectTo={isBeta ? "/beta" : undefined}
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
