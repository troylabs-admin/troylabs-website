# TroyLabs

The website for [USC TroyLabs](https://linktr.ee/TroyLabs) — a student-run startup accelerator at the
University of Southern California. It is a 1:1 implementation of the 2026 Figma redesign, plus a motion
layer built on top of it.

**Live:** https://troylabs.vercel.app  ·  **Domain:** `troylabs.vc` (registered at Name.com, not yet
pointed at this site — see [Deployment](#deployment))

```bash
pnpm install
pnpm dev              # http://localhost:4321
pnpm build            # static output in dist/
pnpm test:fidelity    # pixel-diff every page against Figma's own renders
```

Requires Node ≥ 22.12 (`.nvmrc` pins 22) and pnpm. Astro 7 · Tailwind v4 (CSS-first) · TypeScript ·
no runtime framework — the output is static HTML, CSS and a little vanilla JS.

---

## The one rule: design units

Every number in this codebase is a **design unit (du)** — a coordinate from the designer's Figma
artboard, which is drawn 1001 px wide. A single CSS variable, `--u`, converts du → px at runtime
(`--un` is its unitless twin), so the whole page scales as one composition instead of reflowing.

```astro
<div class="abs" style={pos(219, 2234, 567, 567)} />   <!-- x, y, w, h — straight from Figma -->
<span style={`gap:${u(50)}`} />                        <!-- 50 du of gap -->
```

**Never hardcode pixels in a section component.** Use `pos()` / `u()` from `src/lib/units.ts`, and take
the numbers from `design/spec/<page>.txt` rather than eyeballing them. A `.section` is one strip of the
artboard (`--h` in du); its children are `.abs` positioned relative to that strip.

Below 768 px the artboard is hidden entirely and each section renders a flowed mobile subtree instead —
see [Mobile](#mobile).

## How the repo is organised

| Path | What lives there |
|---|---|
| `src/pages/` | one file per route: `index`, `build`, `demo`, `ignite`, `portal` |
| `src/components/sections/<page>/` | one component per design section, Figma node ids in each header comment |
| `src/components/nav/` · `ui/` · `space/` | nav + footer · buttons · the illustration layer (planets, stars, glow) |
| `src/content/` | data that feeds the sections (board members, speakers). **Edit copy here, not in components** |
| `src/styles/global.css` | design tokens, the du system, the measured type scale |
| `src/styles/motion.css` | every motion rule on the site |
| `src/styles/mobile.css` | the entire mobile layer |
| `src/scripts/` | all motion JS (sky, scroll, reveals, flight paths, globe, constellation) |
| `src/assets/` | `space/` designer masters · `figma/` exports · `board/` headshots |
| `design/` | the design source of truth: Figma dump, per-page specs, 1:1 reference renders, and the [deviation log](design/README.md) |
| `scripts/` | the Figma + asset pipeline (see below) — everything in `design/` and `src/assets/figma/` is reproducible |
| `tests/fidelity/` | the visual diff suite |

[CLAUDE.md](CLAUDE.md) is the deep context document: the full history of the build, the motion
architecture and every hard-won gotcha. **Read it before changing layout or motion.**

## Verification — the part that matters

This project's quality bar is *measured, not eyeballed*. Two habits keep it:

**1. Fidelity.** `pnpm test:fidelity` renders each page at a 1001 px viewport (so 1 du = 1 px) and
pixel-diffs it against Figma's own export in `design/reference/`. Green means the page height matches the
Figma frame exactly and the mismatch is ~1 % (font antialiasing alone costs that much).

Deliberate differences from the Figma are **never** handled by loosening thresholds. They are either a
documented `HEIGHT_OVERRIDES` entry or a masked `IGNORE_RECTS` region in `tests/fidelity/visual.spec.ts`,
with a comment saying who decided and why, and a matching entry in `design/README.md`.

**2. Motion and mobile.** Numbers, not vibes. Write a throwaway Playwright probe (`scripts/_*.mjs`,
delete it after), measure the thing — frame times, scroll-driven progress, element boxes on an emulated
iPhone — and look at the screenshots. Claims like "it's smooth now" don't survive contact with a real
phone; measurements do.

## Motion

All motion is gated on `html.motion`, which is only set when the visitor hasn't asked for reduced
motion. **The static design is the rest state of every animation**, which is why the fidelity suite runs
with reduced motion and stays green.

Highlights: a canvas star field with meteors, a drifting saucer and a tumbling satellite; the wordmark's
rocket flying the length of the home page and docking on the footer mark; scroll-driven rockets on BUILD;
an ignition fuse on IGNITE; a live d3 globe; the "50" counter swarm and the 13-majors constellation.

Two rules learned the hard way, both load-bearing:
- Animate **transform and opacity** only. A large `filter: blur()` surface with `will-change` pins a
  composited layer the GPU re-blends every frame — that alone once capped the site at 29 fps *at idle*
  and cooked phones.
- Anything scroll-driven must be pinned to what **this** viewport can actually scroll
  (`src/scripts/build-flight.ts`), or the animation strands mid-flight on a window it wasn't tuned for.

## Mobile

Below 768 px the desktop artboard hides and every section renders a `.m` subtree that flows normally.
Same components, same data — one source of truth, no separate mobile site.

- `.m-art[data-aw]` wrappers re-anchor `--u` locally, so design-unit art (the swarm, planets, the stats
  discs, the flag) is **reused verbatim** at phone width.
- Ambient loops pause in any block more than a screen away (`.awake`, set by `src/scripts/mobile.ts`).
  Nothing animates where you can't see it — this is the main reason the site stays cool on a phone.
- Photo mosaics become snap-scrolling swipe strips; the BUILD timeline and IGNITE fuse become left rails
  with the rocket and spark riding named scroll timelines.

## The Figma pipeline

Everything in `design/` and `src/assets/figma/` is generated — never hand-edited.

```bash
cp .env.example .env          # then paste a Figma personal access token
pnpm figma:pull               # nodes + image fills + 1:1 reference renders
pnpm figma:spec               # flat, readable per-page specs → design/spec/<page>.txt
pnpm tsx scripts/figma-vectors-<page>.ts   # re-export that page's vectors/renders
```

The token needs **File content: read-only** scope. Figma tokens can expire — if a pull returns
`403 Token expired`, generate a new one (Figma → Settings → Security → Personal access tokens) and
prefer "No expiration".

Designer masters (~121 MB) live in the shared Drive folder *TL Website Assets*; drop it at the repo root
and run `pnpm assets` to regenerate `src/assets/space/`. Board headshots: drop `E-Board Photos/` at the
root and run `pnpm assets:board`. Both folders are gitignored — the optimized output is what's committed.

## Editing common things

- **Board members** — `src/content/board.json` (name, role, `photo` key, LinkedIn). Photos are
  `src/assets/board/<key>.jpg`, square, 400×400.
- **Copy** — in `src/content/` where it exists, otherwise in the section component's data array at the
  top of the file.
- **The APPLY destination** — `src/lib/links.ts` (`APPLY_HREF`). Every apply button on the site reads it.
- **The DEMO reel** — `src/assets/demo-stage.mp4` (desktop) and `demo-stage-mobile.mp4` (phones, served
  by a `<source media>` switch), with captions in `demo-stage.vtt`. Keep the mobile encode small: phones
  should never download the desktop master.

## Deployment

Hosted on **Vercel** as a static build (`pnpm build` → `dist/`). Production deploys from `main`.

```bash
npx vercel --prod --yes       # deploy the current working tree
```

To put the site on **troylabs.vc**: add the domain to the Vercel project, then paste the two DNS records
Vercel gives you into Name.com. No code change is needed — the site has no hardcoded origin.

## Conventions

- Commit messages are plain prose explaining *why*, in the imperative. No AI/assistant attribution.
- Ship small: verify → commit → deploy, one change at a time.
- Deliberate deviations from the Figma get a comment in the component **and** an entry in
  `design/README.md`. Future maintainers should never have to guess whether something is a bug.

## Open items

- IGNITE's five feature blurbs are still placeholder copy from the Figma (owed by the designer).
- `troylabs.vc` is registered and paid through Aug 2027 but still parked — it needs to be pointed here.

---

© 2026 TroyLabs. All rights reserved. This code is the property of USC TroyLabs and is not licensed for
outside use.
