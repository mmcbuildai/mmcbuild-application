# Branding & theme — how to change the site's colours

**One file controls the site's accent colours: [`src/styles/brand.css`](../src/styles/brand.css).**

Right now that file holds the **existing theme**, so the site looks exactly as it
does today. When you want to change the look, edit the hex values in that one
file and save — every button, link, badge, chart and highlight that uses the
brand colours updates across the whole site. You don't need to be a developer.

---

## The quick version (for a non-developer)

1. Open **`src/styles/brand.css`**.
2. You'll see two colour ranges:
   - **`--color-brand-*`** — the main brand accent (currently teal). `500`/`600`
     are the shades you see on buttons and links; lower numbers are lighter
     (soft backgrounds), higher numbers are darker (text).
   - **`--color-brandgreen-*`** — success / positive highlights (currently green).
3. To change a colour, replace its `#xxxxxx` hex value. You can get hex codes
   from Canva, Figma, or any colour picker.
4. Save. That's it — the site updates.

### Want the navy/blue MMC brand instead?

A ready-made **navy/blue palette** is provided at the **bottom of
`brand.css`**, in a commented block. To adopt it, copy those `--color-brand-*`
values over the ones in the `@theme` block at the top. (Core navy `#19365b`,
blue `#1c75bc`, green `#8edc49`.)

---

## For developers

- `src/styles/brand.css` is imported by `src/app/globals.css` and defines the
  Tailwind utilities `bg-brand-500`, `text-brand-600`, `bg-brandgreen-100`, etc.
  **Use these for brand accents instead of hard-coding hexes or picking arbitrary
  Tailwind palette colours** (don't reintroduce `teal-*`/`emerald-*`).
- The neutral structural tokens (backgrounds, borders, muted text — the shadcn
  `--background`/`--foreground`/`--primary`/`--muted`/… variables in
  `globals.css`) are intentionally the shadcn defaults and are **not** part of
  the brand accent file. Changing the brand file changes the accent identity,
  not the neutral chrome.
- A few JavaScript/canvas surfaces can't read CSS variables at runtime
  (`canvas-confetti`, PDF generators, `<meta theme-color>`). They import the same
  hexes from **`src/lib/brand/tokens.ts`** — keep it in sync with `brand.css`.

## Known exception

The MMC-system colours in `src/components/build/plan-comparison-3d.tsx` are a
deliberate **categorical** palette (a distinct colour per MMC system in the 3D
legend), not site chrome, so they are intentionally not driven by the brand
tokens.
