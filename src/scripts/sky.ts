/**
 * Sky — the ambient layer behind every page: a canvas star field in three depth bins with per-star
 * twinkle, slow drift, and mouse + scroll parallax (deeper bins move less). Replaces the static tiled
 * starfield (body::before) when motion is on. Canvas 2D, DPR ≤ 2, ~450 stars, pauses when hidden.
 * Also publishes the lerped pointer as --mx / --my (−1…1) for CSS parallax elsewhere (planets).
 */
const root = document.documentElement;

function init() {
  if (!root.classList.contains('motion') || document.querySelector('canvas.sky')) return;
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
    const density = W < 768 ? 0.45 : 1;   // phones: fewer stars, same look
    BINS.forEach((b, bin) => {
      for (let i = 0; i < Math.round(b.n * density); i++) stars.push({ x: rand() * W, y: rand() * H, r: b.r[0] + rand() * (b.r[1] - b.r[0]), a: 0.35 + rand() * 0.6, phase: rand() * Math.PI * 2, speed: 0.4 + rand() * 1.4, bin, glyph: bin === 2 && rand() < 0.35 });
    });
  };
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!stars.length) seed();
  };
  resize(); addEventListener('resize', resize);

  // pointer, lerped
  let tx = 0, ty = 0, mx = 0, my = 0, pmx = 0, pmy = 0;
  addEventListener('pointermove', (e) => { tx = (e.clientX / W) * 2 - 1; ty = (e.clientY / H) * 2 - 1; }, { passive: true });

  let visible = !document.hidden, raf = 0, t0 = performance.now();
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible && !raf) raf = requestAnimationFrame(draw); });

  function draw(now: number) {
    const t = (now - t0) / 1000;
    mx += (tx - mx) * 0.06; my += (ty - my) * 0.06;
    // only touch the root vars when the pointer actually moved: every write recalcs styles for the whole page
    if (Math.abs(mx - pmx) > 0.002 || Math.abs(my - pmy) > 0.002) { pmx = mx; pmy = my; root.style.setProperty('--mx', mx.toFixed(3)); root.style.setProperty('--my', my.toFixed(3)); }
    const sy = scrollY;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      const b = BINS[s.bin];
      const x = wrap(s.x + t * b.drift * 0.35 - mx * b.px, W);
      const y = wrap(s.y - sy * b.sy - my * b.px, H);
      const tw = 0.75 + 0.25 * Math.sin(t * s.speed + s.phase);
      ctx.globalAlpha = s.a * tw;
      if (s.glyph) {
        // the designer's "*" glyph: three thin strokes
        ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-s.r * 2.2, 0); ctx.lineTo(s.r * 2.2, 0); ctx.stroke(); }
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    raf = visible ? requestAnimationFrame(draw) : 0;
  }
  raf = requestAnimationFrame(draw);
}

const wrap = (v: number, m: number) => ((v % m) + m) % m;
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

init();
document.addEventListener('astro:page-load', init);
