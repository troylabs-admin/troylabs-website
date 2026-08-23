/**
 * figma-spec — flatten design/figma.json into per-page spec files.
 *
 *   design/spec/<page>.json   every node of the page frame with position RELATIVE to the
 *                             frame (design units = Figma px at 1001-wide), size, text
 *                             style, fills, opacity, effects. This is what components are
 *                             written from and what tests/fidelity measures against.
 *   design/spec/<page>.txt    human-readable outline of the same (easier to scan)
 *
 * Run: pnpm figma:spec   (after figma:pull)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { PAGES, EXTRA_NODES } from './lib/figma-api';

const tree = JSON.parse(readFileSync('design/figma.json', 'utf8'));
await mkdir('design/spec', { recursive: true });

const hex = (c: any) =>
  '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100; // text metrics need 2 decimals: ls 0.96 vs 1 changes wrapping

function fill(f: any) {
  if (f.visible === false) return null;
  if (f.type === 'SOLID') return { type: 'solid', color: hex(f.color), alpha: r1((f.opacity ?? 1) * (f.color.a ?? 1)) };
  if (f.type?.startsWith('GRADIENT'))
    return {
      type: f.type.toLowerCase(),
      handles: f.gradientHandlePositions?.map((p: any) => [r1(p.x), r1(p.y)]),
      stops: f.gradientStops.map((s: any) => ({ color: hex(s.color), alpha: r1(s.color.a), at: r1(s.position) })),
      opacity: f.opacity ?? 1,
    };
  if (f.type === 'IMAGE') return { type: 'image', ref: f.imageRef, scaleMode: f.scaleMode };
  return { type: f.type };
}

export type SpecNode = ReturnType<typeof flatten>[number];

function flatten(root: any) {
  const ox = root.absoluteBoundingBox.x, oy = root.absoluteBoundingBox.y;
  const out: any[] = [];
  const walk = (n: any, depth: number, parent: string | null) => {
    if (n.visible === false) return;
    const bb = n.absoluteBoundingBox ?? { x: ox, y: oy, width: 0, height: 0 };
    const node: any = {
      id: n.id, name: n.name, type: n.type, depth, parent,
      x: r1(bb.x - ox), y: r1(bb.y - oy), w: r1(bb.width), h: r1(bb.height),
    };
    if (n.opacity != null && n.opacity !== 1) node.opacity = r1(n.opacity);
    if (n.rotation) node.rotation = r1(n.rotation);
    if (n.cornerRadius) node.radius = n.cornerRadius;
    if (n.rectangleCornerRadii) node.radii = n.rectangleCornerRadii;
    const fills = (n.fills ?? []).map(fill).filter(Boolean);
    if (fills.length) node.fills = fills;
    const strokes = (n.strokes ?? []).map(fill).filter(Boolean);
    if (strokes.length) { node.strokes = strokes; node.strokeWeight = n.strokeWeight; node.strokeAlign = n.strokeAlign; }
    if (n.effects?.length) node.effects = n.effects.filter((e: any) => e.visible !== false).map((e: any) => ({
      type: e.type, radius: e.radius, color: e.color ? hex(e.color) : undefined, alpha: e.color ? r1(e.color.a) : undefined, offset: e.offset, spread: e.spread,
    }));
    if (n.layoutMode) node.layout = {
      mode: n.layoutMode, gap: n.itemSpacing, pad: [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft],
      primaryAlign: n.primaryAxisAlignItems, counterAlign: n.counterAxisAlignItems, wrap: n.layoutWrap,
    };
    if (n.type === 'TEXT') {
      const s = n.style ?? {};
      node.text = n.characters;
      node.font = {
        family: s.fontFamily, weight: s.fontWeight, size: r2(s.fontSize), lineHeight: r2(s.lineHeightPx),
        letterSpacing: r2(s.letterSpacing ?? 0), align: s.textAlignHorizontal, valign: s.textAlignVertical,
        italic: s.italic || /Oblique|Italic/.test(s.fontStyle ?? '') || undefined, case: s.textCase, decoration: s.textDecoration,
      };
      if (n.characterStyleOverrides?.length && n.styleOverrideTable) {
        // per-character overrides (e.g. colored words in the tagline, underlined links)
        node.overrides = Object.fromEntries(Object.entries(n.styleOverrideTable).map(([k, v]: any) => [k, {
          fills: (v.fills ?? []).map(fill).filter(Boolean), decoration: v.textDecoration, weight: v.fontWeight, size: v.fontSize,
        }]));
        node.overrideRuns = runs(n.characters, n.characterStyleOverrides);
      }
    }
    if (n.type === 'INSTANCE') node.component = n.componentId;
    out.push(node);
    for (const c of n.children ?? []) walk(c, depth + 1, n.id);
  };
  walk(root, 0, null);
  return out;
}

/** Compress per-character override ids into [styleId, text] runs. */
function runs(chars: string, ov: number[]) {
  const res: [number, string][] = [];
  for (let i = 0; i < chars.length; i++) {
    const id = ov[i] ?? 0;
    if (res.length && res[res.length - 1][0] === id) res[res.length - 1][1] += chars[i];
    else res.push([id, chars[i]]);
  }
  return res;
}

function outline(nodes: any[]) {
  return nodes.map((n) => {
    const pad = '  '.repeat(n.depth);
    let s = `${pad}${n.type.padEnd(9)} ${n.id.padEnd(12)} ${JSON.stringify(n.name).slice(0, 40).padEnd(42)} @${n.x},${n.y} ${n.w}×${n.h}`;
    if (n.text) s += `  ${n.font.size}px/${n.font.lineHeight} w${n.font.weight} ls${n.font.letterSpacing} ${n.font.align}  ${JSON.stringify(n.text).slice(0, 60)}`;
    if (n.fills?.[0]) s += `  fill:${n.fills[0].color ?? n.fills[0].type}${n.fills[0].alpha != null && n.fills[0].alpha !== 1 ? '@' + n.fills[0].alpha : ''}`;
    if (n.opacity != null) s += ` op:${n.opacity}`;
    if (n.effects) s += ` fx:${n.effects.map((e: any) => e.type + e.radius).join(',')}`;
    if (n.layout) s += ` [${n.layout.mode} gap${n.layout.gap}]`;
    return s;
  }).join('\n');
}

const all = { ...PAGES, ...Object.fromEntries(EXTRA_NODES.map((id) => [tree.nodes[id].document.name.replace(/\W+/g, '-').toLowerCase(), id])) };
for (const [name, id] of Object.entries(all)) {
  const nodes = flatten(tree.nodes[id].document);
  await writeFile(`design/spec/${name}.json`, JSON.stringify(nodes, null, 1));
  await writeFile(`design/spec/${name}.txt`, outline(nodes));
  console.log(`${name}: ${nodes.length} nodes`);
}
