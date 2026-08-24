# TroyLabs website — full working context (plug-and-play)

Read this before touching anything. It carries the entire project context so a fresh session
(any Claude account) can continue exactly where the last one left off.

## What this is and how it got here
USC TroyLabs (student startup accelerator; Bryan Ramirez-Gonzalez, Head of Tech, is the client — direct,
fast feedback, expects verified work). The site is a **1:1 translation of the designer's Figma**
("Troylabs 2026" file, key `j8DBdVOGveHEj6OP3JEQwh`, page `[CURRENT] website redesign`, designer
Ellie Lin-Stevens), built in two phases:
1. **Fidelity phase** — pixel-faithful implementation of the 4 desktop pages (Home, BUILD, DEMO, IGNITE),
   verified by diffing against Figma's own renders (see Verification). Deviations are deliberate,
   logged in `design/README.md`.
2. **"Alive" phase** — motion layer on top (hero choreography, weighted scroll, canvas sky, planet
   atmospheres/parallax, scroll-driven rockets, live globe, constellation, page transitions), guided by
   2026 award-site practice: restraint, compositor-only properties, one hero effect per page.

Deployed: **https://troylabs.vercel.app** (project `troylabs` on Bryan's Vercel; deploy with
`npx vercel --prod --yes`). GitHub: `bryanrg22/troylabs-website` (private). Commits: plain messages,
no Co-Authored-By, never mention AI.

## Stack
Astro 7 (static) · Tailwind v4 (CSS-first, `src/styles/global.css`) · TypeScript · Lenis (smooth scroll)
· Motion's `inView` (reveals) · d3-geo + world-atlas (globe). No GSAP. `pnpm dev` · `pnpm build` ·
`pnpm test:fidelity`.

