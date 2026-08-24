/**
 * Reveal-on-enter. Runs only when <html class="motion"> (set in the head when the user allows motion).
 * Marks content "units" that start below the fold with data-reveal (hidden by motion.css) and lets
 * Motion's inView() add .is-in as they scroll into view, staggered by vertical order within a section.
 * Above-the-fold content is never touched (no LCP penalty, no flash).
 */
import { inView } from 'motion';

/** "100+" / "$28M+" tick up from 0 over 1.2 s (expo-out); prefix/suffix preserved. */
function countUp(el: HTMLElement) {
  const m = el.textContent!.trim().match(/^([^\d]*)(\d+)(.*)$/); if (!m) return;
  const [, pre, num, post] = m; const target = parseInt(num, 10); const t0 = performance.now(); const D = 1200;
  const tick = (t: number) => { const p = Math.min(1, (t - t0) / D); const e = 1 - Math.pow(2, -10 * p); el.textContent = `${pre}${Math.round(target * e)}${post}`; if (p < 1) requestAnimationFrame(tick); else el.textContent = `${pre}${target}${post}`; };
  requestAnimationFrame(tick);
}

function init() {
  const root = document.documentElement;
  if (root.classList.contains('motion')) {
    const sections = document.querySelectorAll<HTMLElement>('main section, main .m'); // .m = the mobile subtrees (mobile.css)
    for (const section of sections) {
      const seen = new Set<HTMLElement>();
      const units: HTMLElement[] = [];
      for (const el of section.querySelectorAll<HTMLElement>('h2, h3, h4, p, dt, dd, article, li, figure, img:not(.planet):not(.abs), .ring, .t-stat, [data-reveal-unit]')) {
        if (el.closest('[data-figma="Hero"], .no-reveal')) continue;
        // group into the nearest article/li only if that wrapper has a real box (art-directed wrappers are 0-height
        // because their children are absolutely positioned — then each element animates on its own)
        let unit: HTMLElement = el;
        // (figure too: a photo hidden by its own clip-path curtain has zero intersection area, so its wrapper must be observed)
      for (let w = el.closest('article, li, figure') as HTMLElement | null; w; w = w.parentElement?.closest('article, li, figure') as HTMLElement | null) {
          if (w.getBoundingClientRect().height > 0) unit = w;
        }
        if (unit.getBoundingClientRect().height === 0 || seen.has(unit)) continue;
        seen.add(unit);
        units.push(unit);
      }
      units
        // explicit opt-ins (data-reveal-unit) arm even above the fold — inView fires immediately there,
        // so they get a load-time entrance instead of never animating (the mission paragraph sits ~935px,
        // right at the fold: on tall windows the fold filter used to skip it entirely)
        .filter((u) => u.hasAttribute('data-reveal-unit') || u.getBoundingClientRect().top > innerHeight)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .forEach((u, i) => {
          u.dataset.reveal = '';
          u.style.setProperty('--stagger', String(Math.min(i, 4)));
          // opt-ins also skip the -5% bottom margin: an element sitting in the viewport's bottom band at
          // load (the mission text on tall windows) must fire now, not after a scroll that may never come
          const opts = u.hasAttribute('data-reveal-unit') ? { amount: 0.08 } : { amount: 0.08, margin: '0px 0px -5% 0px' };
          inView(u, () => {
            u.classList.add('is-in');
            const stats = u.classList.contains('t-stat') ? [u] : [...u.querySelectorAll<HTMLElement>('.t-stat')];
            stats.forEach(countUp);
          }, opts);
        });
    }
  }
}
init();
document.addEventListener('astro:page-load', init);
