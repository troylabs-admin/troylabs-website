/**
 * figma-vectors-demo — DEMO-page exports that aren't in the designer's asset folder.
 * Output: src/assets/figma/demo-*.png.   Run: pnpm tsx scripts/figma-vectors-demo.ts
 */
import { mkdir } from 'node:fs/promises';
import { renderNodes, download } from './lib/figma-api';

const PNG: Record<string, string> = {
  'demo-stats-planet': '7045:2727',   // "Ellipse 8" @253,976 496×496 — dark disc with blue inner shadows behind the stats row
};

await mkdir('src/assets/figma', { recursive: true });
const png = await renderNodes(Object.values(PNG), 'png', 3);
for (const [name, id] of Object.entries(PNG)) {
  if (!png[id]) { console.warn('no png for', name, id); continue; }
  await download(png[id], `src/assets/figma/${name}.png`); console.log('png', name);
}
