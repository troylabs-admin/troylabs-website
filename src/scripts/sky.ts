/**
 * Sky — the ambient layer behind every page: a canvas star field in three depth bins with per-star
 * twinkle, slow drift, and mouse + scroll parallax (deeper bins move less). Replaces the static tiled
 * starfield (body::before) when motion is on. Canvas 2D, DPR ≤ 2, ~450 stars, pauses when hidden.
 * Also publishes the lerped pointer as --mx / --my (−1…1) for CSS parallax elsewhere (planets).
 * Visitors (Bryan wants them APPARENT and BIG, 2026-08-24): shooting stars every ~7-15 s, the saucer
 * every ~10-22 s and a tumbling satellite every ~10-22 s, each 1.5-2.2× base size per flyby — line-art (same
 * 1px-white drawing language as the globe). Append ?skyfast to a URL to preview both without the wait.
 */
const root = document.documentElement;

/* the elements whose CSS reads --mx/--my (motion.css: planet parallax, star-layer drift, the swarm) */
let _para: HTMLElement[] | null = null;
/* the live sky's teardown. The canvas lives in <body>, and the ClientRouter swaps <body> on every
   navigation — so the old canvas vanished but its draw loop (a self-arming timer→rAF chain) and its
   resize/pointer/visibility listeners kept running against a detached canvas, and init() happily
   started another. Measured: 41 rAF/s on a fresh home, 387 rAF/s after eight navigations — nine star
   fields drawing at once. Every init now retires the previous loop first, and so does every swap. */
let teardown: (() => void) | null = null;
document.addEventListener('astro:before-swap', () => { teardown?.(); teardown = null; });
const paraEls = () => {
  if (_para) return _para;
  try {
    _para = [...document.querySelectorAll<HTMLElement>('.planet .parallax, .swarm, [data-figma] > div[aria-hidden="true"]:has(> .star)')];
  } catch {
    // no :has() in querySelectorAll (older engines): keep the planets and the swarm, skip the star layers.
    // Throwing here would have happened INSIDE the draw loop on the first mouse move and killed the sky.
    _para = [...document.querySelectorAll<HTMLElement>('.planet .parallax, .swarm')];
  }
  return _para;
};
document.addEventListener('astro:page-load', () => { _para = null; });

