/**
 * GA4 Measurement Protocol — server-side event sends.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE BROWSER TAG
 * Both conversion moments this fires for — a trial starting, a trial converting
 * to a real payment — happen inside the Stripe webhook handler, which Stripe
 * calls directly from its own servers. There is no browser tab open at that
 * moment, so `gtag('event', ...)` (which only works client-side) cannot reach
 * GA4 for either one. The Measurement Protocol is GA4's separate HTTP endpoint
 * for exactly this: any backend can POST an event directly, no browser required.
 *
 * TYING A SERVER EVENT BACK TO THE VISITOR WHO CLICKED THE AD
 * A Measurement Protocol event with no `client_id` lands in GA4 as an orphaned,
 * unattributed blip — useless for Ads conversion tracking, which is the entire
 * point. `client_id` is the value GA4's own browser tag already put in the
 * visitor's `_ga` cookie; parseGaClientId() below extracts it. Capturing that
 * value at checkout time and carrying it through Stripe metadata (see
 * billing/actions.ts's ga_client_id) is what lets an event fired from THIS
 * webhook, days later, still land on the correct visitor's original journey.
 *
 * ⚠️ DELIBERATELY GATED, same reasoning as every tracking component in this
 * repo (HubSpotTracking, GoogleAnalyticsTracking): does nothing until BOTH
 * NEXT_PUBLIC_GA_MEASUREMENT_ID and GA_MEASUREMENT_API_SECRET are set.
 *
 * Best-effort: a failure here must never fail a webhook Stripe is waiting on,
 * or a checkout a real customer is completing. Logs and returns, never throws.
 */

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const API_SECRET = process.env.GA_MEASUREMENT_API_SECRET;

/**
 * Extract the Measurement Protocol client_id from a raw `_ga` cookie value.
 *
 * GA4's `_ga` cookie is formatted `GA<version>.<depth>.<id1>.<id2>`, e.g.
 * `GA1.1.824711682.1770527022` — the client_id GA4 itself uses is the last two
 * dot-separated segments joined back together (`824711682.1770527022`), not
 * the whole cookie value. Returns null for anything that doesn't have at least
 * two segments, rather than guessing.
 */
export function parseGaClientId(rawCookieValue: string | undefined | null): string | null {
  if (!rawCookieValue) return null;
  const parts = rawCookieValue.split(".");
  if (parts.length < 2) return null;
  return parts.slice(-2).join(".");
}

interface GA4Event {
  name: string;
  params?: Record<string, string | number | boolean>;
}

/**
 * Send one event to GA4 via the Measurement Protocol. Fire-and-forget from the
 * caller's perspective — never throws, only logs on failure.
 */
export async function sendGA4Event(clientId: string | null | undefined, event: GA4Event): Promise<void> {
  if (!MEASUREMENT_ID || !API_SECRET) return;
  if (!clientId) {
    console.warn(`[ga4-measurement-protocol] no client_id for event "${event.name}" — skipped, would land unattributed`);
    return;
  }

  try {
    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: clientId,
          events: [event],
        }),
      },
    );
    // The Measurement Protocol always returns 2xx/204 even for a malformed
    // payload — it does not validate synchronously — so a non-2xx here means
    // something is wrong with the request itself (bad measurement_id/secret,
    // network failure), worth logging rather than silently swallowing.
    if (!res.ok) {
      console.warn(`[ga4-measurement-protocol] non-OK response for event "${event.name}":`, res.status);
    }
  } catch (err) {
    console.warn(`[ga4-measurement-protocol] send failed for event "${event.name}":`, err);
  }
}
