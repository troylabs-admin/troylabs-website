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
  // NOTE: don't wake() from here — Lenis emits 'scroll' from inside its own rAF, so waking on it kept the
  // loop alive forever. Real input (wheel/touch/key/resize) is what restarts it.
  lenis.on('scroll', ({ velocity }: { velocity: number }) => { v = velocity; });
  // cache the flag pair once: querySelector + getComputedStyle in the loop forced a style resolution
  // eight times a second forever, on every page, whether or not anything was moving.
  // The cache MUST be dropped on every client-side navigation — this init body runs once for the whole
  // session, so a cache taken on one page is null (or a detached element) on the next, and the flag
  // never plants after navigating home → BUILD (found on the deployed site, 2026-08-24).
  let flyer: HTMLElement | null = null, flag: Element | null = null, looked = false;
  document.addEventListener('astro:page-load', () => { flyer = null; flag = null; looked = false; });
  const raf = (t: number) => {
    lenis!.raf(t);
    // plant the BUILD flag when the landing rocket reaches the end of its path
    if ((frame++ & 7) === 0) {
      if (!looked) { flyer = document.querySelector('.flyer-backers'); flag = document.querySelector('.flag'); looked = true; }
      if (flyer && flag) flag.classList.toggle('is-planted', parseFloat(getComputedStyle(flyer).offsetDistance) >= 99.5);
    }
    // decay toward the live velocity so bursts read as momentum, not jitter
    const next = shown + (v - shown) * 0.12;
    if (Math.abs(next - shown) > 0.01 || (shown !== 0 && Math.abs(next) < 0.01)) { shown = Math.abs(next) < 0.01 ? 0 : next; root.style.setProperty('--scroll-v', shown.toFixed(2)); } // write only while it changes
    v *= 0.9;
    // render on demand: once the page is settled and the tab is idle there is nothing to interpolate,
    // so the loop stops entirely instead of running at 60 fps forever. Any scroll or resize wakes it.
    if (document.hidden || (Math.abs(v) < 0.001 && shown === 0 && ++idle > 60)) { running = false; return; }
    requestAnimationFrame(raf);
  };
  let running = false, idle = 0;
  function wake() {
    idle = 0;
    if (running || document.hidden) return;
    running = true;
    requestAnimationFrame(raf);
  }
  wake();
  addEventListener('resize', wake, { passive: true });
  addEventListener('wheel', wake, { passive: true });
  addEventListener('touchstart', wake, { passive: true });
  addEventListener('keydown', wake);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
}
init();
document.addEventListener('astro:page-load', () => { lenis?.scrollTo(0, { immediate: true }); init(); });
document.addEventListener('astro:before-swap', () => { lenis?.scrollTo(0, { immediate: true }); });

