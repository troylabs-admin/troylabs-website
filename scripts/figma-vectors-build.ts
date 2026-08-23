/**
 * figma-vectors-build — BUILD-page vector layers (logo unions, "[Vectorized]" logo frames, the green
 * annotation paths) as SVG, and effect-heavy groups (rockets, planets, timeline orbs) as PNG@3x.
 * Output: src/assets/figma/build-<name>.<svg|png>.   Run: pnpm tsx scripts/figma-vectors-build.ts
 */
import { mkdir } from 'node:fs/promises';
import { renderNodes, download } from './lib/figma-api';

const SVG: Record<string, string> = {
  'build-logo-techstars': '6982:717',     // Union 222.5×40.1 @148.5,2780.9
  'build-logo-sharktank': '6982:715',     // Union 122×97 @438.9,2752.5
  'build-logo-techcrunch': '6982:716',    // Union 223.8×32.3 @628.8,2784.8
  'build-logo-ef': '7041:2488',           // image 169 [Vectorized] 166×81 @195,3106 (Entrepreneurs First)
  'build-logo-collab': '7041:2507',       // image 170 [Vectorized] 396×50 @410,3115 (Collaborative Fund)
  'build-logo-zhenfund': '7041:2549',     // image 171 [Vectorized] 243×65 @195,3231
  'build-logo-hattrick': '7041:2569',     // image 172 [Vectorized] 269×83 @537,3213
  'build-logo-zhenfund-color': '7041:2529', // image 171 [Vectorized] 430.8×115 @211,3299 (stray colored duplicate)
  'build-green-path-a': '7040:2367',      // Vector 7  187.7×792.8 @715.8,719.5 (#00ff37 2px annotation)
  'build-green-arrow': '7040:2368',       // Vector 8  31.5×38.8 @751.7,1539.1
  'build-green-x': '7040:2369',           // Vector 9  36.8×22.3 @746.1,1545.4
  'build-green-path-b': '7042:2647',      // Vector 10 684.8×739.6 @99.4,3090.8
};
const PNG: Record<string, string> = {
  'build-rocket-a': '7040:2360',   // Group 2 150.1×158 @575,595
  'build-rocket-b': '7042:2637',   // Group 39628 173.4×170.3 @40,2906
  'build-planet-567': '6997:1320', // Ellipse 236 567 @219,2234 (inner shadows + drop shadow 92)
  'build-planet-393': '7042:2645', // Ellipse 259 393 @675,3590
  'build-orb-89': '6980:612', 'build-orb-115': '6980:622', 'build-orb-69': '6982:648', 'build-orb-92': '6982:650', 'build-orb-125': '6982:652',
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