function init() {
  if (!root.classList.contains('motion')) return;
  if (document.querySelector('canvas.sky')) return;   // this page's sky is alive — keep it
  teardown?.(); teardown = null;                        // the body was swapped: retire the orphaned loop
  const ac = new AbortController(); const { signal } = ac; let dead = false;
  const canvas = document.createElement('canvas');
  canvas.className = 'sky';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  root.classList.add('sky-live');
  const ctx = canvas.getContext('2d')!;

  type Star = { x: number; y: number; r: number; a: number; phase: number; speed: number; bin: number; glyph: boolean };
  const BINS = [{ n: 260, r: [0.4, 0.9], px: 4, sy: 0.02, drift: 1.5 }, { n: 140, r: [0.8, 1.4], px: 10, sy: 0.05, drift: 3 }, { n: 50, r: [1.2, 2.0], px: 18, sy: 0.09, drift: 5 }];
  let W = 0, H = 0, dpr = 1, stars: Star[] = [];
  const rand = mulberry32(7);
  const seed = () => {
    stars = [];
    const density = W < 768 ? 0.4 : 1;    // phones: fewer stars, same look
    BINS.forEach((b, bin) => {
      for (let i = 0; i < Math.round(b.n * density); i++) stars.push({ x: rand() * W, y: rand() * H, r: b.r[0] + rand() * (b.r[1] - b.r[0]), a: 0.35 + rand() * 0.6, phase: rand() * Math.PI * 2, speed: 0.4 + rand() * 1.4, bin, glyph: bin === 2 && rand() < 0.35 });
    });
  };
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.25 : 2); W = innerWidth; H = innerHeight; // phones: fewer device pixels per frame
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!stars.length) seed();
  };
  resize(); addEventListener('resize', resize, { signal });

  // pointer, lerped
  let tx = 0, ty = 0, mx = 0, my = 0, pmx = 0, pmy = 0;
  // MICE ONLY. On touch screens a scroll gesture is a pointermove: the parallax followed the thumb and
  // then froze wherever the finger lifted, so the planets sat displaced (±depth px, up to 14) until the
  // next gesture — on BUILD that read as the flag hovering off its planet, since the flag is a sibling
  // of the parallax layer, not inside it (Bryan's screenshots, 2026-08-24). It also wrote ~20 element
  // styles per frame during every thumb-drag. Phones keep tx/ty at 0: planets pinned, flag planted.
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; tx = (e.clientX / W) * 2 - 1; ty = (e.clientY / H) * 2 - 1; }, { passive: true, signal });

  // ── visitors: shooting stars + (rarely) a little saucer. First saucer flyby comes while the page still
  //    has your attention; after that it's an easter egg. ?skyfast previews both immediately.
  const FAST = location.search.includes('skyfast');
  let meteor: { x: number; y: number; vx: number; vy: number; s0: number; dur: number } | null = null;
  let nextMeteor = FAST ? 1 : 1.5 + rand() * 1.5;   // first visitors arrive fast — nobody should miss them (Bryan)
  let ufo: { s0: number; dur: number; y: number; dir: 1 | -1; k: number } | null = null;
  let nextUfo = FAST ? 2 : 2 + rand() * 1.5;
  let sat: { s0: number; dur: number; y0: number; drift: number; dir: 1 | -1; spin: number; k: number } | null = null;
  let nextSat = FAST ? 4 : 3.5 + rand() * 2;

  // The sky renders at 30 fps. Measured: at 60 fps a star drifts 0.009-0.029 px per frame and its twinkle
  // alpha moves 0.0075 — every increment is far below one pixel or one perceptible step, so halving the
  // rate cannot be seen in the drift or the twinkle, and it halves the canvas's share of the main thread.
  // The pointer lerp is doubled to compensate exactly, so the parallax still settles in the same
  // wall-clock time rather than feeling sluggish (this is the part that WOULD have been noticeable).
  const PHONE = matchMedia('(max-width: 767px)').matches;
  const HALF = PHONE;                        // glyph stars stay simplified on phones
  // Frame-gate by TIME, not frame parity: on a 120 Hz display an every-other-frame skip still draws at
  // 60 fps and wakes the main thread 120×/s. Instead, after each drawn frame we arm the next callback
  // ~33 ms out via setTimeout→rAF, so the loop SCHEDULES at 30 fps on any refresh rate (it previously
  // scheduled at the full display rate: measured as the entire residual rAF cost of every page).
  // rAF still drives the actual draw, so frames stay vsync-aligned and never tear.
  // This gate is safe on phones in Low Power Mode: iOS throttles rAF to ~30 fps there, so frames already
  // arrive ≥33 ms apart and the gate is a no-op — the sky never freezes. Out of Low Power Mode phones run
  // the sky at full tilt (measured 120 fps on a 120 Hz emulator), which is the phone-heating loop Bryan
  // reported; gating them to 30 fps is the single biggest mobile thermal win on the site.
  let visible = !document.hidden, raf = 0, t0 = performance.now();
  const FRAME_MS = 33.4;
  let lastDraw = -Infinity, timer = 0;

  // On hide, drop whatever is pending; on return, cancel BOTH possible pending callbacks and re-arm
  // fresh. (`raf` holds a stale handle for most of each cycle — during the setTimeout wait — so gating
  // the re-arm on `!raf` deadlocks: hide during that window cleared the timer, and the stale handle
  // then blocks the restart forever. Measured: one tab switch froze the sky until reload.)
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (timer) { clearTimeout(timer); timer = 0; }
    if (visible) { lastDraw = -Infinity; cancelAnimationFrame(raf); raf = 0; arm(); }   // draw immediately on return
  }, { signal });

  function arm() {
    if (dead) { raf = 0; return; }
    if (!visible) { raf = 0; return; }
    const wait = Math.max(0, FRAME_MS - (performance.now() - lastDraw));
    timer = setTimeout(() => { timer = 0; raf = requestAnimationFrame(draw); }, wait) as unknown as number;
  }

  function draw(now: number) {
    if (dead) { raf = 0; return; }
    lastDraw = now;
    const t = (now - t0) / 1000;
    const lerp = 0.12;                       // both desktop and phone now draw at 30 fps — one step size keeps the same parallax settling time
    mx += (tx - mx) * lerp; my += (ty - my) * lerp;
    // Write the parallax vars on their CONSUMERS, never the root: a root custom-property write
    // invalidates style for the whole document, and Safari re-resolves every animated element each
    // time (the same recalc storm as --scroll-v — see scroll.ts). Each consumer sets the var on
    // itself, so a pointer move now invalidates ~20 subtrees instead of the entire page.
    if (Math.abs(mx - pmx) > 0.002 || Math.abs(my - pmy) > 0.002) {
      pmx = mx; pmy = my;
      const x = mx.toFixed(3), y = my.toFixed(3);
      for (const el of paraEls()) { el.style.setProperty('--mx', x); el.style.setProperty('--my', y); }
    }
    const sy = scrollY;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      const b = BINS[s.bin];
      const x = wrap(s.x + t * b.drift * 0.35 - mx * b.px, W);
      const y = wrap(s.y - sy * b.sy - my * b.px, H);
      const tw = 0.75 + 0.25 * Math.sin(t * s.speed + s.phase);
      ctx.globalAlpha = s.a * tw;
      if (s.glyph && !HALF) {
        // the designer's "*" glyph: three thin strokes
        ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-s.r * 2.2, 0); ctx.lineTo(s.r * 2.2, 0); ctx.stroke(); }
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // shooting star: a quick gradient streak, alpha enveloped so it blooms and dies
    if (!meteor && t > nextMeteor) {
      const dir = rand() < 0.5 ? -1 : 1;
      meteor = { x: W * (0.15 + rand() * 0.7), y: H * (0.05 + rand() * 0.35), vx: dir * W * (0.35 + rand() * 0.2), vy: W * (0.12 + rand() * 0.08), s0: t, dur: 0.7 + rand() * 0.4 };
    }
    if (meteor) {
      const p = (t - meteor.s0) / meteor.dur;
      if (p >= 1) { meteor = null; nextMeteor = t + (FAST ? 3 : 7 + rand() * 8); }
      else {
        const hx = meteor.x + meteor.vx * p, hy = meteor.y + meteor.vy * p;
        const nv = Math.hypot(meteor.vx, meteor.vy), ux = meteor.vx / nv, uy = meteor.vy / nv;
        const a = Math.sin(Math.PI * p) * 0.8, L = 110;
        const g = ctx.createLinearGradient(hx, hy, hx - ux * L, hy - uy * L);
        g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - ux * L, hy - uy * L); ctx.stroke();
        ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // the saucer: slow shallow drift with a gentle bob, running lights blinking out of phase
    if (!ufo && t > nextUfo) ufo = { s0: t, dur: 13 + rand() * 5, y: H * (0.08 + rand() * 0.3), dir: rand() < 0.5 ? 1 : -1, k: 1.5 + rand() * 0.7 };
    if (ufo) {
      const p = (t - ufo.s0) / ufo.dur;
      if (p >= 1) { ufo = null; nextUfo = t + (FAST ? 6 : 10 + rand() * 12); }
      else {
        const x = ufo.dir === 1 ? -60 + (W + 120) * p : W + 60 - (W + 120) * p;
        drawSaucer(ctx, x, ufo.y + 12 * Math.sin(t * 0.9), Math.sin(t * 1.3) * 0.06, t, ufo.k);
      }
    }
    // the satellite: a slow tumbling line-art bird crossing on a shallow diagonal
    if (!sat && t > nextSat) sat = { s0: t, dur: 17 + rand() * 7, y0: H * (0.06 + rand() * 0.45), drift: (rand() - 0.5) * H * 0.25, dir: rand() < 0.5 ? 1 : -1, spin: 0.5 + rand() * 0.6, k: 1.5 + rand() * 0.7 };
    if (sat) {
      const p = (t - sat.s0) / sat.dur;
      if (p >= 1) { sat = null; nextSat = t + (FAST ? 8 : 10 + rand() * 12); }
      else {
        const x = sat.dir === 1 ? -40 + (W + 80) * p : W + 40 - (W + 80) * p;
        drawSatellite(ctx, x, sat.y0 + sat.drift * p, t * 0.12 * sat.spin, sat.k);
      }
    }
    arm();
  }
  raf = requestAnimationFrame(draw);
  teardown = () => { dead = true; if (timer) { clearTimeout(timer); timer = 0; } cancelAnimationFrame(raf); raf = 0; ac.abort(); };
}

