/**
 * Wake-on-approach + background-tab quiet.
 *
 * Ambient animation is the site's biggest idle cost: on a long page every twinkling star, floating logo
 * and breathing planet animates at once, all the way down, forever. An IntersectionObserver marks the
 * sections within one screen of the viewport `.awake`; motion.css pauses the ambient loops everywhere
 * else, so the browser only animates what you can actually see. Paused animations cost nothing — and
 * because they resume mid-phase, nothing visibly changes.
 *
 * The same applies to a backgrounded tab: `html.tab-hidden` stops the lot. Browsers throttle timers in
 * background tabs but do not necessarily stop compositor animations, which is why the page kept burning
 * CPU behind another tab (measured 2026-08-24).
 */
const root = document.documentElement;

function wake() {
  const blocks = document.querySelectorAll<HTMLElement>('main .section, main .m');
  if (!blocks.length) return;
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.target.classList.toggle('awake', e.isIntersecting)),
    { rootMargin: '100% 0px' },   // wake a screen early: nothing is ever caught mid-fade
  );
  for (const b of blocks) {
    if ((b as any)._wake) continue;
    (b as any)._wake = 1;
    io.observe(b);
  }
}

const visibility = () => root.classList.toggle('tab-hidden', document.hidden);

wake();
visibility();
document.addEventListener('visibilitychange', visibility);
document.addEventListener('astro:page-load', wake);
