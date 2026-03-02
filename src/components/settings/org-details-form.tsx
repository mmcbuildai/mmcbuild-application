"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOrganisation } from "@/app/(dashboard)/settings/organisation/actions";
import { useRouter } from "next/navigation";

interface OrgDetailsFormProps {
  orgName: string;
  orgAbn: string | null;
  canEdit: boolean;
}

export function OrgDetailsForm({
  orgName,
  orgAbn,
  canEdit,
}: OrgDetailsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);

    const name = formData.get("name") as string;
    const abn = formData.get("abn") as string;

    startTransition(async () => {
      const result = await updateOrganisation({ name, abn });
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Organisation Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organisation Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={orgName}
              disabled={!canEdit}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="abn">ABN</Label>
            <Input
              id="abn"
              name="abn"
              defaultValue={orgAbn ?? ""}
              disabled={!canEdit}
              placeholder="e.g. 99 691 530 426"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {saved && (
            <p className="text-sm text-green-600">Saved successfully</p>
          )}

          {canEdit && (
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
