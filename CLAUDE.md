# TroyLabs website — contributor rules

The site is a 1:1 implementation of the designer's Figma file ("Troylabs 2026", page
"[CURRENT] website redesign"). Fidelity to the design is the primary requirement; every
section is verified against Figma's own render with `pnpm test:fidelity`.

## Stack
Astro 7 (static), Tailwind v4 (CSS-first, `src/styles/global.css`), TypeScript, React only for
future interactive islands. `pnpm dev` · `pnpm build` · `pnpm test:fidelity`.

## Design units — the one rule that matters
The Figma pages are drawn on a **1001 px-wide artboard**. Every number in this codebase is that
Figma number ("design units", du). The CSS variable `--u` converts du → px and scales the whole
layout proportionally (1440 px viewport → 1 du = 1.4386 px; body text 12 du → 17 px).

- Never hardcode px for layout or type. Use `u(n)`, `pos(x, y, w, h)` from `src/lib/units.ts`,
  or `calc(N * var(--u))`. Numbers come from `design/spec/<page>.txt` — don't eyeball.
- A `.section` is a strip of the artboard with its design height (`style="--h:…"`); children are
  placed with `class="abs"` + `pos()` in coordinates relative to that section's top
  (`y(v) = v - TOP`). Section bands are listed in `tests/fidelity/visual.spec.ts`.
- Use flex/grid where the design *is* a list or grid (nav, footer columns, board grid, cards);
  use absolute placement for art-directed composition (planets, stars, orbit labels). Both are fine;
  mixing them inside one section is normal.
- Text boxes get +0.6 du of width slack automatically (Figma ignores trailing letter-spacing when
  wrapping, Chrome doesn't). If a paragraph still wraps differently from Figma, measure — don't nudge.
- Colors only via the tokens in `global.css` (`bg-bg`, `text-ink`, `--color-orange` …) or the exact
  Figma hex for one-off fills, with the node id in a comment. Font is Helvetica (as drawn) via `--font-sans`.
- Type classes (`.t-nav`, `.t-body`, `.t-title`, `.t-hero` …) encode the measured Figma text styles.

## Assets
- `src/assets/space/` — designer's master PNGs, optimized by `pnpm assets` (planets, stars, orbs,
  rockets, wordmark). Exported glyph PNGs include glow halos: size them by the measured body ratio
  (see `Stars.astro`, `Planet.astro`, `Catalyst.astro`), never by the raw PNG box.
- `src/assets/figma/` — vectors/renders exported straight from Figma by `pnpm figma:vectors`
  (wordmark letters, icons, logos, globe, starburst). Add new ones to `scripts/figma-vectors.ts`.
- `design/figma-images/` — every image fill in the file (photos, logos), keyed by Figma imageRef;
  `manifest.json` says where each is used. Copy what you need into `src/assets/figma/` with a real name.
- Never `<img>` the raw masters; always go through Astro's `<Image>`.

## Design source (`design/`)
`figma.json` (REST dump) → `pnpm figma:spec` → `design/spec/<page>.{json,txt}` (flat node list:
relative x/y/w/h, text style, fills, effects). `design/reference/<page>@1x.png` are Figma's 1:1
renders — the fidelity baselines. Re-pull with `pnpm figma:pull` (needs `FIGMA_TOKEN` in `.env`).

## Verification (required before calling anything done)
`pnpm test:fidelity -g <page>` renders the page at a 1001 px viewport (1 du = 1 px) and diffs it
against the Figma render. Look at `test-results/fidelity/<page>.diff.png` (red = mismatch). Targets:
page height must equal the Figma frame height; per-section mismatch ≈ 1–2 % (antialiasing); anything
≥ 3 % means a real difference — measure it (bounding boxes, computed styles) and fix the cause.

## Structure
```
src/components/nav/         Nav, Footer (shared by all pages; Figma components)
src/components/ui/          small reusable pieces (ApplyLink …)
src/components/space/       illustration layer: Stars, Glow, Planet — the only place animation hooks go later
src/components/sections/<page>/   one file per design section, Figma node ids in the header comment
src/content/                data that feeds sections (board.json …)
src/pages/                  index, build, demo, ignite
```

## Motion layer (`src/styles/motion.css`, `src/scripts/motion.ts`)
- The static design is the REST state of every animation; the fidelity test runs with reduced motion and must stay green.
- Everything is gated on `html.motion` (set in the head only when `prefers-reduced-motion: no-preference`).
- Compositor-only properties (transform / opacity / offset-distance); scroll-linked motion is native CSS
  scroll-driven animation (`animation-timeline`), reveals use Motion's `inView` (0.5 kB). No GSAP/Lenis.
- Scripts (all motion-gated, re-init on `astro:page-load`): `sky.ts` canvas star field + nebula + `--mx/--my` pointer;
  `scroll.ts` Lenis weighted scroll + `--scroll-v` velocity; `motion.ts` reveals (Motion `inView`); `pointer.ts` cursor light
  (`--lx/--ly`, never `--x/--y` — those are positions) + magnetic CTAs; `transition.ts` rocket page transitions; `globe.ts`;
  `bubbles.ts`. Hero choreography and everything else is CSS in `motion.css`.
- Hooks: `.star` (twinkle), `.planet` (scroll drift) › `.parallax` (mouse depth) › `img.breathe` (breathing),
  `data-hover="lift|scale"` (tiles + cursor light), `[data-reveal]` is added by JS to below-the-fold units.
- Gotchas learned the hard way: entrance animations use `fill-mode: backwards` (a `both` fill pins `transform` and kills
  hover/parallax); IntersectionObserver sees a clip-path-hidden image as zero area → observe its wrapper (`figure`);
  `:where()` on hidden-state selectors so reveal rules can win.
- BUILD rocket: `offset-path: url(#build-timeline-path)` inside a 354×1248 px `.flight` box scaled by `--un`
  (url() paths are raw px, they don't scale with the SVG viewBox). Nose orientation was verified visually.
- Home flight: `scripts/flight.ts` drives the wordmark rocket per frame (scrub-with-lag: chases a runtime
  scroll→distance map at 9%/frame — never scroll-locked, so fast scrolling can't teleport it; the wordmark
  hand-off is a progress-driven crossfade). Don't reintroduce CSS scroll-timeline keyframes for it.

## Known placeholders in the design (mirror them, don't invent)
Executive-board photos are a checkerboard placeholder; BUILD has a "this section tbd?" frame;
social/portal links have no URLs in Figma. Keep a `TODO(designer)` comment on each.
