import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "pdf-to-img",
    "pdfjs-dist",
    "@napi-rs/canvas",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

// Sentry build-time wrapper: injects the SDK, uploads source maps (only when
// SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are set — otherwise upload is
// skipped and the build still succeeds), and tree-shakes the Sentry logger.
//
// Required env (names only — never commit values):
//   SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN — source-map upload at build.
//   NEXT_PUBLIC_SENTRY_DSN — runtime DSN (see the sentry.*.config.ts files).
// Vercel: mark SENTRY_AUTH_TOKEN `sensitive`, production+preview only.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
