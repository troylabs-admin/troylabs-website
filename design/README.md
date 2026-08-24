# Design source of truth

Figma: **Troylabs 2026** — https://www.figma.com/design/j8DBdVOGveHEj6OP3JEQwh/Troylabs-2026
Designer: Ellie Lin-Stevens. Website page: `[CURRENT] website redesign` (node `6747:6`).
Other pages in the file (`fall partnerships`, `fall tl`, decks, Instagram) are print/social collateral, not web.

| File | What |
|---|---|
| `figma.json` | REST dump of the website frames + style guide + components (`pnpm figma:pull`) — gitignored, regenerate |
| `spec/<page>.{json,txt}` | flattened node lists, coordinates relative to the page frame (`pnpm figma:spec`) |
| `reference/<page>@1x.png` | Figma's own 1:1 renders — fidelity baselines for `pnpm test:fidelity` |
| `figma-images/` | every image fill in the file, keyed by imageRef; `manifest.json` maps refs → nodes — gitignored, regenerate |

## Artboard facts
- All four pages are **1001 du wide**; the code scales by `--u` (see `CLAUDE.md`). There is **no mobile design** in Figma.
- Font in the page frames is **Helvetica** (the Style Guide's Clash Grotesk is not used by any page text node).
- Page background `#0a0a0a` with a Figma *noise* effect (reproduced as `.grain`).
- The Style Guide page is slide-format (1920×1080) and its text styles are not referenced by the pages.

## Page → frame → sections
Current iteration of each page is the frame in the top row of the canvas (older `Home` drafts exist to the left / below — ignore).

### Home — `7028:1508` (1001×5839)
| y (du) | Section | Component | Key nodes |
|---|---|---|---|
| 0–79 | Nav | `nav/Nav.astro` | `7033:2233` (component) |
| 79–600 | Hero | `sections/home/Hero.astro` | Frame 1 `7028:1528`, tl logo `7028:1529` |
| 600–900 | Mission | `Mission.astro` | Frame 2 `7028:1540` |
| 900–1900 | Our three initiatives | `Initiatives.astro` | planets `7028:1517` `7028:1575` `7028:1509` |
| 1900–3200 | Student catalyst (members / majors / divisions) | `Catalyst.astro` | Star 8 `7028:2092`, Frame 96–102 |
| 3200–4050 | Our members are part of | `Members.astro` | Group 3 `7028:1968` |
| 4050–5583 | Executive board | `Board.astro` + `content/board.json` | Frame 109 `7028:1997` |
| 5583–5839 | Footer | `nav/Footer.astro` | instance `7028:1965` |

### BUILD — `6977:9` (1001×5463) · DEMO — `6982:854` (1001×5705) · IGNITE — `6982:742` (1001×3332)
See the header comments in `src/components/sections/<page>/*.astro` and the `SECTIONS` bands in
`tests/fidelity/visual.spec.ts`.

## Known deviations / decisions
- **Scale**: the artboard fills the viewport width (1 du = 100vw/1001; at 1440 px body text is 17 px). Proportional, so nothing in the composition changes.
- **Decorative layers** (planets, stars, orbs, wordmark glow) use the designer's exported PNG masters rather than re-drawing the Figma vector effects; exact placement is measured against the 1:1 render.
- **Text wrapping**: +0.6 du width slack on text boxes (Figma ignores trailing letter-spacing when wrapping).
- **Placeholders kept as designed**: social/portal links without URLs (board photos and the DEMO investor/sponsor content have since landed).
- **Removed on purpose (2026-08-23, Bryan's call)**: BUILD "previous startups" — heading AND placeholder panel, section gone entirely (page 4279 du vs the frame's 5463; `HEIGHT_OVERRIDES` in the test); the green review scribbles (the designer's rocket-path notes — now used as the actual flight paths in the motion layer); and the stray colored ZhenFund logo.
- **2026-08-23 Figma update, small liberties**: DEMO's footer instance sits 15 du right of the canvas and overflows the frame by 16 du (IGNITE's sits 1 du left) — we render the shared footer whole and centered on every page and mask those footer bands in the fidelity diff; DEMO's full-bleed stage photo is drawn at x 1–1001 (1 du left sliver) and clipped 32 du at the bottom by its parent frame — reproduced exactly; IGNITE's photo strip frames (-1 and 500, 501 wide each) are rendered as an exact half-and-half 0–500.5–1001 split.
- **Canvas**: capped at `--page-max` (1440 px) and centered; glows/planets bleed into the margins over a full-viewport starfield backdrop (no hard artboard edge).

## Added beyond the Figma (2026-08-23, Bryan)
- **Home › Members**: live rotating globe (`src/scripts/globe.ts`, d3-geo orthographic + world-atlas land, her line-art style) replaces the static render when motion is on; company names replaced by monochrome wordmarks from Wikimedia Commons (`src/assets/logos/`, normalised to `currentColor`). Entrepreneurs First and 8VC have no vector available → styled text.
- **Home › Catalyst**: "13 majors" bubbles have cursor physics (`src/scripts/bubbles.ts`); connector lines follow.
- **Home › Initiatives**: a small moon orbits DEMO's ring (ellipse fitted to `blue-planet.png`).
- **BUILD**: both rockets fly the designer's drawn paths on scroll (timeline path + her green review curve).

## Open questions for the designer (everything below is also marked `TODO(designer)` in code)
1. **Home**: executive-board photos (all checkerboard); social URLs; Alumni portal URL.
2. **BUILD**: the green `#00ff37` scribbles (arrow + X in the timeline, curve to the planet) look like review annotations — reproduced 1:1, delete once confirmed; the "PREVIOUS STARTUPS" panel is "this section tbd?"; a stray colored ZhenFund logo sits under the white backer logos; footer instance is offset 4 du right with 23 du of empty frame below it; "APPLY TO BUILD" has no link target.
3. **DEMO**: where should the new "SPONSOR US" pill link? (mailto:troylabs@usc.edu for now); the full-width stage photo in Figma is literally a screenshot ("Screenshot 2026-08-22…", 1978×1104) — the original photo would be crisper at full width; "DEMO" title has a 0.1 du white stroke (not reproduced — sub-pixel).
4. **IGNITE**: all five feature blurbs are STILL the same placeholder copy after the update; the hand-drawn "ROCK… TOUR" logo — which company?; "APPLY TO IGNITE" has no link target.
5. Mobile layout (not designed) — a proposal will be made in code and logged here.
6. Is the `fall partnerships` page meant to become a web page (`/partners`)? Currently treated as print.

## Fidelity status (`pnpm test:fidelity`, 2026-08-23, post-update references)
home 1.17 % · build 1.03 % · demo 0.89 % · ignite 0.99 % mismatch vs Figma's 1:1 render; heights exact
(documented overrides: build −1184 previous-startups removal, home −150 board band, demo +16 footer overflow).

## 2026-08-23 Figma update (designer batch 2) — implemented
- **BUILD**: five timeline orbs recolored to gradients (re-exported); comet + star added mid-timeline; previous-startups removed (above).
- **DEMO**: full-bleed stage photo; stats planet grown to 689 du and stats moved below it; 6th keynote speaker (Tim Ellis, Relativity Space — images embedded in Figma); NOTABLE INVESTORS content (Draper, EF, M13, Republic, DormRoomFund, University Growth Fund); new PAST SPONSORS & PARTNERS section (14 logos); footer dome + SPONSOR US pill; page 3871 → 5705 du.
- **IGNITE**: intro rewrapped + dot dividers; two full-bleed photos (embedded in Figma at 4096px); speakers grid grown 8 → 12 logos (LinkedIn, Sony Pictures, Forbes 30u30, NBCUniversal new); hero planet resized; page 2543 → 3332 du.
- All new imagery came out of the Figma file itself (vector exports + embedded image fills) — nothing needed from the Drive.
