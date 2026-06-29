// Sentry — server (Node.js runtime) initialisation.
//
// Loaded by `src/instrumentation.ts` `register()` when NEXT_RUNTIME === "nodejs",
// which covers route handlers, server actions, and the /api/inngest job runner.
//
// Required env (names only — never commit values):
//   NEXT_PUBLIC_SENTRY_DSN   — the project DSN (public; safe in client + server).
//   SENTRY_TRACES_SAMPLE_RATE (optional) — performance trace sampling, default 0.1.
//
// Until NEXT_PUBLIC_SENTRY_DSN is set, init is a no-op (`enabled: false`), so this
// is safe to deploy before the Sentry project exists — it degrades, it does not break.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
    ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
    : 0.1,
  // REGULATED tier: never ship PII to a third party. The platform processes
  // user-uploaded plans + org/account data — keep default PII collection OFF.
  // (Aligns with the global "never log sensitive data" rule.)
  sendDefaultPii: false,
  debug: false,
});
