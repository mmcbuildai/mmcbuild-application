"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserCog, KeyRound } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { updateProfile, changePassword } from "./actions";

export function ProfileForms({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const [name, setName] = useState(initialName);
  const [savingName, startName] = useTransition();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, startPw] = useTransition();

  function onSaveName(e: React.FormEvent) {
    e.preventDefault();
    startName(async () => {
      const fd = new FormData();
      fd.set("full_name", name);
      const res = await updateProfile(fd);
      if (res.ok) toast.success("Profile updated.");
      else toast.error(res.error);
    });
  }

  function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    startPw(async () => {
      const fd = new FormData();
      fd.set("password", password);
      fd.set("confirm_password", confirm);
      const res = await changePassword(fd);
      if (res.ok) {
        toast.success("Password updated.");
        setPassword("");
        setConfirm("");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <UserCog className="h-6 w-6 text-muted-foreground" />
            <div>
              <CardTitle>Profile</CardTitle>
              <CardDescription>
                Your display name across MMC Build. Email changes go through
                support for now.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSaveName} className="space-y-4 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Name</Label>
              <Input
                id="full_name"
                name="full_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled readOnly />
              <p className="text-xs text-muted-foreground">
                Read-only — contact us at info@mmcbuild.com.au to change your
                email.
              </p>
            </div>
            <Button type="submit" disabled={savingName || name.trim() === initialName.trim()}>
              {savingName ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <KeyRound className="h-6 w-6 text-muted-foreground" />
            <div>
              <CardTitle>Password</CardTitle>
              <CardDescription>
                Change your password. You&apos;ll stay signed in on this device.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onChangePassword} className="space-y-4 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <PasswordInput
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <PasswordInput
                id="confirm_password"
                name="confirm_password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={savingPw || password.length < 8 || password !== confirm}
            >
              {savingPw ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
