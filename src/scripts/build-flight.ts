/**
 * BUILD rockets — pin both scrubbed flights to what THIS viewport can actually scroll.
 * The CSS range (entry 15%) assumed the timeline section is off-screen at load, but on tall viewports
 * its top — and the first dashes of the dotted path — is already a third of the way in at scrollY 0,
 * so the scrubbed animation was already underway and the rocket materialised mid-path (Bryan's report,
 * 2026-08-24). Here we measure the section's cover progress at scrollY 0 and start the flight just past
 * it, so the rocket sits parked on the first dash until you actually scroll. The end stays the CSS's
 * exit 95%, translated into the same cover units. Inline styles win over the motion.css range.
 */
function apply() {
  const vh = innerHeight;
  const box = (el: Element) => ({ top: el.getBoundingClientRect().top + scrollY, h: (el as HTMLElement).offsetHeight });

  // timeline rocket: don't start before the page's scroll-zero progress (tall viewports)
  const flyer = document.querySelector<HTMLElement>('.flyer-img');
  const sec = document.querySelector<HTMLElement>('[data-figma="BuildTimeline"]');
  if (flyer && sec) {
    const { top, h } = box(sec);
    const cover = (px: number) => px / (h + vh);          // px scrolled since cover 0% → cover fraction
    const atLoad = Math.max(0, cover(vh - top));          // progress the timeline already has at scrollY 0
    const start = Math.max(atLoad + 0.015, cover(0.15 * Math.min(h, vh))); // ≥ the stylesheet's entry 15%
    flyer.style.animationRangeStart = `cover ${(start * 100).toFixed(2)}%`;
    flyer.style.animationRangeEnd = `cover ${(cover(h + 0.95 * vh) * 100).toFixed(2)}%`; // the stylesheet's exit 95%
  }

  // backers rocket: don't END past the page's maximum reachable progress. The stylesheet lands it at
  // 67% of the section's cover timeline, but this is the LAST section — on smaller windows the document
  // runs out of scroll before 67%, the flight never completes and the flag never plants (Bryan,
  // 2026-08-24). Clamp the landing just inside what full scroll can reach, keeping the flight's span.
  const flyer2 = document.querySelector<HTMLElement>('.flyer-backers');
  const sec2 = document.querySelector<HTMLElement>('[data-figma="BuildBackers"]');
  if (flyer2 && sec2) {
    const { top, h } = box(sec2);
    const coverMax = (document.documentElement.scrollHeight - top) / (h + vh); // progress at full scroll
    const cssStart = (0.4 * Math.min(h, vh)) / (h + vh);  // the stylesheet's entry 40% in cover units
    const cssEnd = 0.67;
    const end = Math.min(cssEnd, coverMax - 0.015);
    const start = Math.min(cssStart, Math.max(0.02, end - (cssEnd - cssStart))); // preserve the span when clamped
    flyer2.style.animationRangeStart = `cover ${(start * 100).toFixed(2)}%`;
    flyer2.style.animationRangeEnd = `cover ${(end * 100).toFixed(2)}%`;
  }

  // IGNITE fuse: same disease, third home. On short pages (narrow windows shrink --u) the features
  // section is already deep into its cover timeline at scrollY 0, so the spark spawned mid-fuse with
  // half the nodes' ignitions already passed (Bryan, 2026-08-24: "the dot starts on Exclusive Events").
  // Re-anchor the spark's range start to the scroll-zero progress and remap every node's ignition %
  // into the new span so spark/node sync is preserved (same fraction math as Features.astro).
  for (const spark of document.querySelectorAll<HTMLElement>('.fuse-spark')) {
    if (spark.offsetParent === null) continue;             // only the visible tree (desktop OR mobile)
    const sec3 = spark.closest<HTMLElement>('[data-figma="IgniteFeatures"], [data-m="IgniteFeatures"]');
    if (!sec3) continue;
    const { top, h } = box(sec3);
    const atLoad = Math.max(0, (vh - top) / (h + vh));
    const start = Math.max(0.10, atLoad + 0.02);          // the stylesheet's cover 10-12%, pushed past load
    const END = 0.80;
    spark.style.animationRangeStart = `cover ${(start * 100).toFixed(2)}%`;
    for (const node of sec3.querySelectorAll<HTMLElement>('.fuse-node')) {
      const frac = Number(node.dataset.frac);              // path fraction, baked per layout in the template
      const t = start + (END - start) * frac;
      const ramp = 0.06 * (END - start) / 0.70;
      node.style.setProperty('--ig0', `cover ${((t - ramp) * 100).toFixed(2)}%`);
      node.style.setProperty('--ig1', `cover ${(t * 100).toFixed(2)}%`);
    }
  }
}
apply();
addEventListener('resize', apply);
document.addEventListener('astro:page-load', apply);
