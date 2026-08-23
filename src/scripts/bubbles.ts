/**
 * "13 majors" bubble physics — the glass orbs push away from the cursor and spring back.
 * Pure transform updates in a rAF loop (no layout). Desktop pointers only, and only when motion is allowed.
 * Each bubble: displacement (x,y) + velocity; forces = cursor repulsion (within RADIUS) + spring to origin + damping.
 */
function init() {
  const root = document.documentElement;
  const field = document.querySelector<HTMLElement>('[data-bubbles]');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (field && fine && root.classList.contains('motion')) {
    type B = { orb: HTMLElement; label: HTMLElement; cx: number; cy: number; r: number; x: number; y: number; vx: number; vy: number };
    const bubbles: B[] = [...field.querySelectorAll<HTMLElement>('[data-bubble]')].map((li) => {
      const orb = li.querySelector<HTMLElement>('.bubble-orb')!, label = li.querySelector<HTMLElement>('.bubble-label')!;
      return { orb, label, cx: 0, cy: 0, r: 0, x: 0, y: 0, vx: 0, vy: 0 };
    });
    const measure = () => { for (const b of bubbles) { const r = b.orb.getBoundingClientRect(); b.cx = r.x + r.width / 2 + scrollX; b.cy = r.y + r.height / 2 + scrollY; b.r = r.width / 2; } };
    measure(); addEventListener('resize', measure);

    // connector lines: attach each endpoint to the bubble whose edge it touches, so lines move with the bubbles
    const svg = document.querySelector<SVGSVGElement>('[data-bubble-links]');
    const un = () => parseFloat(getComputedStyle(root).getPropertyValue('--un')) || 1;
    type L = { el: SVGLineElement; x1: number; y1: number; x2: number; y2: number; a: B | null; b: B | null };
    const sec = field.closest('section')!.getBoundingClientRect();
    const secX = sec.x + scrollX, secY = sec.y + scrollY;
    const nearest = (xDu: number, yDu: number) => { const k = un(); let best: B | null = null, bd = 1e9; for (const b of bubbles) { const d = Math.abs(Math.hypot(b.cx - secX - xDu * k, b.cy - secY - yDu * k) - b.r); if (d < bd) { bd = d; best = b; } } return bd < 12 * k ? best : null; };
    const lines: L[] = svg ? [...svg.querySelectorAll('line')].map((el) => { const g = (n: string) => parseFloat(el.getAttribute(n)!); const x1 = g('x1'), y1 = g('y1'), x2 = g('x2'), y2 = g('y2'); return { el, x1, y1, x2, y2, a: nearest(x1, y1), b: nearest(x2, y2) }; }) : [];

    let px = -1e9, py = -1e9, raf = 0, active = false;
    const RADIUS = 110, PUSH = 1.3, SPRING = 0.05, DAMP = 0.85;   // gentle: a nudge, not a shove

    const tick = () => {
      let moving = false;
      for (const b of bubbles) {
        // cursor repulsion
        const dx = b.cx + b.x - px, dy = b.cy + b.y - py, d = Math.hypot(dx, dy), reach = RADIUS + b.r;
        if (d < reach && d > 0.001) { const f = ((reach - d) / reach) * PUSH; b.vx += (dx / d) * f; b.vy += (dy / d) * f; }
        // spring back + damping
        b.vx += -b.x * SPRING; b.vy += -b.y * SPRING; b.vx *= DAMP; b.vy *= DAMP; b.x += b.vx; b.y += b.vy;
        if (Math.abs(b.x) + Math.abs(b.y) + Math.abs(b.vx) + Math.abs(b.vy) > 0.05) moving = true;
        const t = `translate3d(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px, 0)`;
        b.orb.style.transform = t; b.label.style.transform = t;
      }
      const k = un();
      for (const l of lines) {
        if (l.a) { l.el.setAttribute('x1', String(l.x1 + l.a.x / k)); l.el.setAttribute('y1', String(l.y1 + l.a.y / k)); }
        if (l.b) { l.el.setAttribute('x2', String(l.x2 + l.b.x / k)); l.el.setAttribute('y2', String(l.y2 + l.b.y / k)); }
      }
      raf = moving || active ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };

    field.closest('section')!.addEventListener('pointermove', (e) => { px = e.pageX; py = e.pageY; active = true; wake(); });
    field.closest('section')!.addEventListener('pointerleave', () => { active = false; px = py = -1e9; wake(); });
    addEventListener('scroll', () => { if (active) measure(); }, { passive: true });
  }
}
init();
document.addEventListener('astro:page-load', init);
