import { describe, it, expect } from "vitest";
import {
  ATTRIBUTION_COOKIE,
  EMPTY_ATTRIBUTION,
  attributionCookieDomain,
  attributionFromLocation,
  hasAttributionSignal,
  isInternalReferrer,
  parseAttribution,
  readCookie,
  serialiseAttribution,
} from "@/lib/attribution/first-touch";

describe("attribution wire format", () => {
  it("round-trips every field", () => {
    const attr = {
      utmSource: "facebook",
      utmMedium: "paid_social",
      utmCampaign: "mmc-launch-aug",
      utmTerm: "modular build",
      utmContent: "video-a",
      fbclid: "IwAR123",
      gclid: "Cj0KCQ",
      landingPage: "https://mmcbuild.com.au/?utm_source=facebook",
      referrer: "https://l.facebook.com/",
    };
    expect(parseAttribution(serialiseAttribution(attr))).toEqual(attr);
  });

  it("returns empty attribution for missing or junk input", () => {
    expect(parseAttribution(null)).toEqual(EMPTY_ATTRIBUTION);
    expect(parseAttribution("")).toEqual(EMPTY_ATTRIBUTION);
    expect(parseAttribution("not=a=known=key")).toEqual(EMPTY_ATTRIBUTION);
  });

  it("survives values containing cookie-hostile characters", () => {
    const attr = {
      ...EMPTY_ATTRIBUTION,
      utmCampaign: "spring; sale=50%, & more",
      landingPage: "https://mmcbuild.com.au/?a=1&b=2",
    };
    expect(parseAttribution(serialiseAttribution(attr))).toEqual(attr);
  });
});

describe("attributionFromLocation", () => {
  it("extracts campaign parameters from the landing URL", () => {
    const attr = attributionFromLocation(
      "https://mmcbuild.com.au/pricing?utm_source=facebook&utm_medium=paid_social&utm_campaign=aug&fbclid=abc",
      "https://l.facebook.com/",
      "mmcbuild.com.au"
    );
    expect(attr.utmSource).toBe("facebook");
    expect(attr.utmMedium).toBe("paid_social");
    expect(attr.utmCampaign).toBe("aug");
    expect(attr.fbclid).toBe("abc");
    expect(attr.referrer).toBe("https://l.facebook.com/");
  });

  it("discards an internal referrer so navigation cannot poison the source", () => {
    // Moving from the brochure site to the app is not a new traffic source.
    const attr = attributionFromLocation(
      "https://app.mmcbuild.com.au/signup",
      "https://mmcbuild.com.au/pricing",
      "app.mmcbuild.com.au"
    );
    expect(attr.referrer).toBe("");
    expect(hasAttributionSignal(attr)).toBe(false);
  });

  it("does not fabricate a source for a direct visit", () => {
    const attr = attributionFromLocation("https://mmcbuild.com.au/", "", "mmcbuild.com.au");
    expect(hasAttributionSignal(attr)).toBe(false);
  });

  it("treats an unparseable href as no campaign rather than throwing", () => {
    const attr = attributionFromLocation("not-a-url", "", "mmcbuild.com.au");
    expect(attr.utmSource).toBe("");
    expect(hasAttributionSignal(attr)).toBe(false);
  });
});

describe("hasAttributionSignal", () => {
  it("is false when only a landing page is known", () => {
    // The whole point of decision 2: a bare visit must record nothing, or a
    // later ad click can never be attributed to this visitor.
    expect(
      hasAttributionSignal({ ...EMPTY_ATTRIBUTION, landingPage: "https://mmcbuild.com.au/" })
    ).toBe(false);
  });

  it("is true for any single campaign signal", () => {
    expect(hasAttributionSignal({ ...EMPTY_ATTRIBUTION, fbclid: "x" })).toBe(true);
    expect(hasAttributionSignal({ ...EMPTY_ATTRIBUTION, gclid: "x" })).toBe(true);
    expect(hasAttributionSignal({ ...EMPTY_ATTRIBUTION, utmSource: "x" })).toBe(true);
    expect(hasAttributionSignal({ ...EMPTY_ATTRIBUTION, referrer: "https://google.com/" })).toBe(
      true
    );
  });
});

describe("isInternalReferrer", () => {
  it("recognises our own properties", () => {
    expect(isInternalReferrer("https://mmcbuild.com.au/x", "app.mmcbuild.com.au")).toBe(true);
    expect(isInternalReferrer("https://app.mmcbuild.com.au/x", "mmcbuild.com.au")).toBe(true);
    expect(isInternalReferrer("", "mmcbuild.com.au")).toBe(true);
  });

  it("recognises a genuine external source", () => {
    expect(isInternalReferrer("https://l.facebook.com/", "mmcbuild.com.au")).toBe(false);
    expect(isInternalReferrer("https://www.google.com/", "mmcbuild.com.au")).toBe(false);
  });

  it("is not fooled by a lookalike domain", () => {
    // "notmmcbuild.com.au" must not be read as a subdomain of ours.
    expect(isInternalReferrer("https://notmmcbuild.com.au/", "mmcbuild.com.au")).toBe(false);
  });
});

describe("attributionCookieDomain", () => {
  it("scopes to the shared registrable domain in production", () => {
    // This is what carries an ad click from the brochure site to app sign-up.
    expect(attributionCookieDomain("mmcbuild.com.au")).toBe(".mmcbuild.com.au");
    expect(attributionCookieDomain("app.mmcbuild.com.au")).toBe(".mmcbuild.com.au");
  });

  it("stays host-only where there is no shared parent", () => {
    expect(attributionCookieDomain("localhost")).toBeNull();
    expect(attributionCookieDomain("mmcbuild-marketing.vercel.app")).toBeNull();
  });

  it("refuses a lookalike domain", () => {
    expect(attributionCookieDomain("evil-mmcbuild.com.au")).toBeNull();
  });
});

describe("readCookie", () => {
  it("finds a value among others", () => {
    expect(readCookie("a=1; hubspotutk=abc123; b=2", "hubspotutk")).toBe("abc123");
  });

  it("returns empty for absent cookies or absent header", () => {
    expect(readCookie("a=1", "hubspotutk")).toBe("");
    expect(readCookie(null, "hubspotutk")).toBe("");
    expect(readCookie(undefined, "hubspotutk")).toBe("");
  });

  it("does not match on a name suffix", () => {
    // "not_hubspotutk" must not satisfy a request for "hubspotutk".
    expect(readCookie("not_hubspotutk=nope", "hubspotutk")).toBe("");
  });

  it("decodes an encoded value", () => {
    expect(readCookie(`${ATTRIBUTION_COOKIE}=us%3Dfacebook`, ATTRIBUTION_COOKIE)).toBe(
      "us=facebook"
    );
  });
});
