"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Statuses that mean work is still in flight server-side (Inngest). */
const ACTIVE_STATUSES = ["uploading", "processing"];

/**
 * Soft-refresh the current route while any of `statuses` is still in flight,
 * so server-driven status transitions (uploading -> processing -> ready)
 * surface without a manual page refresh. Uploads register as "uploading" and
 * are advanced asynchronously by Inngest; the lists are server-rendered and
 * would otherwise sit on the stale status until the user reloads (SCRUM-267).
 *
 * Polling stops automatically once every row is terminal (ready/error/etc.),
 * and a `maxRefreshes` cap guards against a runaway loop if a job never settles.
 */
export function useStatusPolling(
  statuses: string[],
  {
    intervalMs = 4000,
    maxRefreshes = 150,
  }: { intervalMs?: number; maxRefreshes?: number } = {},
) {
  const router = useRouter();
  const countRef = useRef(0);
  const hasActive = statuses.some((s) => ACTIVE_STATUSES.includes(s));

  useEffect(() => {
    if (!hasActive) {
      countRef.current = 0;
      return;
    }

    const id = setInterval(() => {
      if (countRef.current >= maxRefreshes) {
        clearInterval(id);
        return;
      }
      countRef.current += 1;
      router.refresh();
    }, intervalMs);

    return () => clearInterval(id);
  }, [hasActive, intervalMs, maxRefreshes, router]);
}
