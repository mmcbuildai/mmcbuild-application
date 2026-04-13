"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PERSONA_LABELS,
  PERSONA_DESCRIPTIONS,
  type UserPersona,
} from "@/lib/persona-access";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserCog, Check } from "lucide-react";

const ALL_PERSONAS: UserPersona[] = [
  "builder",
  "developer",
  "architect_bd",
  "design_and_build",
  "consultant",
  "trade",
];

export default function ProfileSettingsPage() {
  const [persona, setPersona] = useState<UserPersona | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("profiles")
        .select("persona")
        .eq("user_id", user.id)
        .single()
        .then(({ data }: { data: { persona: UserPersona } | null }) => {
          if (data?.persona) setPersona(data.persona);
        });
    });
  }, []);

  function handleChangeRole(newPersona: UserPersona) {
    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("profiles")
        .update({ persona: newPersona })
        .eq("user_id", user.id);

      setPersona(newPersona);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your Profile</h1>
        <p className="text-muted-foreground">
          Manage your role and profile settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <UserCog className="h-6 w-6 text-muted-foreground" />
            <div>
              <CardTitle>Your Role</CardTitle>
              <CardDescription>
                Your role determines which modules you can access
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {ALL_PERSONAS.map((p) => (
            <button
              key={p}
              onClick={() => handleChangeRole(p)}
              disabled={isPending}
              className={`flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors ${
                persona === p
                  ? "border-teal-500 bg-teal-50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div>
                <p className="font-medium">{PERSONA_LABELS[p]}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {PERSONA_DESCRIPTIONS[p]}
                </p>
              </div>
              {persona === p && (
                <Check className="h-5 w-5 text-teal-600 shrink-0" />
              )}
            </button>
          ))}
          {saved && (
            <p className="text-sm text-green-600 font-medium">
              Role updated successfully
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
