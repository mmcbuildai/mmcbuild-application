# Branding & theme — how to change the site's colours

**One file controls the whole site's colour theme: [`src/styles/brand.css`](../src/styles/brand.css).**

Change a colour there, save, and every button, link, heading, card, chart and
badge across the entire app updates. You do not need to touch any other file,
and you don't need to be a developer to do it.

---

## The quick version (for a non-developer)

1. Open **`src/styles/brand.css`**.
2. Near the top you'll see a block called **"YOUR BRAND PALETTE"** with six lines:

   ```css
   --color-brand-white:  #ffffff;   /* page background                     */
   --color-brand-navy:   #19365b;   /* primary · headings · deep brand     */
   --color-brand-blue:   #1c75bc;   /* interactive accent · buttons · links */
   --color-brand-grey:   #bfc5c6;   /* neutral · borders · muted surfaces  */
   --color-brand-purple: #635a92;   /* secondary accent                    */
   --color-brand-green:  #8edc49;   /* success · positive highlight        */
   ```

3. Replace any hex code (the `#xxxxxx` part) with your new colour. You can get a
   hex code from Canva, Figma, or any colour picker.
4. Save. That's it — the whole site re-themes.

You only ever edit those **six** values. Everything else (all the lighter and
darker shades used for hovers, backgrounds, borders, etc.) is generated
**automatically** from those six using CSS `color-mix()`, so you never have to
pick fifty shades by hand.

---

## What each colour does

| Variable | Used for |
|---|---|
| `--color-brand-white` | Page background |
| `--color-brand-navy` | Primary colour — headings, primary buttons, deep brand |
| `--color-brand-blue` | Interactive accent — links, focus rings, highlights |
| `--color-brand-grey` | Neutral surfaces, borders, muted text |
| `--color-brand-purple` | Secondary accent (e.g. some chart series) |
| `--color-brand-green` | Success / positive highlight |

## For developers

- `src/styles/brand.css` is imported by `src/app/globals.css`, which maps the
  shadcn/ui **semantic tokens** (`--primary`, `--accent`, `--muted`, `--border`,
  `--ring`, `--chart-*`, `--sidebar-*`, …) onto the brand palette. Edit the brand
  file, **not** the semantic tokens.
- The palette is exposed as Tailwind utilities: `bg-brand-navy`, `text-brand-blue`,
  `bg-brand-500`, `text-brandgreen-600`, `border-brandgrey-200`, etc. The
  `brand-50…900` ramp runs blue→navy; `brandgreen-*` is the success ramp;
  `brandgrey-*` is the neutral ramp. **Use these instead of hard-coding hexes or
  picking arbitrary Tailwind palette colours** (e.g. don't reintroduce `teal-*`).
- A few JavaScript/canvas surfaces can't read CSS variables at runtime (jsPDF
  report generators, `canvas-confetti`, `<meta theme-color>`, OG images). They
  import the same six hexes from **`src/lib/brand/tokens.ts`** — keep that file in
  sync with `brand.css` if you change a core colour.
- Dark mode keeps neutral dark surfaces but uses the brand blue for interactive
  elements; see the `.dark` block in `globals.css`.

## Known exception

The MMC-system colours in `src/components/build/plan-comparison-3d.tsx` are a
deliberate **categorical** palette (a distinct colour per MMC system in the 3D
legend), not site chrome, so they are intentionally not driven by the brand
tokens.
