"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmAndProvisionTester } from "./actions";

/**
 * One-click "Confirm & provision" for a stranded tester — the UI equivalent of
 * the manual SQL backfill. Shown only on rows that need it (unconfirmed email
 * or no profile/org). Reuses the operator-gated server action.
 */
export function FixTesterButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  return (
    <div className="mt-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await confirmAndProvisionTester(userId);
            setOk(r.ok);
            setMsg(r.message);
            if (r.ok) router.refresh();
          })
        }
        className="inline-flex min-h-[32px] items-center rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
      >
        {pending ? "Fixing…" : "Confirm & provision"}
      </button>
      {msg && (
        <div
          className={`mt-1 text-[11px] ${ok ? "text-emerald-600" : "text-red-600"}`}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
