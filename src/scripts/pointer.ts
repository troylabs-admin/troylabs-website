/**
 * Pointer interactions (desktop, motion on):
 *  • cursor light — [data-hover] tiles get --lx/--ly (not --x/--y: those are the .abs position vars) so a soft radial glow follows the cursor (CSS in motion.css)
 *  • magnetic CTAs — .pill and header .apply lean toward the cursor within 1.5× their box, spring back on leave
 */
const root = document.documentElement;

function init() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || !root.classList.contains('motion') || root.dataset.pointer) return;
  root.dataset.pointer = '1';

  document.addEventListener('pointermove', (e) => {
    const tile = (e.target as Element | null)?.closest?.('[data-hover]') as HTMLElement | null;
    if (tile) { const r = tile.getBoundingClientRect(); tile.style.setProperty('--lx', `${e.clientX - r.left}px`); tile.style.setProperty('--ly', `${e.clientY - r.top}px`); }
  }, { passive: true });

  const magnets = document.querySelectorAll<HTMLElement>('.pill, header .apply');
  let active: HTMLElement | null = null;
  document.addEventListener('pointermove', (e) => {
    let hit: HTMLElement | null = null;
    for (const m of magnets) {
      const r = m.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      if (Math.abs(dx) < r.width * 0.75 && Math.abs(dy) < r.height * 1.6) { hit = m; m.style.setProperty('--tx', `${(dx * 0.28).toFixed(1)}px`); m.style.setProperty('--ty', `${(dy * 0.28).toFixed(1)}px`); m.classList.add('is-magnet'); break; }
    }
    if (active && active !== hit) { active.style.setProperty('--tx', '0px'); active.style.setProperty('--ty', '0px'); active.classList.remove('is-magnet'); }
    active = hit;
  }, { passive: true });
}
init();
document.addEventListener('astro:page-load', () => { delete root.dataset.pointer; init(); });
