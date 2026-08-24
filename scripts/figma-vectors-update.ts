/**
 * figma-vectors-update — exports for the 2026-08-23 Figma update (DEMO investors + sponsors,
 * IGNITE speaker grid + photo strip, the shared comet streak, the DEMO footer dome, Tim Ellis card).
 * Output: src/assets/figma/<name>.<svg|png>.   Run: pnpm tsx scripts/figma-vectors-update.ts
 */
import { mkdir } from 'node:fs/promises';
import { renderNodes, download } from './lib/figma-api';

const SVG: Record<string, string> = {
  // DEMO › NOTABLE INVESTORS — "Frame 180" 7073:2940 @156,3028
  'demo-inv-draper': '7073:2789',      // Draper Associates 292.3×78.2 @228.3,3054.4
  'demo-inv-ef': '7074:2945',          // Entrepreneurs First (image 169 [Vectorized]) 186.6×90.9 @618.3,3055.4
  'demo-inv-m13': '7073:2793',         // M13 167.2×81.4 @227.9,3173.9
  'demo-inv-republic': '7073:2816',    // Republic 308.3×81.4 @496.8,3173.9
  'demo-inv-drf': '7073:2939',         // DormRoomFund 389.2×45 @227.9,3325.5
  'demo-inv-ugf': '7073:2904',         // University Growth Fund badge 112×125.3 @693.2,3284.6
  // DEMO › PAST SPONSORS & PARTNERS — "Frame 181" 7074:3693 @189,3787
  'demo-sp-lloyd-greif': '7074:3107',  // Lloyd Greif Center 288.6×65.5 @189,3796
  'demo-sp-type-one': '7074:3694',     // Type One Ventures 255×83.5 @567.2,3787
  'demo-sp-ms-startups': '7074:3190',  // Microsoft for Startups 252.4×96 @207.1,3939.4
  'demo-sp-superset': '7074:3205',     // super{set} 255.1×47.2 @567.2,3963.8
  'demo-sp-doorlist': '7074:3233',     // doorlist 288.6×75.9 @189,4104.4
  'demo-sp-rilla': '7074:3219',        // RILLA 296.4×57.5 @546.5,4113.6
  'demo-sp-violetx': '7074:3437',      // VIOLETX 288.6×52.1 @189,4253
  'demo-sp-ditto': '7074:3427',        // Ditto 187.8×59.6 @600.8,4249.2
  'demo-sp-framer': '7074:3672',       // Framer 288.6×77.9 @189,4377.7
  'demo-sp-zfellows': '7074:3475',     // Z Fellows 288.6×48.7 @550.4,4392.4
  'demo-sp-cocacola': '7074:3462',     // Coca-Cola 276.1×90.3 @195.2,4528.9
  'demo-sp-finalboss': '7074:3660',    // Final Boss Sour 187.8×99 @600.8,4524.6
  'demo-sp-monster': '7074:3571',      // Monster Energy 288.6×72.8 @189,4705.4
  'demo-sp-poppi': '7074:3582',        // poppi 276.6×98.5 @556.5,4692.5
  // IGNITE › NOTABLE SPEAKERS — "Frame 182" 7102:3836 @181,2140
  'ignite-sp-linkedin': '7104:4022',   // LinkedIn 249.6×63.6 @211.7,2187.6
  'ignite-sp-sony': '7104:4023',       // Sony Pictures 201.4×65.7 @563.8,2186.5
  'ignite-sp-rocket': '7102:3862',     // hand-drawn "ROCK…" mark 134.5×115 @269.2,2286.6
  'ignite-sp-perplexity': '6990:1093', // Perplexity 259.8×62.8 @534.6,2312.8
  'ignite-sp-summer-fridays': '7102:3848', // Summer Fridays 213×65.1 @230,2436.3
  'ignite-sp-twitch': '7102:3887',     // Twitch 229×76.2 @550,2430.8
  'ignite-sp-type-one': '7102:3906',   // Type One Ventures 253×82.9 @210,2552.2
  'ignite-sp-partiful': '7102:3837',   // Partiful 228.7×62.5 @550.1,2562.4
  'ignite-sp-goodgirlsnacks': '7102:3875', // goodgirlsnacks 255×39.6 @209,2698.6
  'ignite-sp-forbes': '7104:3994',     // Forbes 30 Under 30 119.6×117.3 @604.7,2659.8
  'ignite-sp-snap': '7102:3897',       // Snap Inc. 231×54.8 @221,2815.7
  'ignite-sp-nbcu': '7104:4009',       // NBCUniversal 281×32.8 @524,2826.7
};

const PNG3: Record<string, string> = {
  'comet-streak': '7073:2763',            // gradient comet "Ellipse 284" 142.6×113 — identical on BUILD @199,1213 and DEMO @73,1758
  'ignite-photo-1': '7102:3944',          // Frame 183 501×327 @-1,1541
  'ignite-photo-2': '7102:3945',          // Frame 184 501×327 @500,1541
};
// NOTE: Tim Ellis card images (7100:3789/3790) are NOT node-rendered — node renders bake the card's
// drop shadow + rounding into padded bounds. Both fills are plain FILL mode, so the raw image fills are
// copied straight from design/figma-images (see manifest refs 9e5a36f9…, 8fff1cd5…) like the other speakers.
const PNG2: Record<string, string> = {
  'demo-planet-footer': '7074:3760',      // Ellipse 286 930×930 @56,5039 — dark dome, blue inner-shadow rim light
};

await mkdir('src/assets/figma', { recursive: true });
const svg = await renderNodes(Object.values(SVG), 'svg');
for (const [name, id] of Object.entries(SVG)) {
  if (!svg[id]) { console.warn('no svg for', name, id); continue; }
  await download(svg[id], `src/assets/figma/${name}.svg`); console.log('svg', name);
}
for (const [scale, map] of [[3, PNG3], [2, PNG2]] as const) {
  const png = await renderNodes(Object.values(map), 'png', scale);
  for (const [name, id] of Object.entries(map)) {
    if (!png[id]) { console.warn('no png for', name, id); continue; }
    await download(png[id], `src/assets/figma/${name}.png`); console.log('png', name, `@${scale}x`);
  }
}
