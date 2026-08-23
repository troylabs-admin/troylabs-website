/**
 * "13 majors" constellation: each star drifts on its own slow orbit (sin/cos, different periods), the lines follow
 * their stars every frame, and hovering/focusing a star brightens it and its connections. Motion-gated, paused off-screen.
 * Replaces the earlier bubble physics (removed 2026-08-23).
 */
const root = document.documentElement;

function init() {
  const svg = document.querySelector<SVGSVGElement>('[data-constellation]');
  if (!svg || svg.dataset.ready) return;
  svg.dataset.ready = '1';
  const nodes = [...svg.querySelectorAll<SVGGElement>('.node')];
  const lines = [...svg.querySelectorAll<SVGLineElement>('line')];
  const base = nodes.map((g) => ({ x: parseFloat(g.style.getPropertyValue('--nx')), y: parseFloat(g.style.getPropertyValue('--ny')) }));
  const edge = lines.map((l) => l.dataset.edge!.split('-').map(Number) as [number, number]);

  // hover: light the star and its edges
  nodes.forEach((g, i) => {
    const on = () => { g.classList.add('lit'); lines.forEach((l, k) => { if (edge[k].includes(i)) l.classList.add('lit'); }); };
    const off = () => { g.classList.remove('lit'); lines.forEach((l) => l.classList.remove('lit')); };
    g.addEventListener('pointerenter', on); g.addEventListener('pointerleave', off); g.addEventListener('focus', on); g.addEventListener('blur', off);
  });

  if (!root.classList.contains('motion')) return;
  const phase = nodes.map((_, i) => i * 1.7), period = nodes.map((_, i) => 9 + (i * 3.1) % 7);
  let visible = false, raf = 0;
  const tick = (t: number) => {
    const s = t / 1000;
    const pos = base.map((b, i) => ({ x: b.x + Math.sin(s / period[i] * 2 * Math.PI + phase[i]) * 4, y: b.y + Math.cos(s / (period[i] * 1.3) * 2 * Math.PI + phase[i]) * 3 }));
    nodes.forEach((g, i) => { g.setAttribute('transform', `translate(${(pos[i].x - base[i].x).toFixed(2)} ${(pos[i].y - base[i].y).toFixed(2)})`); });
    lines.forEach((l, k) => { const [a, b] = edge[k]; l.setAttribute('x1', pos[a].x.toFixed(2)); l.setAttribute('y1', pos[a].y.toFixed(2)); l.setAttribute('x2', pos[b].x.toFixed(2)); l.setAttribute('y2', pos[b].y.toFixed(2)); });
    raf = visible ? requestAnimationFrame(tick) : 0;
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(tick); }).observe(svg);
}
init();
document.addEventListener('astro:page-load', init);
