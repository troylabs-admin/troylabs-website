/**
 * Visual fidelity: render each page at a 1001px viewport (1 design unit = 1 px) and diff the
 * full-page screenshot against Figma's own 1:1 render in design/reference/<page>@1x.png.
 *
 * Output per page in test-results/fidelity/: <page>.actual.png, <page>.diff.png (red = mismatch),
 * and a per-section mismatch table in the console. Thresholds are deliberately tolerant —
 * font antialiasing alone costs ~2–3 % — the diff image is the thing to look at.
 *
 *   pnpm test:fidelity              all pages
 *   pnpm test:fidelity -g home      one page
 */
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const DESIGN_WIDTH = 1001;
const OUT = 'test-results/fidelity';

/** Section bands (du) — same boundaries the components use; for per-section reporting. */
const SECTIONS: Record<string, Record<string, [number, number]>> = {
  home: {
    nav: [0, 79], hero: [79, 600], mission: [600, 900], initiatives: [900, 1900], catalyst: [1900, 3200],
    members: [3200, 4050], board: [4050, 5433], footer: [5433, 5689],
  },
  build: { nav: [0, 79], hero: [79, 600], timeline: [600, 1778], gallery: [1778, 2174], stats: [2174, 2900], backers: [2900, 4000] }, // previous/footer bands dropped: placeholder panel removed (HEIGHT_OVERRIDES)
  demo: { nav: [0, 79], hero: [79, 560], intro: [560, 760], stage: [760, 1919], speakers: [1919, 2936], investors: [2936, 3695], sponsors: [3695, 5465], footer: [5465, 5705] },
  ignite: { nav: [0, 79], hero: [79, 560], intro: [560, 740], features: [740, 1520], photos: [1520, 1960], speakers: [1960, 3076], footer: [3076, 3332] },
};
const ROUTES: Record<string, string> = { home: '/', build: '/build', demo: '/demo', ignite: '/ignite' };

/** Deliberate deviations from the Figma frame height (documented in the section components). */
const HEIGHT_OVERRIDES: Record<string, number> = {
  build: 5463 - 1184, // "previous startups" section removed entirely (Bryan, 2026-08-23; see build.astro)
  home: 5839 - 150, // board→footer empty band shrunk 150 du (Bryan, 2026-08-23; see Board.astro)
  demo: 5705 + 16, // the Figma frame clips the footer instance's last 16 du (5465+256 > 5705); we render it whole
};

/** Reference regions we deliberately don't reproduce (du rects) — see the component comments. */
const IGNORE_RECTS: Record<string, [number, number, number, number][]> = {
  build: [[211, 3299, 431, 115], // stray colored ZhenFund logo (7041:2529)
          [600, 3515, 545, 545]], // backers: designer's textured orange planet + atmosphere replace Figma's flat disc (Bryan, 2026-08-23)
  // Home "members" company names → wordmark logos (decision 2026-08-23): the 12 text boxes, widened for the marks
  home: [[500, 2100, 400, 380], // "13 majors": Figma's glass orbs replaced by a constellation (decision 2026-08-23)
         [66, 2120, 470, 350], // "50 active members": Figma's starburst replaced by the counter swarm (Bryan, 2026-08-24)
         [385, 3319, 120, 38], [547, 3320, 162, 40], [668, 3403, 125, 38], [706, 3485, 201, 38], [761, 3570, 115, 38], [713, 3641, 110, 38],
         [178, 3704, 104, 38], [670, 3718, 106, 38], [182, 3773, 175, 38], [532, 3798, 244, 38], [346, 3812, 112, 38], [449, 3838, 109, 38],
         [127, 4168, 769, 1098], // board: real headshots replace the checkerboard placeholders (Bryan, 2026-08-23)
         [95, 5483, 140, 130]], // footer nav: current page's link omitted, top-nav order (Bryan, 2026-08-23)
  // DEMO footer: the whole instance sits 15 du right of the canvas in Figma (designer slack) — we render the
  // shared footer centered like every other page, so the whole band is masked (plus the usual nav-column deviation)
  demo: [[0, 5465, 1001, 240]],
  // IGNITE footer: same story, 1 du left in Figma — masked whole (plus the nav-column deviation)
  ignite: [[0, 3076, 1001, 256]],
};
/** The designer's bright-green (#00ff37) review scribbles are ignored wherever they appear in a reference. */
const isAnnotationGreen = (r: number, g: number, b: number) => g > 180 && r < 120 && b < 140;

