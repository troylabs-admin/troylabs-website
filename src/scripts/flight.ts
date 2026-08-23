/**
 * Home flight controller. Replaces CSS scroll-timeline keyframes with the industry "scrub with lag"
 * pattern (what GSAP ScrollTrigger's `scrub: 1` does): each frame the rocket CHASES a smoothed progress
 * toward the scroll-mapped target, so fast scrolling can never teleport it — it flies through every
 * intermediate point at a capped rate.
 *
 *  • mapping scroll → path distance is computed at runtime for the real viewport (rocket stays ~45% down
 *    the screen, launch eases over the first 6% of scroll, the landing hook resolves by 97%)
 *  • the wordmark's own rocket and the flyer CROSSFADE over the first 2% of flight — no swap moment
 *  • lands (class `landed`) when progress ≥ 99%; scale eases from wordmark size to footer-mark size
 */
const root = document.documentElement;

function buildMap(path: SVGPathElement): [number, number][] {
  const L = path.getTotalLength();
  const un = Math.min(innerWidth, 1440) / 1001;
  const maxScroll = document.documentElement.scrollHeight - innerHeight;
  const frames: [number, number][] = [];
  for (let i = 0; i <= 150; i++) {
    const dist = i / 150;
    const pt = path.getPointAtLength(L * dist);
    const pageY = (pt.y + 79) * un;
    frames.push([Math.min(maxScroll, Math.max(0, pageY - innerHeight * 0.45)) / maxScroll, dist]);
  }
  let lastZero = 0;
  for (let i = 0; i < frames.length; i++) if (frames[i][0] <= 0.001) lastZero = i;
  for (let i = 0; i <= lastZero; i++) frames[i][0] = 0.06 * Math.sqrt(i / lastZero);
  const HOOK = 0.9;
  const iH = frames.findIndex((f) => f[1] >= HOOK);
  const sH = Math.min(frames[iH][0], 0.955);
  for (let i = iH; i < frames.length; i++) frames[i][0] = sH + (frames[i][1] - HOOK) / (1 - HOOK) * (0.97 - sH);
  for (let i = 1; i < frames.length; i++) frames[i][0] = Math.max(frames[i][0], frames[i - 1][0] + 0.0004);
  frames[frames.length - 1][0] = Math.min(frames[frames.length - 1][0], 0.999);
  frames.push([1, 1]);
  return frames;
}

function target(map: [number, number][], s: number): number {
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  let lo = 0, hi = map.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; (map[mid][0] <= s ? (lo = mid) : (hi = mid)); }
  const [s0, d0] = map[lo], [s1, d1] = map[hi];
  return d0 + ((s - s0) / Math.max(s1 - s0, 1e-6)) * (d1 - d0);
}

function init() {
  const flyer = document.querySelector<HTMLElement>('.home-flyer');
  const pathEl = document.querySelector<SVGPathElement>('#home-flight-path');
  const wmRocket = document.querySelector<SVGPathElement>('.wordmark path[fill^="url("]');
  if (!flyer || !pathEl || flyer.dataset.ready || !root.classList.contains('motion')) return;
  flyer.dataset.ready = '1';

  let map = buildMap(pathEl);
  addEventListener('resize', () => { map = buildMap(pathEl); }, { passive: true });

  let p = 0, raf = 0;
  const tick = () => {
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    const t = target(map, maxScroll > 0 ? scrollY / maxScroll : 0);
    // chase: never jump — 9%/frame toward the target reads as flight, not teleport
    p += (t - p) * 0.09;
    if (Math.abs(t - p) < 0.0004) p = t;
    flyer.style.offsetDistance = `${(p * 100).toFixed(3)}%`;
    const scale = 1 - 0.288 * Math.min(1, Math.max(0, (p - 0.3) / 0.7));
    flyer.style.transform = `scale(${scale.toFixed(4)})`;
    // crossfade with the wordmark's rocket over the first 2% of flight — there is no "swap moment"
    const k = Math.min(1, p / 0.02);
    flyer.style.opacity = k.toFixed(3);
    if (wmRocket) wmRocket.style.opacity = (1 - k).toFixed(3);
    root.classList.toggle('landed', p >= 0.99);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  document.addEventListener('astro:before-swap', () => cancelAnimationFrame(raf), { once: true });
}
init();
document.addEventListener('astro:page-load', init);
