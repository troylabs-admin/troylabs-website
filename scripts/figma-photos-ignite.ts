/**
 * figma-photos-ignite — the IGNITE photo mosaic (2026-08-24 Figma update: the designer replaced the two
 * wide photos with the same eight-frame mosaic BUILD uses). Each frame is rendered at 3× its design box
 * so the crop Figma applies to the image fill is baked in, then converted to JPEG like build-photo-*.
 * Output: src/assets/figma/ignite-photo-<n>.jpg.   Run: pnpm tsx scripts/figma-photos-ignite.ts
 */
import { mkdir, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { renderNodes, download } from './lib/figma-api';

/* row 1 @1524, row 2 @1722 — each 198 du tall; numbering runs left→right, top row first */
const FRAMES: Record<string, string> = {
  'ignite-photo-1': '7153:4037', // Frame 127  @0,1524   300×198
  'ignite-photo-2': '7153:4044', // Frame 175  @300,1524 202×198
  'ignite-photo-3': '7153:4038', // Frame 170  @501,1524 300×198
  'ignite-photo-4': '7153:4040', // Frame 171  @801,1524 202×198
  'ignite-photo-5': '7153:4039', // Frame 131  @0,1722   202×198
  'ignite-photo-6': '7153:4041', // Frame 172  @202,1722 300×198
  'ignite-photo-7': '7153:4043', // Frame 174  @502,1722 202×198
  'ignite-photo-8': '7153:4042', // Frame 173  @703,1722 300×198
};

await mkdir('src/assets/figma', { recursive: true });
const png = await renderNodes(Object.values(FRAMES), 'png', 3);
for (const [name, id] of Object.entries(FRAMES)) {
  if (!png[id]) { console.warn('no render for', name, id); continue; }
  const tmp = `src/assets/figma/${name}.tmp.png`;
  await download(png[id], tmp);
  // JPEG at q82: these are photographs behind no transparency — a quarter of the PNG's weight
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', tmp, '--out', `src/assets/figma/${name}.jpg`], { stdio: 'ignore' });
  await unlink(tmp);
  console.log('photo', name);
}
