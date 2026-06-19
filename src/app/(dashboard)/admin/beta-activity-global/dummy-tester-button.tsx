"use client";

import { useState, useTransition } from "react";
import { UserRound } from "lucide-react";
import { startDummyBetaSession } from "./actions";

/**
 * Operator tool: spin up a clean demo beta-tester session and hand back a
 * one-time sign-in link, so Karen/Dennis can walk the real new-tester flow
 * (locked modules -> create a project -> sample design -> tasks) before more
 * testers are brought on. Best opened in an incognito window so the operator's
 * own admin session is preserved.
 */
export function DummyTesterButton() {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-dashed p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              Walk through as a new beta tester
            </p>
            <p className="text-xs text-muted-foreground">
              Resets the demo account ({"beta.demo@mmcbuild.com.au"}) to a clean
              slate — no projects, no progress — and gives you a sign-in link so
              you experience the real new-tester flow.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              setUrl(null);
              setCopied(false);
              const res = await startDummyBetaSession();
              if (res.error) {
                setError(res.error);
                return;
              }
              if (res.url) {
                setUrl(res.url);
                // Go straight into the demo tester on /beta. This signs you in
                // as the demo in this browser; use "Copy link" + incognito if
                // you'd rather keep your admin session.
                window.location.href = res.url;
              }
            })
          }
          className="inline-flex shrink-0 items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Preparing…" : "Start a clean demo session"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {url && (
        <div className="mt-3 space-y-2 rounded-md bg-amber-50 p-3 text-xs">
          <p className="font-medium text-amber-900">
            Opening the demo session on /beta…
          </p>
          <p className="text-amber-800">
            If you&apos;re not redirected, use the link below. To keep your admin
            session, <strong>copy it and open in a private/incognito window</strong>{" "}
            instead.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={url}
              className="rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700"
            >
              Open the demo
            </a>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(url);
                setCopied(true);
              }}
              className="rounded border border-amber-300 bg-white px-2 py-1 font-medium text-amber-800 hover:bg-amber-100"
            >
              {copied ? "Copied ✓" : "Copy link (for incognito)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
