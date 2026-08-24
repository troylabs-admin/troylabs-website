# TroyLabs

The website for [USC TroyLabs](https://linktr.ee/TroyLabs), a student-run startup accelerator at the
University of Southern California.

**Live:** https://troylabs.vercel.app

## Getting started

```bash
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # static site in dist/
pnpm preview    # serve the built site locally
```

Requires Node 22 (see `.nvmrc`) and pnpm.

Built with [Astro](https://astro.build) and Tailwind CSS. The site is fully static — no server, no
database, no runtime framework.

## Project structure

```
src/
  pages/                 one file per route: index, build, demo, ignite, portal
  components/
    sections/<page>/     one component per section of a page
    nav/  ui/  space/    header and footer · buttons · illustrations (planets, stars)
  content/               site data — board members, and other copy
  styles/
    global.css           design tokens and the type scale
    motion.css           animation
    mobile.css           the mobile layout (under 768px)
  scripts/               small client-side scripts (starfield, scroll effects)
  assets/                images and video
  lib/                   shared helpers
public/                  files served as-is (favicon, robots.txt)
```

## Editing content

Most updates don't require touching layout code:

| To change | Edit |
|---|---|
| Executive board | `src/content/board.json` — add photos to `src/assets/board/<key>.jpg` (square, 400×400) |
| Where "Apply" links to | `src/lib/links.ts` |
| Section copy | the data array at the top of that section's component |
| The DEMO video | `src/assets/demo-stage.mp4` (desktop), `demo-stage-mobile.mp4` (phones), `demo-stage.vtt` (captions) |

## Layout notes

Desktop pages are laid out on a fixed 1001-wide design grid, scaled to the viewport by the `--u` CSS
variable. Positions come from the helpers in `src/lib/units.ts` rather than hardcoded pixels:

```astro
<div class="abs" style={pos(219, 2234, 567, 567)} />   <!-- x, y, width, height -->
```

Below 768px that grid is hidden and each section renders a mobile version instead, styled in
`src/styles/mobile.css`.

Animation lives in `src/styles/motion.css` and `src/scripts/`, and only runs when the visitor hasn't
enabled "reduce motion" — the static page is the resting state of every animation.

## Deployment

Deployed on [Vercel](https://vercel.com) from `main`. Every push builds automatically once the project
is connected; you can also deploy the current working tree directly:

```bash
npx vercel --prod
```

To use the `troylabs.vc` domain: add it to the Vercel project, then add the DNS records Vercel provides
at the domain registrar. No code changes are needed.

---

© 2026 TroyLabs. All rights reserved.
