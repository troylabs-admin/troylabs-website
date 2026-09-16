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

/** An unhurried scroll to an element: ease-in-out over `ms`, after an optional pause. Native smooth
 *  scrolling is a fling on iOS — "takes you down as fast as fuck" (Bryan, 2026-09-15) — and this is used
 *  after a star tap, where you need a beat to read the star and the line under the globe first. If the
 *  reader starts scrolling themselves during the pause or the glide, we stop and leave them alone. */
export function glideTo(el: HTMLElement, { after = 0, ms = 1500, offset = 0 } = {}) {
  let cancelled = false; const cancel = () => { cancelled = true; cleanup(); };
  const cleanup = () => { window.removeEventListener('wheel', cancel); window.removeEventListener('touchstart', cancel); window.removeEventListener('keydown', cancel); };
  window.addEventListener('wheel', cancel, { passive: true }); window.addEventListener('touchstart', cancel, { passive: true }); window.addEventListener('keydown', cancel);
  const start = () => {
    if (cancelled) return;
    const from = window.scrollY, to = Math.max(0, Math.min(from + el.getBoundingClientRect().top - offset, document.documentElement.scrollHeight - innerHeight)); const t0 = performance.now();
    const frame = (t: number) => {
      if (cancelled) return;
      const p = Math.min(1, (t - t0) / ms); const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;   // ease-in-out cubic
      window.scrollTo(0, from + (to - from) * e);
      if (p < 1) requestAnimationFrame(frame); else cleanup();
    };
    requestAnimationFrame(frame);
  };
  window.setTimeout(start, after);
  return cancel;
}
