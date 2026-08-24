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
apply();
addEventListener('resize', apply);
document.addEventListener('astro:page-load', apply);
