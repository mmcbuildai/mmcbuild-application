// Sentry — browser/client initialisation. Next.js loads this automatically on
// the client. Captures unhandled client errors + (sampled) navigation traces.
//
// Required env: NEXT_PUBLIC_SENTRY_DSN (public DSN). No-op until it is set.
// Session Replay is deliberately NOT enabled — it would capture user content
// (uploaded-plan UI, account data) and breach the REGULATED no-PII posture.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  debug: false,
});

// Instruments App Router client-side navigations for performance tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
