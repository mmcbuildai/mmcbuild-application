"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptTerms } from "@/app/(dashboard)/terms/actions";
import { signOut } from "@/app/(auth)/actions";

/**
 * First-login Terms & Conditions gate (SCRUM-281). Blocks the authenticated
 * app until the user accepts. "I accept" records acceptance and refreshes;
 * "Decline" signs them out. The copy below is GENERIC PLACEHOLDER text — swap
 * in the final wording when it's supplied (the gate is fully functional now so
 * acceptance is captured regardless).
 */
export function TermsGate({ needsTerms }: { needsTerms: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!needsTerms) return null;

  async function handleAccept() {
    setBusy(true);
    setError(null);
    const res = await acceptTerms();
    if ("error" in res) {
      setError(res.error);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start gap-3 border-b p-6">
          <div className="rounded-full bg-teal-100 p-2">
            <ShieldCheck className="h-5 w-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Terms &amp; Conditions — Beta
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Please read and accept before using MMC Build.
            </p>
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto p-6 text-sm leading-relaxed text-zinc-700">
          {/* PLACEHOLDER — replace with the final approved wording. */}
          <p>
            MMC Build is currently provided as a <strong>beta</strong> for
            evaluation and feedback. By continuing you acknowledge and agree that:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              The platform and its outputs are <strong>provided as-is</strong>{" "}
              during beta and may contain errors or change without notice.
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
              Australia accept no liability for loss arising from use of the beta.
            </li>
          </ul>
          <p className="text-xs text-zinc-500">
            This is placeholder beta wording and will be replaced with the final
            Terms &amp; Conditions.
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
