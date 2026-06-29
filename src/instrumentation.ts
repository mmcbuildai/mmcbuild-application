// Next.js instrumentation hook — runs once per server/edge runtime at startup.
// Wires Sentry init for the matching runtime and exposes the request-error hook
// so server-side errors (route handlers, server actions, the /api/inngest job
// runner) are captured. Client init lives in `instrumentation-client.ts`.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown while rendering/handling a request (App Router).
// No-op when Sentry is disabled (DSN unset).
export const onRequestError = Sentry.captureRequestError;
