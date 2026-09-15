/** Numbers that move rather than jump — the home page's stat count-up (scripts/motion.ts), reused for the
 *  portal: same ease-out-expo, a little quicker since these change on every chip press. */
export const EASE = (p: number) => 1 - Math.pow(2, -10 * p);
export function tickNumber(el: HTMLElement, from: number, to: number, ms = 900, format: (n: number) => string = String) {
  const t0 = performance.now(); const prev = (el as any).__tick as number | undefined; if (prev) cancelAnimationFrame(prev);
  const frame = (t: number) => {
    const p = Math.min(1, (t - t0) / ms); el.textContent = format(Math.round(from + (to - from) * EASE(p)));
    (el as any).__tick = p < 1 ? requestAnimationFrame(frame) : undefined;
  };
  (el as any).__tick = requestAnimationFrame(frame);
}
