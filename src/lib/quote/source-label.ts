/**
 * Client-facing rate-provenance labels for the MMC Quote report.
 *
 * Two honest buckets the client (Karen) sees:
 *  - Market-sourced rates: "Market rate (+/-15%)" — sourced from comparable
 *    industry quotes, with a +/-15% margin for price creep. Supplier identities
 *    are never shown.
 *  - Everything else (generic seed rates, unfounded MMC guesses, and any rate
 *    the model estimates on the fly): "Extrapolated from public information
 *    (data gap)" — flagged as a gap that needs a real rate.
 *
 * The legacy on-the-fly label the agent emits is "AI Estimated"; it maps to the
 * extrapolated/data-gap bucket so old and new reports read consistently.
 */

const MARKET_PREFIX = "Market Rate";

export function isMarketSourced(name: string | null | undefined): boolean {
  return !!name && name.startsWith(MARKET_PREFIX);
}

/** Full provenance label, with the legacy "AI Estimated" mapped to the data-gap bucket. */
export function displayRateSource(name: string | null | undefined): string {
  if (isMarketSourced(name)) return name as string;
  if (!name || name === "AI Estimated") {
    return "Extrapolated from public information (data gap)";
  }
  return name;
}

/** Short badge for per-line display. */
export function rateSourceBadge(
  name: string | null | undefined,
): { label: string; market: boolean } {
  if (isMarketSourced(name)) return { label: "Market rate (±15%)", market: true };
  return { label: "Extrapolated (data gap)", market: false };
}
