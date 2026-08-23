/**
 * optimize-assets — turn the designer's raw PNG masters (TL Website Assets/, 121 MB,
 * up to 13k px) into web-sized sources in src/assets/space/.
 *
 *  - trims transparent padding (the masters have huge empty canvases)
 *  - downsizes so the longest edge ≤ MAX (2× the largest size the design renders at 1440)
 *  - writes lossless PNG with alpha; Astro's <Image> generates AVIF/WebP variants at build
 *  - kebab-cases the names ("Star 1.png" → "star-1.png")
 *
 * Run: pnpm assets     (masters dir can be overridden: MASTERS=path pnpm assets)
 */
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const MASTERS = process.env.MASTERS ?? 'TL Website Assets';
const OUT = 'src/assets/space';
const MAX = 2048;
// byte-identical duplicates of Home/ files (verified by md5) — skip
const SKIP = new Set(['DEMO/Copy of blue-planet.png', 'IGNITE/Copy of yellow-planet.png', 'BUILD/orange-planet.png']);

sharp.cache(false);
await mkdir(OUT, { recursive: true });

for (const dir of await readdir(MASTERS)) {
  for (const file of await readdir(join(MASTERS, dir)).catch(() => [])) {
    if (extname(file).toLowerCase() !== '.png' || SKIP.has(`${dir}/${file}`)) continue;
    const name = basename(file, '.png').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const src = sharp(join(MASTERS, dir, file), { limitInputPixels: false });
    const trimmed = sharp(await src.trim({ threshold: 2 }).png().toBuffer(), { limitInputPixels: false });
    const m = await trimmed.metadata();
    const info = await trimmed
      .resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: false })
      .toFile(join(OUT, `${name}.png`));
    console.log(`${dir}/${file} → ${name}.png  trimmed ${m.width}×${m.height} → ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
  }
}
