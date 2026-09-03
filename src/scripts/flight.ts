/**
 * Home flight controller. Replaces CSS scroll-timeline keyframes with the industry "scrub with lag"
 * pattern (what GSAP ScrollTrigger's `scrub: 1` does): each frame the rocket CHASES a smoothed progress
 * toward the scroll-mapped target, so fast scrolling can never teleport it — it flies through every
 * intermediate point at a capped rate.
 *
 *  • mapping scroll → path distance is computed at runtime for the real viewport (rocket stays ~45% down
 *    the screen, launch eases over the first 6% of scroll, the landing hook resolves by 97%)
 *  • the wordmark's own rocket and the flyer CROSSFADE over the first 2% of flight — no swap moment
 *  • the timed landing is anchored to the FOOTER: it starts when the footer mark reaches the viewport's
 *    bottom edge (never earlier) and sets the rocket down exactly on the mark (class `landed` at p ≥ 0.9995)
 *  • clicking the docked rocket flies it home on its own bowed curve (mode `return`): banks right, swings
 *    back, rises dead-vertical into the wordmark; scroll glued to the rocket; distance-based dock crossfade
 */
const root = document.documentElement;

function buildMap(path: SVGPathElement, yToPage: (boxY: number) => number): [number, number][] {
  const L = path.getTotalLength();
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
    const pageY = yToPage(pt.y);
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
  // `landed` means "home's rocket is docked on the footer mark", and it is the ONLY thing that hides that
  // mark. It was cleared just once, inside the flight loop — which never runs on the other pages or on
  // phones — so any route where the class outlived a page change left BUILD/DEMO/IGNITE with an invisible
  // footer logo (Bryan saw exactly that on /build). Clearing it up front makes the state impossible to
  // inherit: every init that is not going to fly the rocket hands the mark back first.
  root.classList.remove('landed');
  const mobile = matchMedia('(max-width: 767px)').matches;
  // Mobile flight disabled (2026-08-24): the rAF scrub loop ran hot on phones. Bail before any work —
  // no rAF, no per-frame getPointAtLength — so mobile renders the static wordmark/footer rockets only.
  // The desktop flight below is untouched. Re-enable by deleting this early return (and the CSS gate).
  if (mobile) return;
  const flyer = document.querySelector<HTMLElement>(mobile ? '.m-flight .home-flyer' : '.home-flyer');
  const pathEl = document.querySelector<SVGPathElement>(mobile ? '#m-flight-path' : '#home-flight-path');
  const wmRocket = document.querySelector<SVGPathElement>(mobile ? '.m-wordmark path[fill^="url("]' : '.wordmark path[fill^="url("]');
  // The crossfade must animate the FILTERED GROUP's opacity, never the path inside it. The rocket sits
  // alone in <g filter=…> (its glow); opacity on a child changes the filter's INPUT, so Safari
  // re-rasterises the whole 406x438 filter region every frame — and intermittently rasterised it as a
  // solid black rectangle over the wordmark (WebKit compositing bug, seen at launch; Chrome unaffected).
  // Opacity on the filter's owner is applied post-filter at composite time: no re-raster, no black box.
  const wmFade: HTMLElement | SVGElement | null = (wmRocket?.closest('g[filter]') as SVGElement | null) ?? wmRocket;
  // NEVER animate opacity on that filtered group either. Chrome (152, Apple GPU) composites a filtered
  // SVG group with animated opacity as its own layer and draws the FILTER OUTPUT displaced from its
  // source — a glowing rocket floating up-left of the wordmark while the flat original stays in the A
  // (Bryan's Chrome, 2026-08-25: "two rockets"). So the wordmark rocket is now shown/hidden with
  // visibility, flipped at the crossfade's midpoint. The flyer keeps its smooth opacity ramp, and by
  // the midpoint it sits exactly on top of the A, so the hard flip underneath it cannot be seen.
  // No per-frame writes touch the filter's input (Safari's black square) or its layer (Chrome's ghost).
  let wmShown: boolean | null = null;
  const showWm = (on: boolean) => {
    if (!wmFade || wmShown === on) return;
    wmShown = on;
    (wmFade as HTMLElement).style.removeProperty('opacity');          // never leave an animated opacity behind
    (wmFade as HTMLElement).style.visibility = on ? '' : 'hidden';
  };
  const mark = document.querySelector<HTMLElement>(mobile ? 'footer .m-rocket' : 'footer .mark');
  if (!flyer || !pathEl || !mark || flyer.dataset.ready || !root.classList.contains('motion')) return;
  flyer.dataset.ready = '1';

  // ── geometry source: desktop (du, +79 header offset, --un scale) vs mobile (mdu, main-relative, --mun) ──
  const MOBILE_W = 390;
  // Desktop scale MUST be the layout's own --un (BaseLayout derives it from outerWidth so browser zoom
  // behaves like a normal site). Recomputing it here from innerWidth put the flight's dock point and path
  // box on a different scale than the rendered wordmark whenever zoom was not 100% (measured: at 125%
  // the A sits 146px right of where an innerWidth-based flight expects it).
  const cssUn = parseFloat(getComputedStyle(root).getPropertyValue('--un'));
  const un = mobile ? innerWidth / MOBILE_W : (Number.isFinite(cssUn) && cssUn > 0 ? cssUn : Math.min(innerWidth, 1440) / 1001);
  const main = document.querySelector('main');
  // mainTop must be re-measured, never frozen: at init the mobile layout is still settling (the nav pushes
  // main down ~71px after DCL), and a stale mainTop stranded every anchor +yToPage by exactly that drift.
  const mainTop = () => (mobile ? (main?.getBoundingClientRect().top ?? 0) + scrollY : 0);
  const yToPage = mobile ? (boxY: number) => mainTop() + boxY * un : (boxY: number) => (boxY + 79) * un;
  // The mobile flight box is a nominal 390-wide sketch (taller than the real content). Clamp it to main's
  // actual height so the layer never overhangs the footer and inflates the document (that overhang added
  // ~1.5k px of dead scroll and moved the dock). The footer mark anchor below targets the true dock point.
  if (mobile && main) {
    const realH = (main as HTMLElement).offsetHeight;
    const layer = flyer.closest<HTMLElement>('.m-flight');
    const inner = layer?.querySelector<HTMLElement>('.flight');
    const svg = layer?.querySelector('svg');
    if (layer) layer.style.height = `${realH}px`;
    if (inner) inner.style.height = `${realH}px`;
    if (svg) svg.setAttribute('height', String(realH));
  }

  // On mobile the authored path is a nominal 390-wide sketch: MEASURE the real wordmark-rocket and
  // footer-mark anchors and translate the path's endpoints so the flight always starts exactly in the
  // logo and lands exactly on the mark, whatever the live mobile layout does.
  let pathStart = pathEl.getPointAtLength(0);
  let pathEnd = pathEl.getPointAtLength(pathEl.getTotalLength());
  const anchor = () => {
    if (!mobile) return;
    const L = pathEl.getTotalLength();
    const s = pathEl.getPointAtLength(0), e = pathEl.getPointAtLength(L);
    const wr = wmRocket?.getBoundingClientRect();
    const sx = wr ? (wr.x + wr.width / 2) / un : s.x;
    const sy = wr ? (wr.y + scrollY + wr.height / 2 - mainTop()) / un : s.y;   // the rocket path's centre
    const mr = mark.getBoundingClientRect();
    const ex = (mr.x + mr.width / 2) / un;
    const ey = (mr.y + scrollY + mr.height / 2 - mainTop()) / un;              // the flyer rests nose-up ON the mark
    pathEl.setAttribute('d', pathEl.getAttribute('d')!.replace(/^M\s*-?[\d.]+[ ,]-?[\d.]+/, `M ${sx.toFixed(1)} ${sy.toFixed(1)}`));
    pathEl.setAttribute('d', pathEl.getAttribute('d')!.replace(/-?[\d.]+[ ,]-?[\d.]+\s*$/, `${ex.toFixed(1)} ${ey.toFixed(1)}`));
    pathStart = { x: sx, y: sy }; pathEnd = { x: ex, y: ey };
  };

  let map = buildMap(pathEl, yToPage);
  const totalLen = () => pathEl.getTotalLength();
  // The footer mark's page-y (px) — the landing is anchored to the FOOTER, not a path fraction.
  let markPageY = 0;
  const measure = () => {
    anchor();
    map = buildMap(pathEl, yToPage);
    const r = mark.getBoundingClientRect();
    markPageY = r.top + scrollY + r.height / 2;
  };
  measure();
  addEventListener('resize', measure, { passive: true });
  // the mobile footer sits after a tall image board: re-anchor once media/fonts have settled so the
  // dock lands on the mark's true resting place, not its pre-layout position
  if (mobile) {
    addEventListener('load', measure, { once: true });
    if (document.fonts?.ready) document.fonts.ready.then(measure);
    setTimeout(measure, 1200);
  }

  let p = 0, raf = 0, ang = 90;
  // Cruise is scroll-LOCKED (p = target — the feel of pure scrub). The timed landing begins only once the
  // user has actually brought the footer to the viewport's bottom edge (the "Members Only" column height):
  // the rocket then flies itself the last few percent of the path onto the mark in 1.8s (ease-in-out), so
  // the user never has to drag it in with scroll. Scrolling back up past the hysteresis returns control
  // with a short blend. If the user simply scrolls to the very bottom, scrub alone reaches the dock (t = 1).
  let mode: 'scrub' | 'landing' | 'return' = 'scrub';
  let landT0 = 0, landP0 = 0, blend = false, lastNow = 0;
  // Guided return: clicking the footer mark sends the rocket back up on its OWN direct line to the wordmark
  // (not the winding path in reverse) — 4.5 s, ease-in-out, nose-up the whole way, growing from footer-mark
  // size back to wordmark size. The scroll is driven in the same eased progress, so the rocket holds a
  // constant spot in the viewport while the page glides under it; the crossfade docks it into the logo.
  // Capture-phase click so the view-transition router never treats it as a navigation; wheel/touch aborts.
  const RET_MS = 4500;
  let retT0 = 0, retLen = 0, retViewY0 = 0;
  const retPath = document.querySelector<SVGPathElement>(mobile ? '#m-return-path' : '#home-return-path');
  const HOME = () => ({ x: pathStart.x, y: pathStart.y });   // the wordmark rocket's spot = the main path's (anchored) start
  const unPx = () => un;
  const endReturn = () => flyer.style.removeProperty('offset-path');
  mark.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (mode === 'return' || !retPath) return;
    const pt = pathEl.getPointAtLength(p * totalLen()); // lift off from wherever the rocket rests (normally the mark)
    const H = pt.y - HOME().y;
    // bow out over the right margin, then swing back and rise DEAD-VERTICAL into the wordmark (the final
    // control point sits straight below the logo, so the arrival tangent is exactly nose-up)
    retPath.setAttribute('d', `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)} C ${(pt.x + 250).toFixed(1)} ${(pt.y - H * 0.32).toFixed(1)}, ${HOME().x} ${(HOME().y + H * 0.25).toFixed(1)}, ${HOME().x} ${HOME().y}`);
    retLen = retPath.getTotalLength();
    retViewY0 = yToPage(pt.y) - scrollY;          // the rocket's viewport height at liftoff — held all ride
    flyer.style.offsetPath = `url(#${mobile ? 'm-return-path' : 'home-return-path'})`;
    root.classList.remove('landed');                     // the white mark returns as it lifts off
    mode = 'return';
    retT0 = performance.now();
  }, true);
  const abortReturn = () => {
    endReturn();
    mode = 'scrub';
    const ms = document.documentElement.scrollHeight - innerHeight;
    p = target(map, ms > 0 ? scrollY / ms : 0);          // snap back to scroll-lock (a wheel abort is mid-motion anyway)
  };
  addEventListener('wheel', () => { if (mode === 'return') abortReturn(); }, { passive: true });
  addEventListener('touchmove', () => { if (mode === 'return') abortReturn(); }, { passive: true });
  const tick = (now: number) => {
    if (dead) { raf = 0; return; }   // this page is gone: never write again
    const dt = Math.min(100, Math.max(0, now - (lastNow || now)));
    lastNow = now;
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    const t = Math.min(target(map, maxScroll > 0 ? scrollY / maxScroll : 0), 1);
    if (mode === 'return') {
      const r = Math.min(1, (now - retT0) / RET_MS);
      const e = r < 0.5 ? 4 * r * r * r : 1 - Math.pow(-2 * r + 2, 3) / 2;
      flyer.style.offsetDistance = `${(e * 100).toFixed(3)}%`;
      // the scroll is glued to the rocket: it holds its viewport height while the page glides under it
      const pt = retPath.getPointAtLength(e * retLen);
      window.scrollTo(0, yToPage(pt.y) - retViewY0);
      // bank through the curve: chase the return path's tangent (it arrives exactly vertical by construction)
      const a2 = retPath.getPointAtLength(Math.max(0, e - 0.004) * retLen), b2 = retPath.getPointAtLength(Math.min(1, e + 0.004) * retLen);
      const wantR = (Math.atan2(b2.y - a2.y, b2.x - a2.x) * 180) / Math.PI + 90;
      const dr = ((wantR - ang + 540) % 360) - 180;
      ang += Math.sign(dr) * Math.min(Math.abs(dr), 5);
      flyer.style.offsetRotate = `${ang.toFixed(2)}deg`;
      flyer.style.transform = `scale(${(0.712 + 0.288 * e).toFixed(4)})`;   // footer-mark size → wordmark size
      // dock: the wordmark's rocket appears only within the last ~10 px of travel — the flyer is already
      // on top of it by then, so there is never a premature double (a progress-based fade showed it ~300 px early)
      const k = Math.min(1, Math.max(0, 1 - ((1 - e) * retLen * unPx()) / 10));
      flyer.style.opacity = (1 - k).toFixed(3);
      showWm(k >= 0.1);                       // return flight: the A reappears while the flyer is still ~opaque on it
      if (r >= 1) { endReturn(); mode = 'scrub'; p = 0; }
      raf = requestAnimationFrame(tick);
      return;
    }
    const takeY = markPageY - innerHeight * 0.98;   // mark center enters at the viewport's bottom edge
    const backY = takeY - innerHeight * 0.3;        // hysteresis so the hand-off can't oscillate
    if (mode === 'scrub' && scrollY >= takeY) { mode = 'landing'; landT0 = now; landP0 = p; }
    else if (mode === 'landing' && scrollY < backY) { mode = 'scrub'; blend = true; }
    if (mode === 'landing') {
      const q = Math.min(1, (now - landT0) / 1800);
      const e = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
      p = landP0 + (1 - landP0) * e;
    } else if (blend) {
      // exponential re-lock (frame-rate independent, ~120ms time constant): after an aborted landing the
      // rocket peels off the mark and rides back WITH the scroll — a distance cap here once made the trip
      // home take ~4 s and left the wordmark without its rocket meanwhile
      p += (t - p) * (1 - Math.exp(-dt / 120));
      if (Math.abs(t - p) < 0.002) { p = t; blend = false; }
    } else {
      p = t;                                        // scroll-locked cruise
    }
    flyer.style.offsetDistance = `${(p * 100).toFixed(3)}%`;
    // slew-limited heading: offset-rotate:auto snaps around tight curves; chase the tangent at ≤5°/frame
    const Lp = totalLen();
    const a = pathEl.getPointAtLength(Math.max(0, p - 0.004) * Lp), b = pathEl.getPointAtLength(Math.min(1, p + 0.004) * Lp);
    const raw = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
    // landing flare: the footer mark is vertical, but the backward-looking tangent window still reads the
    // hook's diagonal at the very end (rests at 20.4°) — straighten to nose-up over the last 2% of the path
    const flare = Math.min(1, Math.max(0, (p - 0.98) / 0.02));
    const want = raw * (1 - flare * flare * (3 - 2 * flare));
    const diff = ((want - ang + 540) % 360) - 180;
    ang += Math.sign(diff) * Math.min(Math.abs(diff), 5);
    flyer.style.offsetRotate = `${ang.toFixed(2)}deg`;
    const scale = 1 - 0.288 * Math.min(1, Math.max(0, (p - 0.3) / 0.7));
    flyer.style.transform = `scale(${scale.toFixed(4)})`;
    // crossfade with the wordmark's rocket over the first sliver of flight — there is no "swap moment"
    const k = Math.min(1, p / 0.0025);
    flyer.style.opacity = k.toFixed(3);
    showWm(k < 0.9);                          // launch: the A yields only once the flyer is ~opaque on top of it (no brightness dip at the flip)
    // the white footer mark yields only once the orange rocket is truly on top of it — at 0.995 the hook
    // still has ~35 du to run, so hiding the mark there left a visible hole
    root.classList.toggle('landed', p >= 0.9995);


    // Rest when there is nothing to fly. In scrub mode with the scroll settled the rocket is parked, yet
    // this loop still ran at 60 fps writing five inline styles a frame — measured as the home page's
    // largest idle cost (2026-08-24). Park after a few still frames; any input or mode change wakes it.
    const still = mode === 'scrub' && !blend && Math.abs(p - lastP) < 1e-5 && scrollY === lastY;
    lastP = p; lastY = scrollY;
    if (document.hidden || (still && ++restFrames > 12)) { raf = 0; return; }
    if (!still) restFrames = 0;
    raf = requestAnimationFrame(tick);
  };
  let lastP = -1, lastY = -1, restFrames = 0, dead = false;
  const fly = () => { restFrames = 0; if (!raf && !document.hidden) raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
  for (const ev of ['scroll', 'wheel', 'touchmove', 'resize', 'keydown']) addEventListener(ev, fly, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fly(); });
  // Kill this page's flight loop on EVERY navigation, and make it unable to write anything afterwards.
  // This was `{ once: true }`, so only the first navigation ever stopped it: after that, home's loop kept
  // running as a zombie on BUILD/DEMO/IGNITE, and since it had parked at the landing (p = 1) it re-added
  // `landed` every frame — which is the one class that hides the footer logo. That is the intermittent
  // missing TroyLabs mark: it only survived if you navigated while the loop was still awake, since it
  // parks itself after 12 still frames (Bryan, 2026-08-24 — "missing from all three non-Home pages").
  const stop = () => {
    dead = true;
    cancelAnimationFrame(raf);
    raf = 0;
    root.classList.remove('landed');   // hand the footer mark back on the way out
    // Put the hero back to its REST state. A loop that stops mid-flight otherwise freezes the crossfade
    // half-done: the flyer stranded in the sky at full opacity while the wordmark's own rocket is still
    // solid in the A — two rockets on screen, which is exactly what was reported on desktop. Rest is
    // unambiguous: the mark lives in the wordmark, the flyer is invisible until scrolling starts.
    showWm(true);
    if (flyer) flyer.style.opacity = '0';
  };
  document.addEventListener('astro:before-swap', stop);
}
init();
document.addEventListener('astro:page-load', init);
