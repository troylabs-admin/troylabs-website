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
  let v = 0;
  lenis.on('scroll', ({ velocity }: { velocity: number }) => { v = velocity; });
  const raf = (t: number) => {
    lenis!.raf(t);
    // plant the BUILD flag when the landing rocket reaches the end of its path
    const flyer = document.querySelector<HTMLElement>('.flyer-backers'), flag = document.querySelector('.flag');
    if (flyer && flag) flag.classList.toggle('is-planted', parseFloat(getComputedStyle(flyer).offsetDistance) >= 99.5);
    // decay toward the live velocity so bursts read as momentum, not jitter
    const shown = parseFloat(root.style.getPropertyValue('--scroll-v')) || 0;
    const next = shown + (v - shown) * 0.12;
    root.style.setProperty('--scroll-v', next.toFixed(3));
    v *= 0.9;
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}
init();
document.addEventListener('astro:page-load', () => { lenis?.scrollTo(0, { immediate: true }); init(); });
document.addEventListener('astro:before-swap', () => { lenis?.scrollTo(0, { immediate: true }); });
