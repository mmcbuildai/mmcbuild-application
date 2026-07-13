// MMC BUILD — brand accent colours for JAVASCRIPT/CANVAS consumers (SCRUM-210).
//
// The CANONICAL source of the site's accent colours is `src/styles/brand.css`
// (the brand-*/brandgreen-* utilities). This file mirrors the SAME hex values
// for the few places that can't read CSS variables at runtime (canvas/confetti,
// PDF generators, <meta theme-color>, OG images).
//
// KEEP IN SYNC with brand.css: if you change a colour there, change it here too.
// (There's no build step wiring CSS → JS, so this small duplication is
// deliberate and documented.)

export const BRAND = {
  accent: "#0d9488", // brand accent — matches --color-brand-600 (teal)
  accentLight: "#14b8a6", // --color-brand-500
  green: "#10b981", // success — --color-brandgreen-500
  greenLight: "#34d399", // --color-brandgreen-400
  greenDark: "#059669", // --color-brandgreen-600
} as const;

export type BrandColor = keyof typeof BRAND;
