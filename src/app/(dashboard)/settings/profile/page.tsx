"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserCog } from "lucide-react";

type ProfileSummary = {
  fullName: string | null;
  email: string | null;
};

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          setProfile({
            fullName: data?.full_name ?? null,
            email: data?.email ?? user.email ?? null,
          });
        });
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your Profile</h1>
        <p className="text-muted-foreground">Account details</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <UserCog className="h-6 w-6 text-muted-foreground" />
            <div>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                Your account information for MMC Build
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{profile?.fullName ?? "—"}</span>
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{profile?.email ?? "—"}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
