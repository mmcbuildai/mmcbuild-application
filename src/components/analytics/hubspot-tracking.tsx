"use client";

import Script from "next/script";
import { useEffect } from "react";
import { captureFirstTouch } from "@/lib/attribution/first-touch";

/**
 * HubSpot tracking script + first-touch attribution capture.
 *
 * The script sets the `hubspotutk` visitor cookie. That cookie is what every
 * form submission then replays back to HubSpot as `context.hutk`, and it is the
 * only mechanism by which HubSpot can attribute a contact to the campaign that
 * produced it. Without the script loaded, no submission can carry it, and every
 * contact arrives in HubSpot with no source — the state both sites are in today.
 *
 * ⚠️ DELIBERATELY GATED ON `NEXT_PUBLIC_HUBSPOT_PORTAL_ID`.
 * The script sets NON-ESSENTIAL tracking cookies. Under the portfolio
 * regulatory standard that requires the privacy policy to disclose it (HubSpot
 * as CRM, US-based, overseas storage) before it runs in production — the same
 * disclosure already outstanding on SCRUM-362. Leaving the variable unset means
 * this renders nothing, so the code can land and be reviewed without turning
 * tracking on. Setting it is a separate, deliberate act.
 *
 * First-touch capture runs REGARDLESS of whether the script is configured: the
 * utm/click-id data is our own, lands in our own database, and is useful even if
 * HubSpot is never enabled.
 */

const PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;

export default function HubSpotTracking() {
  useEffect(() => {
    captureFirstTouch();
  }, []);

  if (!PORTAL_ID) return null;

  return (
    <Script
      id="hs-script-loader"
      strategy="afterInteractive"
      src={`https://js.hs-scripts.com/${PORTAL_ID}.js`}
    />
  );
}
