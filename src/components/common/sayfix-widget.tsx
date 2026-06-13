/**
 * SayFixWidget — floating "Report a problem" button.
 *
 * Registry-free local mirror of `@caistech/sayfix-embed`. This repo deliberately dropped the private
 * @caistech GitHub Packages registry on 2026-05-24 (see `.npmrc`) — all shared code is vendored
 * instead of installed — so the widget is mirrored here rather than added as a dependency. Keep its
 * behaviour in sync with the upstream package if that changes.
 *
 * Self-contained by design: no external deps, inline styles only (no Tailwind reliance — Tailwind
 * doesn't scan node_modules, and inline styles render identically regardless of CSS setup), and an
 * inlined SVG icon. Clicking opens the hosted SayFix intake in a new tab, scoped to this product;
 * SayFix infers the GitHub owner from the product slug, so only the slug travels.
 *
 * The hosted base URL is read from `NEXT_PUBLIC_SAYFIX_BASE_URL` (set in Vercel) rather than
 * hardcoded, so the vendor domain never lives in committed source and the widget survives a SayFix
 * org/domain move. If the env var is unset the widget renders nothing (fails safe).
 */

/** MUST equal the SayFix `repos.github_repo` registered for this app (mmcbuildai/mmcbuild-application). */
const PRODUCT_SLUG = "mmcbuild-application";

export function SayFixWidget() {
  const base = process.env.NEXT_PUBLIC_SAYFIX_BASE_URL?.replace(/\/+$/, "");
  if (!base) return null;

  const href = `${base}/welcome?product=${encodeURIComponent(PRODUCT_SLUG)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Report a problem — get it SayFixed"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 2147483000,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minHeight: 44,
        padding: "10px 16px",
        borderRadius: 9999,
        background: "#111827",
        color: "#ffffff",
        fontSize: 15,
        fontWeight: 600,
        lineHeight: 1.2,
        textDecoration: "none",
        boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span>Report a problem</span>
    </a>
  );
}
