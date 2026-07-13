"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import { CheckCircle } from "lucide-react";
import Link from "next/link";
import { BRAND } from "@/lib/brand/tokens";

const CONFETTI_COLOURS = [BRAND.greenLight, BRAND.green, BRAND.greenDark];

interface PaymentSuccessProps {
  planName: string;
  runLimit: number;
}

export function PaymentSuccess({ planName, runLimit }: PaymentSuccessProps) {
  useEffect(() => {
    // Fire confetti on mount
    const duration = 2000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: CONFETTI_COLOURS,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: CONFETTI_COLOURS,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-brandgreen-100 flex items-center justify-center mb-4">
        <CheckCircle className="w-8 h-8 text-brandgreen-500" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">
        You&apos;re on {planName}!
      </h2>
      <p className="text-slate-500 mb-6">
        {runLimit === Infinity
          ? "Unlimited compliance runs per month."
          : `${runLimit} compliance runs per month.`}{" "}
        Get started.
      </p>
      <Link
        href="/comply"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brandgreen-500 text-white font-medium text-sm shadow-md hover:bg-brandgreen-600 hover:shadow-lg transition-all"
      >
        Go to Comply
      </Link>
    </div>
  );
}
