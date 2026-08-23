/**
 * figma-vectors-ignite — export the IGNITE page's vector layers (the "NOTABLE SPEAKERS" logo unions,
 * Frame 154 / 6990:1205) as SVG into src/assets/figma/ignite-*.svg.
 * Run: pnpm tsx scripts/figma-vectors-ignite.ts   (needs FIGMA_TOKEN in .env)
 */
import { mkdir } from 'node:fs/promises';
import { renderNodes, download } from './lib/figma-api';

const SVG: Record<string, string> = {
  'ignite-logo-perplexity': '6990:1093',      // "Union" @247,1707 164.7×39.8
  'ignite-logo-type-one': '6990:1096',        // "Subtract" @541,1696 192×62.9 (Type One Ventures)
  'ignite-logo-summer-fridays': '6990:1136',  // "Union" @244,1828 169.4×51.8
  'ignite-logo-partiful': '6990:1168',        // "Union" @523,1828 228.7×62.5
  'ignite-logo-snap': '6990:1169',            // "Union" @236,1949 185.9×44.1 (Snap Inc.)
  'ignite-logo-rocket': '6990:1202',          // "Union" @570,1922 134.5×115 (hand-drawn "ROCK…" scribble)
  'ignite-logo-twitch': '6990:1187',          // "Subtract" @247,2057 164.8×54.9
  'ignite-logo-goodgirlsnacks': '6990:1171',  // "Union" @497,2062 280.2×43.5
};

await mkdir('src/assets/figma', { recursive: true });
const svg = await renderNodes(Object.values(SVG), 'svg');
for (const [name, id] of Object.entries(SVG)) {
  if (!svg[id]) { console.warn('no svg for', name, id); continue; }
  await download(svg[id], `src/assets/figma/${name}.svg`); console.log('svg', name);
}
