import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

/** "Troylabs 2026" file — https://www.figma.com/design/j8DBdVOGveHEj6OP3JEQwh/Troylabs-2026 */
export const FILE_KEY = 'j8DBdVOGveHEj6OP3JEQwh';

/** Page frames on the "[CURRENT] website redesign" Figma page (the current iteration of each). */
export const PAGES = {
  home: '7028:1508',
  build: '6977:9',
  demo: '6982:854',
  ignite: '6982:742',
} as const;

/** Style guide frames + shared components we also cache. */
export const EXTRA_NODES = [
  '68:2', '73:35', '133:32', // Style Guide: palettes, typography
  '7033:2221', // APPLY TO TROYLABS button component set
  '7012:129', '7012:133', '7012:137', '7012:141', '7012:154', '7012:203', // startup logo bubbles
];

function token(): string {
  const env = process.env.FIGMA_TOKEN ?? readFileSync('.env', 'utf8').match(/FIGMA_TOKEN=(.+)/)?.[1]?.trim();
  if (!env) throw new Error('FIGMA_TOKEN missing — put it in .env (see .env.example)');
  return env;
}

export async function figma(path: string): Promise<any> {
  const res = await fetch(`https://api.figma.com${path}`, { headers: { 'X-Figma-Token': token() } });
  if (!res.ok) throw new Error(`Figma ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

export async function download(url: string, to: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} → ${res.status}`);
  await writeFile(to, Buffer.from(await res.arrayBuffer()));
}

/** Render arbitrary nodes (png/svg) — used for decorative vectors we can't get from the asset folder. */
export async function renderNodes(ids: string[], format: 'png' | 'svg', scale = 1): Promise<Record<string, string>> {
  const r = await figma(`/v1/images/${FILE_KEY}?ids=${ids.join(',')}&format=${format}&scale=${scale}`);
  return r.images;
}
