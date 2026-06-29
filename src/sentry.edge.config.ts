// Sentry — Edge runtime initialisation (middleware + any edge route handlers).
//
// Loaded by `src/instrumentation.ts` `register()` when NEXT_RUNTIME === "edge".
// Same DSN + no-PII posture as the server config; see that file's header for env.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
    ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
    : 0.1,
  // REGULATED tier: never ship PII to a third party — keep default PII OFF.
  sendDefaultPii: false,
  debug: false,
});
