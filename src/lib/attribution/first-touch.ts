/**
 * First-touch marketing attribution.
 *
 * WHY THIS EXISTS
 * Neither website loaded any tracking, and no form captured campaign data, so
 * every contact HubSpot has ever received arrived with no source attached. That
 * is not a gap in the sign-up capture work (SCRUM-362) — it predates it and
 * affects the marketing contact form already in use. Karen's HubSpot Marketing
 * module cannot report on campaign performance without these inputs.
 *
 * WHAT IT DOES
 * Records the FIRST identifiable touch (ad click, campaign link, external
 * referrer) in a cookie, then replays it with every lead submission so the
 * origin survives the journey from ad → landing page → form or sign-up.
 *
 * ── Three decisions worth knowing ────────────────────────────────────────────
 *
 * 1. FIRST touch wins, not last. Someone who clicks a Facebook ad, leaves, and
 *    returns a week later via a Google search should still be credited to the ad
 *    we paid for. Once written, the cookie is never overwritten until it expires.
 *
 * 2. It is only written when there is a REAL signal (a utm_*, a click id, or an
 *    external referrer). A direct visit deliberately writes nothing. Writing an
 *    empty "direct" first touch would permanently suppress attribution for that
 *    visitor — every later ad click would be ignored because a first touch
 *    already existed. Silence is recoverable; a recorded blank is not.
 *
 * 3. The cookie is scoped to the REGISTRABLE domain (`.mmcbuild.com.au`), so it
 *    is shared between the marketing site (mmcbuild.com.au) and the application
 *    (app.mmcbuild.com.au). This is what lets an ad click on the brochure site
 *    still be attributed when the person signs up on the app, without appending
 *    tracking parameters to every cross-site link and without depending on
 *    HubSpot's own cross-domain configuration.
 *
 *    ⚠️ Preview deploys are on *.vercel.app — a different registrable domain —
 *    so attribution does NOT cross between preview sites. That is a limitation
 *    of previews, not a bug, and it is why this must be verified in production.
 *
 * This file is intentionally BYTE-IDENTICAL in mmcbuild-application and
 * mmcbuild-marketing, the same discipline as lib/marketing/purchase-cta.ts.
 * The two sites must never disagree about what an attributed lead looks like.
 * If you change it here, change it there in the same PR.
 */

export const ATTRIBUTION_COOKIE = "mmc_attr";

/** 90 days: long enough for a considered B2B purchase, short enough to stay honest. */
export const ATTRIBUTION_MAX_AGE_DAYS = 90;

/** The registrable domain both properties share. */
const ROOT_DOMAIN = "mmcbuild.com.au";

/** Cap stored values so the cookie can never approach the 4KB browser limit. */
const MAX_URL_LEN = 500;
const MAX_TAG_LEN = 200;

export type Attribution = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  /** Facebook/Meta ad click id — present on every click from a Meta ad. */
  fbclid: string;
  /** Google Ads click id. */
  gclid: string;
  /** The page the visitor first landed on, with its query string. */
  landingPage: string;
  /** The external site that sent them, if any. */
  referrer: string;
};

export const EMPTY_ATTRIBUTION: Attribution = {
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  utmTerm: "",
  utmContent: "",
  fbclid: "",
  gclid: "",
  landingPage: "",
  referrer: "",
};

/** Wire format field names — short, and stable across both repos. */
const WIRE_KEYS: Array<[keyof Attribution, string]> = [
  ["utmSource", "us"],
  ["utmMedium", "um"],
  ["utmCampaign", "uc"],
  ["utmTerm", "ut"],
  ["utmContent", "uo"],
  ["fbclid", "fb"],
  ["gclid", "gc"],
  ["landingPage", "lp"],
  ["referrer", "rf"],
];