/* line-art flying saucer, ~42px wide: hull ellipse + dome arc + three blinking running lights */
function drawSaucer(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, t: number, k = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(k, k); ctx.lineWidth = 1 / k;
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(0, 0, 21, 6.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -4.5, 9, 7, 0, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = '#fff';
  for (let k = -1; k <= 1; k++) {
    ctx.globalAlpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4 + k * 2.1));
    ctx.beginPath(); ctx.arc(k * 9, 3.2, 1.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.restore();
}

/* line-art satellite, ~46px tip to tip: bus + truss + two 3-cell solar panels + antenna, tumbling slowly */
function drawSatellite(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, k = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(k, k);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1 / k; ctx.lineCap = 'round';
  ctx.strokeRect(-4.5, -3, 9, 6);                                     // bus
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(d * 4.5, 0); ctx.lineTo(d * 8, 0); ctx.stroke();   // truss
    ctx.strokeRect(d * 8 + (d === 1 ? 0 : -13), -3.5, 13, 7);                      // panel
    for (let k = 1; k < 3; k++) {                                                  // cell dividers
      const px = d * 8 + (d === 1 ? (13 * k) / 3 : -(13 * k) / 3);
      ctx.beginPath(); ctx.moveTo(px, -3.5); ctx.lineTo(px, 3.5); ctx.stroke();
    }
  }
  ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, -8); ctx.stroke();             // antenna
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(0, -9, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

const wrap = (v: number, m: number) => ((v % m) + m) % m;
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

init();
document.addEventListener('astro:page-load', init);
