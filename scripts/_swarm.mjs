// throwaway: sample 50 deterministic points inside the "50" glyph (900 150px Helvetica, 300×160 canvas)
// exactly like the lab candidate, but seeded so the layout can be baked into Catalyst.astro. Delete after use.
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(() => {
  function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const cv = document.createElement('canvas'); cv.width = 300; cv.height = 160;
  const cx = cv.getContext('2d');
  cx.font = '900 150px Helvetica'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('50', 150, 85);
  const img = cx.getImageData(0, 0, 300, 160).data;
  const out = {};
  for (let seed = 1; seed < 400; seed++) {
    const r = rng(seed);
    const pts = [];
    for (let tries = 0; tries < 6000 && pts.length < 50; tries++) {
      const x = Math.floor(r() * 300), y = Math.floor(r() * 160);
      if (img[(y * 300 + x) * 4 + 3] > 128 && pts.every(([px, py]) => Math.hypot(px - x, py - y) > 13)) pts.push([x, y]);
    }
    if (pts.length === 50) { out[seed] = pts; if (Object.keys(out).length >= 3) break; }
  }
  return out;
});
for (const [seed, pts] of Object.entries(result)) {
  console.log(`seed ${seed}: [${pts.map(([x, y]) => `[${x},${y}]`).join(',')}]`);
}
await browser.close();
