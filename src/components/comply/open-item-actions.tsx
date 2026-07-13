"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, FileCheck2, Ban, Undo2, MessageCircle } from "lucide-react";
import {
  resolveFinding,
  waiveFinding,
  reopenFinding,
  requestMoreInfo,
} from "@/app/(dashboard)/comply/actions";
import { useRouter } from "next/navigation";
import type { FindingLifecycle } from "@/lib/comply/finding-lifecycle";

interface OpenItemActionsProps {
  findingId: string;
  lifecycle: FindingLifecycle;
}

// Per-finding builder controls on the open-items board. Open/Responded findings
// can be Resolved (updated drawings or evidence/cert) or Waived (reason
// required). Resolved/Waived findings can be Reopened (a mistaken verdict is
// reversible).
export function OpenItemActions({ findingId, lifecycle }: OpenItemActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResolvedOrWaived = lifecycle === "resolved" || lifecycle === "waived";

  function handleRequestMoreInfo(formData: FormData) {
    const message = (formData.get("message") as string) ?? "";
    if (!message.trim()) {
      setError("Enter a message for the contributor");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await requestMoreInfo(findingId, message);
      if (result.error) {
        setError(result.error);
      } else {
        setMoreInfoOpen(false);
        router.refresh();
      }
    });
  }

  function handleResolve(formData: FormData) {
    const type = formData.get("type") as "updated_drawings" | "evidence";
    const note = (formData.get("note") as string) ?? "";
    setError(null);
    startTransition(async () => {
      const result = await resolveFinding(findingId, { type, note });
      if (result.error) {
        setError(result.error);
      } else {
        setResolveOpen(false);
        router.refresh();
      }
    });
  }

  function handleWaive(formData: FormData) {
    const reason = (formData.get("reason") as string) ?? "";
    if (!reason.trim()) {
      setError("A waiver reason is required");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await waiveFinding(findingId, reason);
      if (result.error) {
        setError(result.error);
      } else {
        setWaiveOpen(false);
        router.refresh();
      }
    });
  }

  function handleReopen() {
    setError(null);
    startTransition(async () => {
      const result = await reopenFinding(findingId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {isResolvedOrWaived ? (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={handleReopen}
            disabled={isPending}
          >
            <Undo2 className="mr-1.5 h-4 w-4" />
            Reopen
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="default"
              className="min-h-11"
              onClick={() => {
                setError(null);
                setResolveOpen(true);
              }}
              disabled={isPending}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Mark resolved
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setError(null);
                setWaiveOpen(true);
              }}
              disabled={isPending}
            >
              <Ban className="mr-1.5 h-4 w-4" />
              Waive
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setError(null);
                setMoreInfoOpen(true);
              }}
              disabled={isPending}
            >
              <MessageCircle className="mr-1.5 h-4 w-4" />
              Request more info
            </Button>
          </>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* Resolve dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark finding resolved</DialogTitle>
            <DialogDescription>
              Record how this non-compliant item was addressed. Resolving it
              counts toward the readiness gate for a re-check.
            </DialogDescription>
          </DialogHeader>

          <form action={handleResolve} className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Resolution path</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border p-3 text-sm">
                <input
                  type="radio"
                  name="type"
                  value="updated_drawings"
                  defaultChecked
                  className="h-4 w-4"
                />
                <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                Updated drawings address the issue
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border p-3 text-sm">
                <input
                  type="radio"
                  name="type"
                  value="evidence"
                  className="h-4 w-4"
                />
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                Evidence / certificate provided
              </label>
              <p className="text-xs text-muted-foreground">
                “Updated drawings” requires the revised drawing to be attached to
                this finding (uploaded by the contributor via their remediation
                link) — it’s then included in the exported compliance report. If
                you don’t have an updated drawing, choose “Evidence / certificate
                provided”.
              </p>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                name="note"
                placeholder="What changed, or which evidence resolves this..."
                rows={3}
                className="text-base"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setResolveOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="min-h-11" disabled={isPending}>
                {isPending ? "Saving..." : "Mark resolved"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Waive dialog */}
      <Dialog open={waiveOpen} onOpenChange={setWaiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive finding</DialogTitle>
            <DialogDescription>
              Waiving accepts this non-compliant item without remediation. A
              reason is required and is recorded in the activity log.
            </DialogDescription>
          </DialogHeader>

          <form action={handleWaive} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Waiver reason *</Label>
              <Textarea
                id="reason"
                name="reason"
                placeholder="Explain why this item is being waived..."
                rows={3}
                required
                className="text-base"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setWaiveOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                className="min-h-11"
                disabled={isPending}
              >
                {isPending ? "Waiving..." : "Waive finding"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Request more info dialog — keep the conversation going */}
      <Dialog open={moreInfoOpen} onOpenChange={setMoreInfoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request more info</DialogTitle>
            <DialogDescription>
              Send a follow-up to the contributor instead of resolving or
              waiving. This re-opens their response link and emails them your
              message — the finding stays open until you&rsquo;re satisfied.
            </DialogDescription>
          </DialogHeader>

          <form action={handleRequestMoreInfo} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="message">Message to the contributor *</Label>
              <Textarea
                id="message"
                name="message"
                placeholder="e.g. Thanks — can you also confirm the FRL certificate covers the party wall junction?"
                rows={4}
                required
                className="text-base"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setMoreInfoOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="min-h-11" disabled={isPending}>
                {isPending ? "Sending..." : "Send follow-up"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