## Design units — the one rule that matters
Figma pages are drawn on a **1001 px-wide artboard**. Every number in the code is that Figma number
("design units", du). `--u` (set by a head script in BaseLayout from the *unzoomed* window width —
`outerWidth`, so browser zoom works — capped at `--page-max: 1440px`) converts du → px; `--un` is the
unitless twin. Never hardcode px; use `u(n)` / `pos(x,y,w,h)` from `src/lib/units.ts`. Numbers come from
`design/spec/<page>.txt` — never eyeball. `.section` = artboard strip (`--h` in du), children
`class="abs"` + `pos()` relative to the section top (`y(v) = v - TOP` per component).
- Text boxes get +0.6 du width slack (Figma ignores trailing letter-spacing when wrapping; Chrome doesn't).
- Colors via tokens in `global.css` or exact Figma hex with node id comment. Font: Helvetica as drawn
  (the Style Guide's Clash Grotesk is NOT used by the page frames — decided with Bryan).
- Type classes `.t-nav .t-body .t-title .t-hero …` encode measured Figma text styles (2-decimal metrics).

## Layout of the repo
```
src/pages/                 index, build, demo, ignite (+ pages/lab/members.astro = design lab, unlinked)
src/components/sections/<page>/   one file per design section, Figma node ids in header comments
src/components/nav|ui|space/      Nav+Footer · ApplyLink/PillButton · Stars/Glow/Planet (illustration layer)
src/scripts/               ALL motion JS (see Motion). src/styles/motion.css = all motion CSS.
src/content/               board.json etc (copy lives here, not in components)
design/                    spec/<page>.{json,txt} + reference/<page>@1x.png (Figma's 1:1 renders) + README.md
scripts/                   figma:pull / figma:spec / figma:vectors / assets (all reproducible; FIGMA_TOKEN in .env)
tests/fidelity/visual.spec.ts     the fidelity suite (see Verification)
```
Figma data path: REST API one-shot dump (Bryan has a View seat; Figma MCP read tools unavailable — don't
try them, use the scripts). `design/figma.json` + `design/figma-images/` are gitignored — regenerate with
`pnpm figma:pull`. Raw designer masters (121 MB) live in Google Drive "TL Website Assets"; drop the folder
at repo root and run `pnpm assets` to regenerate `src/assets/space/`.

## Motion system (all gated on `html.motion`, set only when prefers-reduced-motion allows)
The static design is the REST state of every animation; the fidelity suite runs reduced-motion and must stay green.
- `sky.ts` canvas star field (3 depth bins, twinkle, mouse `--mx/--my` parallax) + nebula divs; fewer stars on phones.
- `scroll.ts` Lenis (desktop pointers only) + `--scroll-v` velocity var (written only on change — root var
  writes trigger full-page style recalc; that was a measured perf bug).
- `motion.ts` reveal-on-enter: JS marks below-fold units `[data-reveal]`, Motion `inView` adds `.is-in`;
  stat numbers (`.t-stat`) count up. Art objects opt in via `data-reveal-unit`. Gotchas: IntersectionObserver
  sees clip-path-hidden elements as zero-area (observe the `figure` wrapper); entrance animations use
  `fill-mode: backwards` (a `both` fill pins `transform` and kills hover/parallax); `:where()` on
  hidden-state selectors so reveal rules can win.
- `flight.ts` **Home's hero effect**: the wordmark's own rocket (exported vector `wordmark-rocket-flat.svg`,
  filters stripped — SVG filters re-raster every frame) flies a page-long path and lands on the footer mark.
  Architecture (hard-won, do not regress): cruise is scroll-LOCKED (`p = target`); when target ≥ 0.88 it
  takes over and lands itself in 1.8 s ease-in-out, scroll-independent (this killed the "ending zoom");
  heading is slew-limited ≤5°/frame (`offset-rotate: auto` whips at tight curves — that was the invisible
  "teleport"); wordmark↔flyer hand-off is a progress-driven crossfade over the first 0.25 % of path (never
  a timed swap); the scroll→distance map is computed at runtime per viewport (45 %-viewport tracking
  blended 55/45 with arc-length-linear). `overflow-anchor: none` on html — Chrome picked the moving rocket
  as its scroll anchor (jitter feedback loop with Lenis).
- `transition.ts` rocket page transitions (launch → cross-fade → re-entry; skipped for same-page nav).
- `globe.ts` d3 orthographic globe in the designer's line-art style, 30 fps, spins faster with scroll
  velocity, PNG fallback when motion is off. Every company has an elbow leader line to a rim dot
  (auto-generated in `Members.astro`).
- `constellation.ts` "13 majors" = named stars tracing the TroyLabs rocket mark (ghost dashed outline +
  ~40 minor stars), slow drift, hover lights a star and its connections.
- `pointer.ts` cursor light on `[data-hover]` tiles (uses `--lx/--ly`; NEVER `--x/--y` — those are the
  .abs position vars) + magnetic pull on `.pill` / header `.apply`.
- BUILD page: two CSS scroll-driven rockets — the timeline path (`#build-timeline-path`, inside a raw-px
  `.flight` box scaled by `--un`; url() offset paths don't scale with viewBox) and the landing rocket that
  emerges from behind the stats planet (masked by its disc) and plants a waving TroyLabs flag.

## Verification (the discipline that earned trust — do not skip)
1. **Fidelity**: `pnpm test:fidelity` renders each page at a 1001 px viewport (1 du = 1 px) and pixel-diffs
   against `design/reference/<page>@1x.png`. Green = heights exact (BUILD has a documented
   `HEIGHT_OVERRIDES` entry) + mismatch ≈ 1 % (antialiasing). Deliberate deviations are masked via
   `IGNORE_RECTS` / green-annotation color detection — never by loosening thresholds.
2. **Motion**: numbers, not vibes. Throwaway Playwright probes (`scripts/_*.mjs`, delete after): full-scroll
   visibility sweeps (element on screen at every 2–3 % step), three-speed wheel simulations with per-frame
   velocity profiles (median cruise vs max at ending — the ending must stay ≤ ~3× cruise), crossfade
   opacity traces, filmstrip screenshot sheets composited with PIL and actually looked at.
3. Bryan reviews by scrolling like a human at several speeds. If you claim smooth, prove it at slow,
   medium and fast. If he reports something you can't reproduce, suspect mid-HMR state (he browses
   localhost while you edit) — verify on a hard reload of the deployed URL before arguing.

## Where things stand (2026-08-23)
- All four pages fidelity-verified; motion layer complete on Home + BUILD; deployed and shareable.
- **50 ACTIVE MEMBERS — decided (2026-08-24)**: Bryan picked the **counter swarm** ("50" numeral formed by
  50 of the designer's glow dots, hover scatters & reforms). Built into `sections/home/Catalyst.astro`
  (baked seeded layout, shares Stars.astro's dot glyph/twinkle so it pairs with the 13-majors constellation);
  starburst masked in the fidelity suite; `/lab/members` deleted.
- **IGNITE features redesigned (2026-08-24)**: "ignition fuse" — dotted fuse down the section, features
  alternating left/right, scroll-scrubbed spark ignites each node (Features.astro + motion.css; fidelity
  masks the whole band). DEMO may get a similar liveliness pass next — ask Bryan.
- **Not done**: mobile (<768 px) — deliberately last, after desktop sign-off; currently a scaled desktop.
- Perf is profiled light (idle ~4 %, scrolling ~12 % of one core; sky/globe pause off-screen and when hidden).
- **2026-08-23 Figma update (batch 2) implemented** across BUILD/DEMO/IGNITE: colorful timeline orbs +
  comet, previous-startups removed entirely, DEMO full-bleed photo / bigger stats planet / Tim Ellis /
  investors + sponsors + SPONSOR US dome, IGNITE dot dividers / photo strip / 12-logo speakers grid.
  New exports: scripts/figma-vectors-update.ts. DEMO is 5705 du, IGNITE 3332, BUILD page 4279 (override).
- **Designer (Ellie) owes**: IGNITE feature copy (still 5× the same placeholder), Threads/Substack/
  Alumni-portal URLs, SPONSOR US link target (mailto for now), the original DEMO stage photo (Figma embeds
  a 1978px screenshot), which company the hand-drawn "ROCK… TOUR" mark is, confirmation that Home frame
  `7028:1508` (the newest — the site follows it) is canonical vs the older people-grid draft.
- Full deviation log + designer questions: `design/README.md`.

## Working style that works with Bryan
Verify before claiming done — he checks, and he has been right every time he said something was off.
When he reports a feel problem, find the *mechanism* (the "ending zoom" was rotation whip + a
scroll-starved path tail, not "too fast"). Ship small: after each accepted change, `git push` and
`npx vercel --prod --yes`, then tell him what to look at. When he asks for options, build live candidates
and let him choose (that's what `/lab/members` is). He forgives bugs, not unverified claims.
