"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X, Loader2 } from "lucide-react";
import { submitPageFeedback } from "@/app/(dashboard)/beta/actions";

/**
 * Beta-only "tell us about this page" popup. Logs the message + the exact page
 * URL against the tester for follow-up (issue #4). Sits bottom-LEFT so it never
 * collides with the SayFix / assistant buttons in the bottom-right corner.
 * Rendered only for beta-role users by BetaPageFeedbackGate.
 */
export function BetaPageFeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!msg.trim() || pending) return;
    setPending(true);
    setError(null);
    const res = await submitPageFeedback({
      message: msg,
      pageUrl: typeof window !== "undefined" ? window.location.href : pathname,
      pagePath: pathname,
    });
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDone(true);
    setMsg("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setDone(false);
          setError(null);
        }}
        aria-label="Beta — tell us about this page"
        className="fixed bottom-5 left-5 z-[2147483000] inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-amber-700"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Feedback on this page
      </button>

      {open && (
        <div className="fixed bottom-20 left-5 z-[2147483000] w-[min(92vw,360px)] rounded-xl border bg-background p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Tell us about this page</p>
              <p className="mt-0.5 break-all text-xs text-muted-foreground">
                {pathname}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {done ? (
            <p className="py-4 text-center text-sm font-medium text-emerald-600">
              Thanks — logged for follow-up.
            </p>
          ) : (
            <>
              <textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                rows={4}
                placeholder="What's confusing, broken, or could work better on this page?"
                className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
              />
              {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-9 rounded-md border px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={send}
                  disabled={pending || !msg.trim()}
                  className="inline-flex min-h-9 items-center rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
