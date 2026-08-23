/**
 * Weighted scroll (Lenis). Smooths wheel steps into inertia so scroll-linked motion (rocket paths,
 * planet drift) and reveals feel continuous instead of stepped. Lenis scrolls the real document, so CSS
 * scroll-driven animations and IntersectionObserver keep working unchanged.
 * Also publishes smoothed scroll velocity as --scroll-v (px/ms, signed) for velocity-reactive effects.
 * Lenis honours prefers-reduced-motion on its own (lerp → 1). Desktop pointers only; touch stays native.
 */
import Lenis from 'lenis';

let lenis: Lenis | null = null;
const root = document.documentElement;

function init() {
  if (lenis || !matchMedia('(hover: hover) and (pointer: fine)').matches || !root.classList.contains('motion')) return;
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, smoothWheel: true, syncTouch: false });
  let v = 0, shown = 0, frame = 0;
  lenis.on('scroll', ({ velocity }: { velocity: number }) => { v = velocity; });
  const raf = (t: number) => {
    lenis!.raf(t);
    // plant the BUILD flag when the landing rocket reaches the end of its path
    if ((frame++ & 7) === 0) {
      root.classList.toggle('flying', scrollY > 120); const flyer = document.querySelector<HTMLElement>('.flyer-backers'), flag = document.querySelector('.flag'); if (flyer && flag) flag.classList.toggle('is-planted', parseFloat(getComputedStyle(flyer).offsetDistance) >= 99.5); }
    // decay toward the live velocity so bursts read as momentum, not jitter
    const next = shown + (v - shown) * 0.12;
    if (Math.abs(next - shown) > 0.01 || (shown !== 0 && Math.abs(next) < 0.01)) { shown = Math.abs(next) < 0.01 ? 0 : next; root.style.setProperty('--scroll-v', shown.toFixed(2)); } // write only while it changes
    v *= 0.9;
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}
init();
document.addEventListener('astro:page-load', () => { lenis?.scrollTo(0, { immediate: true }); init(); });
document.addEventListener('astro:before-swap', () => { lenis?.scrollTo(0, { immediate: true }); });
