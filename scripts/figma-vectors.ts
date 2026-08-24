/**
 * figma-vectors — export the handful of vector layers that aren't in the designer's asset
 * folder (wordmark letters, icons, logos) as SVG, and effect-heavy groups as PNG@3x.
 * Output: src/assets/figma/<name>.<svg|png>.   Run: pnpm figma:vectors
 */
import { mkdir } from 'node:fs/promises';
import { renderNodes, download } from './lib/figma-api';

const SVG: Record<string, string> = {
  'tl-wordmark': '7028:1529',          // Home hero "tl logo" group (letters + gradient rocket)
  'nav-rocket': '7028:1523',           // nav logo mark
  'glyph-star': '7028:1534',           // the "*" star-field glyph
  'footer-rocket': 'I7028:1965;6969:8169',
  'icon-threads': 'I7028:1965;7019:28',
  'icon-substack': 'I7028:1965;7019:33',
  'logo-google': '7040:2289',      // "Union" 48×16 @282,3360
  'logo-anthropic': '7040:2303',   // "Union" 105×11 @178,3432
  'logo-sony': '7040:2331',        // "Union" 68×22 @126,3555 (Sony Pictures)
  'logo-apple': '7040:2340',       // "Union" 70×23 @163,3608
};
const PNG: Record<string, string> = {
  'globe': '7028:1968',                // Group 3 — vectorized earth with inner shadows
  // 'starburst' (7028:2092) no longer exported — replaced by the counter swarm in Catalyst.astro (2026-08-24)
};

await mkdir('src/assets/figma', { recursive: true });
const svg = await renderNodes(Object.values(SVG), 'svg');
for (const [name, id] of Object.entries(SVG)) {
  if (!svg[id]) { console.warn('no svg for', name, id); continue; }
  await download(svg[id], `src/assets/figma/${name}.svg`); console.log('svg', name);
}
const png = await renderNodes(Object.values(PNG), 'png', 3);
for (const [name, id] of Object.entries(PNG)) {
  if (!png[id]) { console.warn('no png for', name, id); continue; }
  await download(png[id], `src/assets/figma/${name}.png`); console.log('png', name);
}
