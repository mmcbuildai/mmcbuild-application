"use client";

import Script from "next/script";

/**
 * Google Analytics 4 (page views + Google Ads conversion tracking).
 *
 * Hand-rolled via `next/script` rather than `@next/third-parties/google`'s
 * <GoogleAnalytics> — that package cannot currently be added as a dependency
 * here: `pnpm install` fails in every environment tried (this sandbox, the
 * user's own machine) because @caistech/* private packages already in this
 * repo's dependency tree need a GitHub Packages token this project doesn't
 * have working access to, and that failure blocks ANY new dependency, not
 * just this one. `@next/third-parties`' own GoogleAnalytics component
 * (see its ga.js source) does nothing more than these same two <Script> tags
 * — the inline snippet initialises `window.dataLayer` and defines `gtag()`,
 * the second loads Google's own gtag.js library — so this is a faithful,
 * dependency-free equivalent. mmcbuild-marketing DOES use the real package
 * (its install worked, no @caistech dependency there); this asymmetry is
 * deliberate, not drift — revisit if this repo's registry access ever gets
 * fixed.
 *
 * Companion to the same tracking in mmcbuild-marketing — both load the SAME
 * `NEXT_PUBLIC_GA_MEASUREMENT_ID`, which is what lets GA4 recognise a visitor
 * across the two domains (mmcbuild.com.au and app.mmcbuild.com.au) as one
 * journey, once cross-domain measurement is configured for those two domains
 * in the GA4 property's Data Stream settings (a dashboard setting, not code).
 *
 * ⚠️ DELIBERATELY GATED ON `NEXT_PUBLIC_GA_MEASUREMENT_ID`, same reasoning as
 * HubSpotTracking (see hubspot-tracking.tsx): GA4 sets NON-ESSENTIAL tracking
 * cookies and needs the privacy policy to disclose it before it runs in
 * production. Leaving the variable unset means this renders nothing, so the
 * code can land and be reviewed without turning tracking on. Setting it is a
 * separate, deliberate act.
 */

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function GoogleAnalyticsTracking() {
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        id="_next-ga-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');`,
        }}
      />
      <Script
        id="_next-ga"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
    </>
  );
}
