/**
 * optimize-board — turn the raw e-board headshots ("E-Board Photos/", first-name files, gitignored —
 * masters stay off the repo like the other raw assets) into web-sized sources in src/assets/board/.
 *
 *  - applies EXIF orientation (phone photos), NO alpha trim (these are full-bleed photos)
 *  - downsizes so the longest edge ≤ 512 (cards render at 145 du ≈ 209 px @1440, 2× headroom)
 *  - writes JPEG q88 (mozjpeg); aspect preserved — the card's object-cover does the square crop
 *
 * Run: pnpm assets:board     (source dir can be overridden: PHOTOS=path pnpm assets:board)
 */
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const PHOTOS = process.env.PHOTOS ?? 'E-Board Photos';
const OUT = 'src/assets/board';
const MAX = 512;

sharp.cache(false);
await mkdir(OUT, { recursive: true });

for (const file of await readdir(PHOTOS)) {
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extname(file).toLowerCase())) continue;
  const name = basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const info = await sharp(join(PHOTOS, file))
    .rotate() // EXIF orientation
    .resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(join(OUT, `${name}.jpg`));
  console.log(`${file} → ${name}.jpg  ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
}