function truncate(value: string, max: number): string {
  const trimmed = (value || "").trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** URLSearchParams rather than JSON: compact, natively escaped, cookie-safe. */
export function serialiseAttribution(attr: Attribution): string {
  const params = new URLSearchParams();
  for (const [field, key] of WIRE_KEYS) {
    const value = attr[field];
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function parseAttribution(raw: string | null | undefined): Attribution {
  if (!raw) return { ...EMPTY_ATTRIBUTION };
  const params = new URLSearchParams(raw);
  const attr = { ...EMPTY_ATTRIBUTION };
  for (const [field, key] of WIRE_KEYS) {
    const value = params.get(key);
    if (value) {
      const max = field === "landingPage" || field === "referrer" ? MAX_URL_LEN : MAX_TAG_LEN;
      attr[field] = truncate(value, max);
    }
  }
  return attr;
}

/**
 * Is there anything worth recording? Decision 2 above depends on this being
 * strict: an internal referrer or a bare visit must NOT count as a first touch.
 */
export function hasAttributionSignal(attr: Attribution): boolean {
  return Boolean(
    attr.utmSource ||
      attr.utmMedium ||
      attr.utmCampaign ||
      attr.utmTerm ||
      attr.utmContent ||
      attr.fbclid ||
      attr.gclid ||
      attr.referrer
  );
}

/** True when the referrer is one of our own properties (so it is not a source). */
export function isInternalReferrer(referrer: string, currentHostname: string): boolean {
  if (!referrer) return true;
  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    return true; // unparseable — treat as no signal rather than invent one
  }
  if (host === currentHostname) return true;
  return host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`);
}

/**
 * Read the attribution present in a URL + referrer pair. Pure, so it is
 * directly testable without a browser.
 */
export function attributionFromLocation(
  href: string,
  referrer: string,
  hostname: string
): Attribution {
  let search = "";
  try {
    search = new URL(href).search;
  } catch {
    search = "";
  }
  const params = new URLSearchParams(search);
  const external = !isInternalReferrer(referrer, hostname);
  return {
    utmSource: truncate(params.get("utm_source") || "", MAX_TAG_LEN),
    utmMedium: truncate(params.get("utm_medium") || "", MAX_TAG_LEN),
    utmCampaign: truncate(params.get("utm_campaign") || "", MAX_TAG_LEN),
    utmTerm: truncate(params.get("utm_term") || "", MAX_TAG_LEN),
    utmContent: truncate(params.get("utm_content") || "", MAX_TAG_LEN),
    fbclid: truncate(params.get("fbclid") || "", MAX_TAG_LEN),
    gclid: truncate(params.get("gclid") || "", MAX_TAG_LEN),
    landingPage: truncate(href, MAX_URL_LEN),
    referrer: external ? truncate(referrer, MAX_URL_LEN) : "",
  };
}

/** Cookie domain attribute, or null to leave it host-only (localhost, previews). */
export function attributionCookieDomain(hostname: string): string | null {
  if (hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    return `.${ROOT_DOMAIN}`;
  }
  return null;
}

/** Read a cookie value from a raw `document.cookie` / `Cookie:` header string. */
export function readCookie(cookieString: string | null | undefined, name: string): string {
  if (!cookieString) return "";
  for (const part of cookieString.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return "";
}

// ── Browser-only helpers ────────────────────────────────────────────────────

/**
 * Capture the first touch, once. Safe to call on every page load: it returns
 * immediately if a first touch is already recorded, or if this visit carries no
 * identifiable source.
 */
export function captureFirstTouch(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (readCookie(document.cookie, ATTRIBUTION_COOKIE)) return; // first touch wins

  const attr = attributionFromLocation(
    window.location.href,
    document.referrer,
    window.location.hostname
  );
  if (!hasAttributionSignal(attr)) return; // direct visit — deliberately record nothing

  const domain = attributionCookieDomain(window.location.hostname);
  const maxAge = ATTRIBUTION_MAX_AGE_DAYS * 24 * 60 * 60;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // SameSite=Lax, not Strict: the visitor arrives here by a cross-site
  // navigation from the ad, which is precisely the request that must carry it.
  document.cookie =
    `${ATTRIBUTION_COOKIE}=${encodeURIComponent(serialiseAttribution(attr))}` +
    `; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}` +
    (domain ? `; Domain=${domain}` : "");
}

/** The recorded first touch, for attaching to a form submission. */
export function readFirstTouch(): Attribution {
  if (typeof document === "undefined") return { ...EMPTY_ATTRIBUTION };
  return parseAttribution(readCookie(document.cookie, ATTRIBUTION_COOKIE));
}

/**
 * The HubSpot visitor token, set by the HubSpot tracking script on this domain.
 *
 * This is the single most important value in this file. `hutk` is the ONLY
 * mechanism by which HubSpot ties a form submission back to the visitor's
 * browsing session, and therefore to its original traffic source and campaign.
 * Without it, HubSpot records a contact that appeared from nowhere — which is
 * exactly the state both sites are in today.
 *
 * It must be read in the BROWSER and sent in the payload: the marketing forms
 * POST cross-origin to the application's /api/leads without credentials, so the
 * server cannot see the marketing site's cookie.
 */
export function readHubSpotUtk(): string {
  if (typeof document === "undefined") return "";
  return readCookie(document.cookie, "hubspotutk");
}

/**
 * The attribution half of a lead payload. Spread this into every form
 * submission — one call site per form, so a new form cannot quietly ship
 * unattributed.
 *
 * Typed structurally rather than against the lead schema so this file stays
 * dependency-free and byte-identical across both repositories.
 */
export type LeadAttributionFields = {
  hutk: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  fbclid: string;
  gclid: string;
  landingPage: string;
  referrer: string;
};

export function leadAttributionFields(): LeadAttributionFields {
  const attr = readFirstTouch();
  return {
    hutk: readHubSpotUtk(),
    utmSource: attr.utmSource,
    utmMedium: attr.utmMedium,
    utmCampaign: attr.utmCampaign,
    utmTerm: attr.utmTerm,
    utmContent: attr.utmContent,
    fbclid: attr.fbclid,
    gclid: attr.gclid,
    landingPage: attr.landingPage,
    referrer: attr.referrer,
  };
}
