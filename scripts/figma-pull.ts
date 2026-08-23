/**
 * figma-pull — one-shot dump of the website design from Figma into design/.
 *
 * Uses the Figma REST API (works with a View seat; needs FIGMA_TOKEN in .env).
 *   design/figma.json            full node trees of the website pages + style guide
 *   design/figma-images/         every image fill used by those pages (+ manifest.json)
 *   design/reference/<page>@1x.png   1:1 renders of each page frame (fidelity baselines)
 *
 * Run:  pnpm figma:pull
 * Re-run whenever the designer changes the file. Commit the results.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { FILE_KEY, PAGES, EXTRA_NODES, figma, download } from './lib/figma-api';

const ids = [...Object.values(PAGES), ...EXTRA_NODES];

await mkdir('design/figma-images', { recursive: true });
await mkdir('design/reference', { recursive: true });

// 1. Node trees
const tree = await figma(`/v1/files/${FILE_KEY}/nodes?ids=${ids.join(',')}&geometry=paths`);
await writeFile('design/figma.json', JSON.stringify(tree));
console.log('wrote design/figma.json');

// 2. Image fills (photos, logos) referenced anywhere in those nodes
const fills = (await figma(`/v1/files/${FILE_KEY}/images`)).meta.images as Record<string, string>;
const manifest: Record<string, { file: string; uses: unknown[] }> = {};
const walk = (n: any, page: string) => {
  for (const f of n.fills ?? []) {
    if (f.type !== 'IMAGE') continue;
    const bb = n.absoluteBoundingBox ?? {};
    (manifest[f.imageRef] ??= { file: `design/figma-images/${f.imageRef}.png`, uses: [] }).uses.push({
      page, id: n.id, name: n.name, w: Math.round(bb.width), h: Math.round(bb.height),
    });
  }
  for (const c of n.children ?? []) walk(c, page);
};
for (const id of ids) walk(tree.nodes[id].document, tree.nodes[id].document.name);
for (const [ref, m] of Object.entries(manifest)) {
  if (!fills[ref]) { console.warn('no url for image fill', ref); continue; }
  if (!existsSync(m.file)) await download(fills[ref], m.file);
}
await writeFile('design/figma-images/manifest.json', JSON.stringify(manifest, null, 1));
console.log(`image fills: ${Object.keys(manifest).length}`);

// 3. 1:1 page renders
const pageIds = Object.values(PAGES).join(',');
const renders = await figma(`/v1/images/${FILE_KEY}?ids=${pageIds}&format=png&scale=1`);
for (const [name, id] of Object.entries(PAGES)) {
  await download(renders.images[id], `design/reference/${name}@1x.png`);
  console.log('rendered', name);
}
