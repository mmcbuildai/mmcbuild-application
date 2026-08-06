"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptTerms } from "@/app/(dashboard)/terms/actions";
import { signOut } from "@/app/(auth)/actions";

/**
 * Terms of Use gate. Blocks the authenticated app until the user accepts.
 * "I accept" records acceptance; "Decline" signs them out.
 *
 * WHY THE BLOCKING IS MADE OBVIOUS
 *
 * Karen reported that on the trades-directory registration form she "tried to
 * click on other states and the click didn't work". The checkboxes were fine.
 * This gate was up, and its `fixed inset-0` overlay swallows every click on the
 * page — as designed.
 *
 * The problem was that it did not LOOK like it. The dialog occupies the middle
 * of the screen; the form behind it stayed legible at 60% opacity, and the page
 * still scrolled. So a user could read the exact control they wanted, click it,
 * and get nothing back — no movement, no message, no hint that anything was
 * blocking them. It reads as a broken product rather than a modal.
 *
 * Three changes, none of which alter what the gate DOES:
 *   - the background is blurred as well as dimmed, so it reads as unavailable;
 *   - the body is scroll-locked, because a page that scrolls looks usable;
 *   - clicking the blocked area pulses the dialog and says why, instead of
 *     silently eating the click.
 *
 * This matters more than it did: the version bump re-prompts every existing
 * user, so this is the first thing they will see on their next visit.
 */
export function TermsGate({ needsTerms }: { needsTerms: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudging, setNudging] = useState(false);
  // Dismiss the gate locally the instant the server confirms acceptance, rather
  // than waiting for router.refresh() to re-render the parent layout and flip
  // needsTerms — that round-trip didn't reliably close the modal in production
  // (the popup "just sat there" after "I accept"). Acceptance is already
  // persisted by acceptTerms() before we set this, so hiding is safe.
  const [accepted, setAccepted] = useState(false);

  const blocking = needsTerms && !accepted;

  // A page that still scrolls looks like a page you can use. Lock it while the
  // gate is up, and restore whatever the document had before — not a hardcoded
  // "", which would clobber an overflow set elsewhere.
  useEffect(() => {
    if (!blocking) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [blocking]);

  if (!blocking) return null;

  // Clicking the blocked page used to do nothing at all. Say why.
  function handleBackdropClick() {
    setNudging(true);
    window.setTimeout(() => setNudging(false), 820);
  }

  async function handleAccept() {
    setBusy(true);
    setError(null);
    try {
      const res = await acceptTerms();
      if (res && "error" in res) {
        setError(res.error);
        setBusy(false);
        return;
      }
      setAccepted(true); // close immediately on confirmed success
      router.refresh(); // sync server state for subsequent navigations
    } catch {
      // A thrown server action (network / 500) must not leave the button stuck
      // on "Saving…" with no feedback.
      setError("Couldn't save your acceptance — please try again.");
      setBusy(false);
    }
  }

  return (
    <div
      onClick={handleBackdropClick}
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        // Stop a click INSIDE the dialog bubbling to the backdrop and firing
        // the nudge — reading the terms is not a blocked action.
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-gate-title"
        className={`flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl transition-transform ${
          nudging ? "animate-pulse scale-[1.02]" : ""
        }`}
      >
        <div className="flex items-start gap-3 border-b p-6">
          <div className="rounded-full bg-brand-100 p-2">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h2
              id="terms-gate-title"
              className="text-lg font-semibold text-zinc-900"
            >
              Terms of Use
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {nudging
                ? "The rest of the page is unavailable until you accept or decline."
                : "Updated — please read and accept before continuing."}
            </p>
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto p-6 text-sm leading-relaxed text-zinc-700">
          <p>
            Our Terms of Use have been updated to cover payment, renewal and
            cancellation. By continuing you agree to them. In summary:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>New accounts start with a 14-day free trial.</strong> No
              payment card is needed, and the trial ends after 14 days or 3
              compliance runs, whichever comes first.
            </li>
            <li>
              <strong>You are never charged automatically at the end of a trial.</strong>{" "}
              Paid features simply stop until you choose to subscribe. Once you do
              subscribe, that subscription renews automatically until you cancel.
              Prices are shown excluding GST.
            </li>
            <li>
              <strong>You can cancel at any time from the Billing page</strong> — no
              notice period, no fee, no need to contact us. Cancelling stops the
              next charge and you keep access until the period you have paid for
              ends.
            </li>
            <li>
              Compliance findings, 3D reconstructions and cost estimates are{" "}
              <strong>AI-generated advisory information only</strong> — they are
              not professional, certified or fixed-price advice and must be
              independently verified by a suitably qualified professional.
            </li>
            <li>
              You will not rely on any output as the sole basis for a
              construction, compliance, financial or contractual decision.
            </li>
            <li>
              You consent to your usage and feedback being recorded to help
              improve the product, handled in line with MMC Build&apos;s privacy
              practices.
            </li>
            <li>
              To the extent permitted by law, MMC Build and Global Buildtech
              Australia accept no liability for loss arising from use of the
              platform. <strong>Nothing here limits your rights under the
              Australian Consumer Law.</strong>
            </li>
          </ul>
          <p className="text-xs text-zinc-500">
            This is a summary. The{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-700"
            >
              full Terms of Use
            </a>{" "}
            apply — clause 7 covers payment, renewal and cancellation in full.
          </p>
        </div>

        {error && (
          <p className="px-6 text-sm text-red-600">{error}</p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t p-6 sm:flex-row sm:justify-end">
          <form action={signOut}>
            <Button
              type="submit"
              variant="outline"
              className="min-h-[44px] w-full sm:w-auto"
            >
              Decline &amp; sign out
            </Button>
          </form>
          <Button
            onClick={handleAccept}
            disabled={busy}
            className="min-h-[44px] w-full sm:w-auto"
          >
            {busy ? "Saving…" : "I accept"}
          </Button>
        </div>
      </div>
    </div>
  );
}