/** pages still under construction may be shorter than the reference; compare the overlap only */
const MAX_MISMATCH = Number(process.env.FIDELITY_MAX ?? 0.12);

for (const [page, bands] of Object.entries(SECTIONS)) {
  test(`${page} matches Figma reference`, async ({ page: p }) => {
    const ref = PNG.sync.read(readFileSync(`design/reference/${page}@1x.png`));
    expect(ref.width, 'reference is a 1:1 render of the 1001-wide frame').toBe(DESIGN_WIDTH);

    await p.setViewportSize({ width: DESIGN_WIDTH, height: 900 });
    await p.emulateMedia({ reducedMotion: 'reduce' }); // motion layer off: the static design is the truth
    await p.goto(ROUTES[page], { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    expect(await p.evaluate(() => document.documentElement.classList.contains('motion')), 'motion layer must be off (reducedMotion: reduce)').toBe(false);
    // lazy-loaded images only fetch when scrolled into view: walk the page, then wait for all of them
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
      window.scrollTo(0, 0);
      // wait for rendered images only (display:none images never load) and never hang on a broken one
      const pending = [...document.images].filter((i) => !i.complete && i.getClientRects().length > 0);
      await Promise.race([Promise.all(pending.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))), new Promise((r) => setTimeout(r, 15000))]);
    });
    await p.addStyleTag({ content: '.grain::after{display:none}' }); // grain is random noise; exclude from diff
    // clip to the document box: unclipped decorative overflow (planets above/beside the artboard) would
    // otherwise enlarge Playwright's full-page capture and shift everything
    const docH = await p.evaluate(() => document.documentElement.scrollHeight);
    const shot = PNG.sync.read(await p.screenshot({ fullPage: true, animations: 'disabled', clip: { x: 0, y: 0, width: DESIGN_WIDTH, height: docH } }));

    const h = Math.min(shot.height, ref.height);
    const a = crop(shot, DESIGN_WIDTH, h), b = crop(ref, DESIGN_WIDTH, h);
    // neutralise ignored regions: copy the rendered pixels into the reference there
    for (let y = 0; y < h; y++) for (let x = 0; x < DESIGN_WIDTH; x++) {
      const i = (y * DESIGN_WIDTH + x) * 4;
      const inRect = (IGNORE_RECTS[page] ?? []).some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh);
      if (inRect || isAnnotationGreen(b.data[i], b.data[i + 1], b.data[i + 2])) { b.data[i] = a.data[i]; b.data[i + 1] = a.data[i + 1]; b.data[i + 2] = a.data[i + 2]; }
    }
    const diff = new PNG({ width: DESIGN_WIDTH, height: h });
    const bad = pixelmatch(a.data, b.data, diff.data, DESIGN_WIDTH, h, { threshold: 0.2, includeAA: true, alpha: 0.35 });

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/${page}.actual.png`, PNG.sync.write(shot));
    writeFileSync(`${OUT}/${page}.diff.png`, PNG.sync.write(diff));

    // per-section mismatch from the diff buffer (red pixels)
    const rows: string[] = [];
    for (const [name, [y0, y1]] of Object.entries(bands)) {
      const yEnd = Math.min(y1, h);
      if (y0 >= h) { rows.push(`${name.padEnd(12)} not rendered yet`); continue; }
      let n = 0;
      for (let y = y0; y < yEnd; y++) for (let x = 0; x < DESIGN_WIDTH; x++) {
        const i = (y * DESIGN_WIDTH + x) * 4;
        if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) n++;
      }
      rows.push(`${name.padEnd(12)} ${((100 * n) / (DESIGN_WIDTH * (yEnd - y0))).toFixed(2).padStart(6)} %`);
    }
    const total = bad / (DESIGN_WIDTH * h);
    console.log(`\n${page}: rendered ${shot.height}px vs reference ${ref.height}px · mismatch ${(100 * total).toFixed(2)} %\n  ${rows.join('\n  ')}\n  → ${OUT}/${page}.diff.png`);

    expect(shot.height, 'page height should equal the Figma frame height (or its documented override)').toBe(HEIGHT_OVERRIDES[page] ?? ref.height);
    expect(total).toBeLessThan(MAX_MISMATCH);
  });
}

function crop(img: PNG, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(img, out, 0, 0, w, h, 0, 0);
  return out;
}
