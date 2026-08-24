/**
 * Mobile art re-anchoring — measures each `.m-art[data-aw]` wrapper and sets --u (px) and --un
 * (unitless) locally, so design-unit markup dropped inside renders at the wrapper's width. The height
 * follows from data-ah. This is the whole trick that lets the swarm, fuse, planets and stats reuse
 * their desktop du markup on mobile untouched (see src/styles/mobile.css).
 *
 * Also publishes --mun: the mobile flight's scale (MobileFlight.astro is authored in a 390-wide mobile
 * design space; --mun = innerWidth/390 lets the one path fit 320–430 px phones exactly).
 */
const MOBILE_W = 390;
function apply() {
  const mun = innerWidth / MOBILE_W;
  const root = document.documentElement;
  root.style.setProperty('--mun', mun.toFixed(4));
  root.style.setProperty('--mu', `${mun.toFixed(4)}px`);
  for (const el of document.querySelectorAll<HTMLElement>('.m-art[data-aw]')) {
    const aw = Number(el.dataset.aw);
    const w = el.clientWidth;
    if (!aw || !w) continue;
    const u = w / aw;
    el.style.setProperty('--u', `${u.toFixed(4)}px`);
    el.style.setProperty('--un', u.toFixed(4));
    const ah = Number(el.dataset.ah);
    if (ah) el.style.height = `${Math.round(ah * u)}px`;
  }
}
/**
 * Wake-on-approach: only the mobile blocks near the viewport are allowed to animate. WebKit's own power
 * guidance is to run animations only while visible (and to prefer declarative animations the engine can
 * optimise away) — on a page carrying hundreds of twinkling dots, floating logos and breathing planets
 * that is the difference between a warm phone and a cool one. `.awake` gates animation-play-state in
 * mobile.css; the rootMargin wakes a block one screen early so nothing is ever caught mid-fade.
 */
function wake() {
  if (!matchMedia('(max-width: 767px)').matches) return;
  const blocks = document.querySelectorAll<HTMLElement>('main .m');
  if (!blocks.length || (blocks[0] as any)._wake) return;
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle('awake', e.isIntersecting)),
    { rootMargin: '100% 0px' },
  );
  blocks.forEach((b) => { (b as any)._wake = 1; io.observe(b); });
}

apply();
wake();
addEventListener('resize', apply);
document.addEventListener('astro:page-load', () => { apply(); wake(); });
