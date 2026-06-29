"use client";

// Last-resort React error boundary: catches errors that escape the root layout
// (i.e. the app failed to render at all). Reports the exception to Sentry and
// shows a minimal recovery screen with a retry — never a dead end.
//
// Note: this is the catastrophic-render fallback only. Normal in-app failures are
// surfaced with their real cause (see src/lib/ai/extract-json.ts / provider-errors.ts);
// this boundary exists for the rare case where even that machinery can't run.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "1rem", lineHeight: 1.5, color: "#475569", marginBottom: "1.5rem" }}>
            The page failed to load. The error has been logged. You can try again,
            and if it keeps happening, please let the team know.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              minHeight: "44px",
              padding: "0 1.25rem",
              fontSize: "1rem",
              fontWeight: 500,
              color: "#ffffff",
              background: "#0f172a",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
