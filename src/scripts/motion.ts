/**
 * Reveal-on-enter. Runs only when <html class="motion"> (set in the head when the user allows motion).
 * Marks content "units" that start below the fold with data-reveal (hidden by motion.css) and lets
 * Motion's inView() add .is-in as they scroll into view, staggered by vertical order within a section.
 * Above-the-fold content is never touched (no LCP penalty, no flash).
 */
import { inView } from 'motion';

function init() {
  const root = document.documentElement;
  if (root.classList.contains('motion')) {
    const sections = document.querySelectorAll<HTMLElement>('main section');
    for (const section of sections) {
      const seen = new Set<HTMLElement>();
      const units: HTMLElement[] = [];
      for (const el of section.querySelectorAll<HTMLElement>('h2, h3, h4, p, article, li, figure, img:not(.planet):not(.abs), .bubble-orb, .bubble-label, .ring')) {
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
        .filter((u) => u.getBoundingClientRect().top > innerHeight)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .forEach((u, i) => {
          u.dataset.reveal = '';
          u.style.setProperty('--stagger', String(Math.min(i, 6)));
          inView(u, () => { u.classList.add('is-in'); }, { amount: 0.15, margin: '0px 0px -15% 0px' }); // fires when the unit is ~15% up from the bottom edge
        });
    }
  }
}
init();
document.addEventListener('astro:page-load', init);
