"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOrganisation } from "@/app/(dashboard)/settings/organisation/actions";
import { useRouter } from "next/navigation";
import { validateAbn, type AbnLookupResult } from "@/lib/abn";

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

  const [abnLoading, setAbnLoading] = useState(false);
  const [abnResult, setAbnResult] = useState<AbnLookupResult | null>(null);
  const [abnError, setAbnError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const lookupAbn = useCallback(async (rawValue: string) => {
    const digits = rawValue.replace(/\s/g, "");
    setAbnResult(null);
    setAbnError(null);

    // Only look up when we have exactly 11 digits
    if (digits.length !== 11) {
      setAbnLoading(false);
      return;
    }

    const validationError = validateAbn(digits);
    if (validationError) {
      setAbnError(validationError);
      setAbnLoading(false);
      return;
    }

    setAbnLoading(true);
    try {
      const res = await fetch(`/api/abn-lookup?abn=${digits}`);
      const data = await res.json();
      if (!res.ok) {
        setAbnError(data.error || "Lookup failed");
      } else {
        setAbnResult(data as AbnLookupResult);
      }
    } catch {
      setAbnError("Failed to look up ABN");
    } finally {
      setAbnLoading(false);
    }
  }, []);

  const handleAbnChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => lookupAbn(value), 600);
    },
    [lookupAbn]
  );

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
              onChange={handleAbnChange}
            />
            {abnLoading && (
              <p className="text-sm text-muted-foreground">Looking up ABN...</p>
            )}
            {abnError && (
              <p className="text-sm text-red-500">{abnError}</p>
            )}
            {abnResult && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
                <p className="font-medium">{abnResult.entityName}</p>
                <p>
                  {abnResult.entityType} &middot; Status: {abnResult.abnStatus}
                  {abnResult.acn ? ` · ACN: ${abnResult.acn}` : ""}
                </p>
                {abnResult.state && (
                  <p>{abnResult.state} {abnResult.postcode}</p>
                )}
                {abnResult.businessNames.length > 0 && (
                  <p className="mt-1 text-green-600 dark:text-green-400">
                    Trading as: {abnResult.businessNames.join(", ")}
                  </p>
                )}
              </div>
            )}
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
