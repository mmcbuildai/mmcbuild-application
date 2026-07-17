"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  ShieldX,
  ExternalLink,
  Loader2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import {
  setComplianceDocumentVerified,
  type ComplianceReviewDoc,
} from "@/app/(dashboard)/admin/suppliers/actions";
import {
  complianceDocTypeLabel,
  expiryStatus,
} from "@/lib/direct/compliance-docs";

// SCRUM-175 — operator surface to verify/unverify supplier compliance docs.
// Pending (unverified) docs surface first as the review queue.
export function SupplierComplianceReview({
  docs,
}: {
  docs: ComplianceReviewDoc[];
}) {
  if (docs.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No compliance documents uploaded yet.
      </div>
    );
  }

  const pending = docs.filter((d) => !d.verified);
  const verified = docs.filter((d) => d.verified);

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-amber-700">
            Awaiting verification ({pending.length})
          </p>
          {pending.map((d) => (
            <ComplianceRow key={d.id} doc={d} />
          ))}
        </div>
      )}
      {verified.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Verified ({verified.length})
          </p>
          {verified.map((d) => (
            <ComplianceRow key={d.id} doc={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function ComplianceRow({ doc }: { doc: ComplianceReviewDoc }) {
  const [verified, setVerified] = useState(doc.verified);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const status = expiryStatus(doc.expires_at);

  function toggle() {
    const next = !verified;
    setVerified(next); // optimistic
    setError(null);
    startTransition(async () => {
      const res = await setComplianceDocumentVerified(doc.id, next);
      if (res.error) {
        setVerified(!next);
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{doc.supplier_name}</p>
            <Badge variant="secondary">{complianceDocTypeLabel(doc.doc_type)}</Badge>
            {verified ? (
              <Badge className="bg-green-600 hover:bg-green-600">Verified</Badge>
            ) : (
              <Badge variant="outline" className="text-amber-700">
                Pending
              </Badge>
            )}
            {status === "expired" && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Expired
              </Badge>
            )}
            {status === "expiring_soon" && (
              <Badge className="gap-1 bg-amber-500 hover:bg-amber-500">
                <Clock className="h-3 w-3" /> Expiring soon
              </Badge>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <a
              href={doc.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {doc.title}
              <ExternalLink className="h-3 w-3" />
            </a>
            {doc.expires_at && <span>· Expires {doc.expires_at}</span>}
          </p>
        </div>
        <Button
          variant={verified ? "outline" : "default"}
          size="sm"
          onClick={toggle}
          disabled={isPending}
          className="min-h-9 shrink-0"
        >
          {isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : verified ? (
            <ShieldX className="mr-1.5 h-4 w-4" />
          ) : (
            <ShieldCheck className="mr-1.5 h-4 w-4" />
          )}
          {verified ? "Unverify" : "Verify"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
