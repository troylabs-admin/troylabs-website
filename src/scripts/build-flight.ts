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
  for (const sec3 of document.querySelectorAll<HTMLElement>('[data-figma="IgniteFeatures"], [data-m="IgniteFeatures"]')) {
    if (sec3.offsetParent === null) continue;              // only the visible tree — test the SECTION, not the
    const spark = sec3.querySelector<HTMLElement>('.fuse-spark'); // spark: display:none until motion CSS shows
    if (!spark) continue;                                  // it, so its own offsetParent is null (QA, 2026-08-24)
    const { top, h } = box(sec3);
    const atLoad = Math.max(0, (vh - top) / (h + vh));
    const start = Math.max(0.10, atLoad + 0.02);          // the stylesheet's cover 10-12%, pushed past load
    const END = 0.80;
    spark.style.animationRangeStart = `cover ${(start * 100).toFixed(2)}%`;
    const ramp = 0.06 * (END - start) / 0.70;
    const nodes = [...sec3.querySelectorAll<HTMLElement>('.fuse-node')].map((node) => {
      const frac = Number(node.dataset.frac);              // path fraction, baked per layout in the template
      const t = start + (END - start) * frac;
      node.style.setProperty('--ig0', `cover ${((t - ramp) * 100).toFixed(2)}%`);
      node.style.setProperty('--ig1', `cover ${(t * 100).toFixed(2)}%`);
      return { node, t };
    });

    // iOS Safari (and any engine without scroll-driven animations) never runs the CSS scrub above — the
    // phone always fell back to "nodes lit, no spark". Drive the MOBILE fuse by hand there: one element's
    // top + five opacities, written inside a scroll-coalesced rAF, only while the section is near the
    // viewport. The desktop tree keeps its documented static fallback (its spark rides an SVG path).
    if (sec3.matches('[data-m]') && !CSS.supports('animation-timeline: view()')) {
      sec3.classList.add('js-fuse');
      const railH = () => (spark.parentElement as HTMLElement).getBoundingClientRect().height - 6;
      let queued = false;
      const drive = () => {
        queued = false;
        const { top, h } = box(sec3);                      // box() is document-absolute — make it viewport-relative
        const vTop = top - scrollY;
        if (vTop > vh * 2 || vTop + h < -vh) return;       // far off screen: write nothing
        const coverNow = (vh - vTop) / (h + vh);
        const q = Math.min(1, Math.max(0, (coverNow - start) / (END - start)));
        spark.style.top = `${(q * railH()).toFixed(1)}px`;
        spark.style.opacity = q <= 0 ? '0' : String(Math.min(1, q / 0.05));
        for (const { node, t } of nodes) {
          const np = Math.min(1, Math.max(0, (coverNow - (t - ramp)) / ramp));
          node.style.opacity = (0.35 + 0.65 * np).toFixed(3);
        }
      };
      const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(drive); } };
      // apply() re-runs on resize and page-load: replace the previous driver instead of stacking them
      const prev = (sec3 as unknown as { _jsFuse?: () => void })._jsFuse;
      if (prev) removeEventListener('scroll', prev);
      (sec3 as unknown as { _jsFuse?: () => void })._jsFuse = onScroll;
      addEventListener('scroll', onScroll, { passive: true });
      document.addEventListener('astro:before-swap', () => removeEventListener('scroll', onScroll), { once: true });
      drive();
    }
  }

  // BUILD's mobile rail rocket: same missing-feature story as the fuse — the stylesheet's scroll
  // timeline (cover 18%–85%) never ran on iOS, so the rocket sat frozen at the top of the rail.
  const mtl = document.querySelector<HTMLElement>('.m-tl');
  const mRocket = mtl?.querySelector<HTMLElement>('.m-tl-rocket');
  if (mtl && mRocket && mtl.offsetParent !== null && !CSS.supports('animation-timeline: view()')) {
    let queued = false;
    const drive = () => {
      queued = false;
      const { top, h } = box(mtl);
      const vTop = top - scrollY;
      if (vTop > vh * 2 || vTop + h < -vh) return;
      const coverNow = (vh - vTop) / (h + vh);
      const q = Math.min(1, Math.max(0, (coverNow - 0.18) / (0.85 - 0.18)));
      const railH = (mRocket.parentElement as HTMLElement).getBoundingClientRect().height;
      mRocket.style.top = `${(q * (railH - 68)).toFixed(1)}px`;
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(drive); } };
    const prev = (mtl as unknown as { _jsRide?: () => void })._jsRide;
    if (prev) removeEventListener('scroll', prev);
    (mtl as unknown as { _jsRide?: () => void })._jsRide = onScroll;
    addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('astro:before-swap', () => removeEventListener('scroll', onScroll), { once: true });
    drive();
  }
}
apply();
addEventListener('resize', apply);
document.addEventListener('astro:page-load', apply);
