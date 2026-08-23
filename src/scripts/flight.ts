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
  // Two candidate mappings, blended:
  //  • s_track: the rocket rides ~45% down the viewport (guarantees visibility, but its speed varies with
  //    the path's arc-per-page-height ratio — the sole cause of the ending zoom)
  //  • s_arc: scroll proportional to arc length (constant speed by construction, may drift in the viewport)
  const N = 200;
  const frames: [number, number][] = [];
  const track: number[] = [], arc: number[] = [];
  let prev = path.getPointAtLength(0), acc = 0;
  for (let i = 0; i <= N; i++) {
    const dist = i / N;
    const pt = path.getPointAtLength(L * dist);
    acc += Math.hypot(pt.x - prev.x, pt.y - prev.y); prev = pt;
    arc.push(acc);
    const pageY = (pt.y + 79) * un;
    let s = Math.min(1, Math.max(0, (pageY - innerHeight * 0.45) / maxScroll));
    for (let k = 0; k < 6; k++) {
      const frac = 0.45 + 0.43 * Math.min(1, Math.max(0, (s - 0.78) / 0.22));
      s = Math.min(1, Math.max(0, (pageY - innerHeight * frac) / maxScroll));
    }
    track.push(s);
  }
  const S0 = 0.06, S1 = 0.985;                       // launch ends / dock lands
  for (let i = 0; i <= N; i++) {
    const dist = i / N;
    const sArc = S0 + (arc[i] / acc) * (S1 - S0);
    const w = 0.55;                                  // arc weight: raise for steadier speed, lower for tighter tracking
    let s = w * sArc + (1 - w) * Math.min(track[i], S1);
    frames.push([s, dist]);
  }
  let lastZero = 0;
  for (let i = 0; i < frames.length; i++) if (frames[i][1] === 0 || frames[i][0] <= 0.001) lastZero = Math.max(lastZero, frames[i][0] <= 0.001 ? i : 0);
  for (let i = 0; i <= lastZero; i++) frames[i][0] = Math.min(frames[i][0], 0.06 * Math.sqrt(i / Math.max(1, lastZero)));
  for (let i = 1; i < frames.length; i++) frames[i][0] = Math.max(frames[i][0], frames[i - 1][0] + 0.0004);
  const over = frames[frames.length - 1][0];
  if (over > 1) for (const f of frames) f[0] = f[0] / over;
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
  const totalLen = () => pathEl.getTotalLength();
  addEventListener('resize', () => { map = buildMap(pathEl); }, { passive: true });

  let p = 0, raf = 0, ang = 90;
  // Cruise is scroll-LOCKED (p = target — the feel of pure scrub). When the target passes TAKE (the rocket
  // is above the footer), the rocket takes over and flies itself to the mark in 1.8s (ease-in-out) — the
  // user never has to drag it in with scroll. Scrolling back above BACK returns control with a short blend.
  const TAKE = 0.88, BACK = 0.84;
  let mode: 'scrub' | 'landing' = 'scrub';
  let landT0 = 0, landP0 = 0, blend = false;
  const tick = (now: number) => {
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    const t = Math.min(target(map, maxScroll > 0 ? scrollY / maxScroll : 0), 0.995);
    if (mode === 'scrub' && t >= TAKE) { mode = 'landing'; landT0 = now; landP0 = p; }
    else if (mode === 'landing' && t < BACK) { mode = 'scrub'; blend = true; }
    if (mode === 'landing') {
      const q = Math.min(1, (now - landT0) / 1800);
      const e = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
      p = landP0 + (1 - landP0) * e;
    } else if (blend) {
      p += (t - p) * 0.22;                          // brief ease back into scroll-lock after an aborted landing
      if (Math.abs(t - p) < 0.002) { p = t; blend = false; }
    } else {
      p = t;                                        // scroll-locked cruise
    }
    flyer.style.offsetDistance = `${(p * 100).toFixed(3)}%`;
    // slew-limited heading: offset-rotate:auto snaps around tight curves; chase the tangent at ≤5°/frame
    const Lp = totalLen();
    const a = pathEl.getPointAtLength(Math.max(0, p - 0.004) * Lp), b = pathEl.getPointAtLength(Math.min(1, p + 0.004) * Lp);
    const want = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
    const diff = ((want - ang + 540) % 360) - 180;
    ang += Math.sign(diff) * Math.min(Math.abs(diff), 5);
    flyer.style.offsetRotate = `${ang.toFixed(2)}deg`;
    const scale = 1 - 0.288 * Math.min(1, Math.max(0, (p - 0.3) / 0.7));
    flyer.style.transform = `scale(${scale.toFixed(4)})`;
    // crossfade with the wordmark's rocket over the first sliver of flight — there is no "swap moment"
    const k = Math.min(1, p / 0.0025);
    flyer.style.opacity = k.toFixed(3);
    if (wmRocket) wmRocket.style.opacity = (1 - k).toFixed(3);
    root.classList.toggle('landed', p >= 0.995);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  document.addEventListener('astro:before-swap', () => cancelAnimationFrame(raf), { once: true });
}
init();
document.addEventListener('astro:page-load', init);
