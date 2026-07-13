// MMC BUILD — brand palette for JAVASCRIPT/CANVAS consumers (SCRUM-210).
//
// The CANONICAL source of the site's colours is `src/styles/brand.css` — that's
// what re-themes every rendered page. This file mirrors the SAME six hex values
// for the handful of places that can't read CSS variables at runtime (PDF report
// generators via jsPDF, canvas/confetti, <meta theme-color>, OG images).
//
// KEEP IN SYNC: if you change a colour, change it in BOTH brand.css and here.
// (There is no build step wiring CSS → JS, so this small duplication is
// deliberate and documented rather than magic.)

export const BRAND = {
  white: "#ffffff",
  navy: "#19365b", // primary · headings · deep brand
  blue: "#1c75bc", // interactive accent · links
  grey: "#bfc5c6", // neutral · borders
  purple: "#635a92", // secondary accent
  green: "#8edc49", // success · positive highlight
} as const;

export type BrandColor = keyof typeof BRAND;
