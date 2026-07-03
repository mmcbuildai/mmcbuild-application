"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X, Loader2 } from "lucide-react";
import { submitPageFeedback } from "@/app/(dashboard)/beta/actions";

/**
 * Beta-only "tell us about this page" control. Logs the message + the exact page
 * URL against the tester for follow-up (issue #4).
 *
 * Lives INLINE in the dashboard header's top-right action cluster — deliberately
 * in the header's empty space so it can NEVER cover the sidebar Sign Out button
 * or the bottom-right SayFix / assistant controls, on ANY page. It previously
 * floated `fixed bottom-left` and overlapped the Sign Out button at the foot of
 * the sidebar. The popup now anchors as a dropdown beneath the button rather
 * than a fixed bottom-left panel. Rendered only for beta-role users by the
 * header (`DashboardHeader`).
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
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setDone(false);
          setError(null);
        }}
        aria-label="Beta — tell us about this page"
        aria-expanded={open}
        // 44px tall on mobile (touch target), 36px on desktop — matches the
        // header's sidebar-toggle sizing (h-11 sm:h-9). Icon-only on mobile so
        // it never crowds the header row; full label from sm: up.
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-amber-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 sm:h-9"
      >
        <MessageSquarePlus className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Feedback on this page</span>
      </button>

      {open && (
        <>
          {/* Click-away backdrop — closes the panel when the user taps elsewhere. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,360px)] rounded-xl border bg-background p-4 shadow-2xl">
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
        </>
      )}
    </div>
  );
}
