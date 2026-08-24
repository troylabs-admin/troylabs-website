/**
 * BUILD timeline rocket — pin the flight's start to the page's scroll-zero timeline progress.
 * The CSS range (entry 15%) assumed the timeline section is off-screen at load, but on tall viewports
 * its top — and the first dashes of the dotted path — is already a third of the way in at scrollY 0,
 * so the scrubbed animation was already underway and the rocket materialised mid-path (Bryan's report,
 * 2026-08-24). Here we measure the section's cover progress at scrollY 0 and start the flight just past
 * it, so the rocket sits parked on the first dash until you actually scroll. The end stays the CSS's
 * exit 95%, translated into the same cover units. Inline styles win over the motion.css range.
 */
function apply() {
  const flyer = document.querySelector<HTMLElement>('.flyer-img');
  const sec = document.querySelector<HTMLElement>('[data-figma="BuildTimeline"]');
  if (!flyer || !sec) return;
  const vh = innerHeight;
  const top = sec.getBoundingClientRect().top + scrollY; // document y (constant while at rest)
  const h = sec.offsetHeight;
  const cover = (px: number) => px / (h + vh);            // px scrolled since cover 0% → cover fraction
  const atLoad = Math.max(0, cover(vh - top));            // progress the timeline already has at scrollY 0
  const cssStart = cover(0.15 * Math.min(h, vh));         // the stylesheet's entry 15% in cover units
  const start = Math.max(atLoad + 0.015, cssStart);
  const end = cover(h + 0.95 * vh);                       // the stylesheet's exit 95%
  flyer.style.animationRangeStart = `cover ${(start * 100).toFixed(2)}%`;
  flyer.style.animationRangeEnd = `cover ${(end * 100).toFixed(2)}%`;
}
apply();
addEventListener('resize', apply);
document.addEventListener('astro:page-load', apply);
