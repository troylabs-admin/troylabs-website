/**
 * Design-unit helpers. All numbers are Figma design units (du) on the 1001-wide artboard;
 * CSS converts them with --u (see src/styles/global.css).
 */

/** `u(12)` → `calc(12 * var(--u))` for inline styles. */
export const u = (n: number) => `calc(${n} * var(--u))`;

/**
 * Inline style for an art-directed element: position (and optionally size) in du,
 * relative to the enclosing `.section`. Use with class="abs".
 *   <div class="abs" style={pos(58, 120, 886, 406)} />
 */
export function pos(x: number, y: number, w?: number, h?: number): string {
  let s = `--x:${x};--y:${y}`;
  if (w != null) s += `;--w:${w}`;
  if (h != null) s += `;--h:${h}`;
  return s;
}

/** Size-only (for flow elements that must keep a design size). */
export const size = (w: number, h?: number) =>
  `width:${u(w)}${h != null ? `;height:${u(h)}` : ''}`;
