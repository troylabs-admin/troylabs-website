/**
 * Page transitions — the rocket is the motif. On an internal navigation:
 *   1. launch: the overlay rocket rises from the viewport's lower third and leaves through the top (0.5 s, ease-in)
 *   2. the router swaps pages under a cross-fade (::view-transition rules in motion.css)
 *   3. re-entry: the rocket comes in from the bottom, slows, and fades as the new hero's choreography plays (0.8 s)
 * Skippable: a second navigation within 1.5 s goes straight through. Motion-gated; plain navigation otherwise.
 */
const root = document.documentElement;
let overlay: HTMLImageElement | null = null;
let lastNav = 0;

function rocket(): HTMLImageElement {
  if (overlay) return overlay;
  overlay = document.createElement('img');
  overlay.src = (document.querySelector<HTMLImageElement>('img[data-transition-rocket]')?.src) ?? '';
  overlay.alt = ''; overlay.className = 'vt-rocket'; overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);
  return overlay;
}

document.addEventListener('astro:before-preparation', (e: any) => {
  if (!root.classList.contains('motion') || !e.sourceElement || !(e.sourceElement as Element).closest?.('a')) return;
  const now = performance.now(); const skip = now - lastNav < 1500; lastNav = now;
  if (skip) return;
  const el = rocket();
  const original = e.loader;
  e.loader = async () => {
    el.style.opacity = '1';
    const anim = el.animate(
      [{ transform: 'translate(-50%, 0) scale(0.9)', opacity: 0 }, { transform: 'translate(-50%, -20vh) scale(1)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%, -140vh) scale(1.1)', opacity: 1 }],
      { duration: 520, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' },
    );
    await Promise.all([anim.finished.catch(() => {}), original()]);
  };
});

document.addEventListener('astro:after-swap', () => {
  if (!root.classList.contains('motion') || performance.now() - lastNav > 3000) return;
  overlay = null;                       // the old body (and the overlay in it) is gone — rebuild it in the new page
  const el = rocket();
  const anim = el.animate(
    [{ transform: 'translate(-50%, 30vh) scale(1.1)', opacity: 1 }, { transform: 'translate(-50%, -58vh) scale(0.95)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%, -70vh) scale(0.9)', opacity: 0 }],
    { duration: 850, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
  );
  anim.finished.then(() => { el.style.opacity = '0'; }).catch(() => {});
});
