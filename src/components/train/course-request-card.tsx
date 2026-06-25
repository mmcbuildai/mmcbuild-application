"use client";

import { useState } from "react";
import { GraduationCap, Loader2, Sparkles } from "lucide-react";
import { submitPageFeedback } from "@/app/(dashboard)/beta/actions";

/**
 * "What course would help you most?" — an open invitation on the Train catalogue
 * (live + beta) for users to request courses we don't have yet. Logged against
 * the user for follow-up (issue #5), reusing the user-feedback channel created in
 * #4 with a "[Course request]" marker so operators can triage them together.
 */
export function CourseRequestCard() {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!text.trim() || pending) return;
    setPending(true);
    setError(null);
    const res = await submitPageFeedback({
      message: `[Course request] ${text.trim()}`,
      pageUrl: typeof window !== "undefined" ? window.location.href : "/train",
      pagePath: "/train",
    });
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDone(true);
    setText("");
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-amber-100 p-2 text-amber-700">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">
            Looking for a course we don&rsquo;t have yet?
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Tell us what training would be most useful for you — what topic,
            system, or skill — and we&rsquo;ll look at building it.
          </p>

          {done ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <Sparkles className="h-4 w-4" />
              Thanks — we&rsquo;ve logged your request and will follow up.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                placeholder="e.g. A course on prefab panel installation, or NCC 2025 changes for Class 1 homes…"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={send}
                  disabled={pending || !text.trim()}
                  className="inline-flex min-h-9 items-center rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Send request
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
