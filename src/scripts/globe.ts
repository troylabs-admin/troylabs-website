/**
 * Live globe for Home › "Our members are part of".
 * Replaces the static Figma render (globe.png) with an SVG orthographic globe drawn in the same
 * language — white line-art continents, soft glow, dark sphere — that rotates slowly.
 * Only when <html class="motion">; paused while off-screen; the PNG stays for reduced motion / no JS.
 */
import { geoOrthographic, geoPath, geoGraticule } from 'd3-geo';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';

function init() {
  const root = document.documentElement;
  const host = document.querySelector<HTMLElement>('[data-globe]');
  if (!host || !root.classList.contains('motion') || host.dataset.ready) return;
  host.dataset.ready = '1';

  const SIZE = 387;                       // du — the Figma group box; the svg viewBox is in du
  const R = SIZE / 2 - 1;
  const svg = host.querySelector('svg')!;
  const landPath = svg.querySelector<SVGPathElement>('[data-land]')!;
  const gratPath = svg.querySelector<SVGPathElement>('[data-graticule]')!;

  const land = feature(land110 as any, (land110 as any).objects.land);
  const graticule = geoGraticule().step([30, 30])();
  const projection = geoOrthographic().translate([SIZE / 2, SIZE / 2]).scale(R).clipAngle(90);
  const path = geoPath(projection);

  // Figma's render faces Europe/Africa: longitude −20 in view, tilted slightly north
  const START: [number, number] = [-20, -12];
  const DEG_PER_MS = 360 / 110_000;       // one revolution every ~110 s — barely perceptible, alive
  const velocity = () => Math.abs(parseFloat(getComputedStyle(root).getPropertyValue('--scroll-v')) || 0); // from scroll.ts

  let visible = false, raf = 0, last = 0, lon = START[0];
  const draw = (now: number) => {
    if (last) lon = (lon + (now - last) * DEG_PER_MS * (1 + Math.min(velocity(), 30) * 0.25)) % 360; // scrolling spins it faster
    last = now;
    projection.rotate([lon, START[1]]);
    landPath.setAttribute('d', path(land) ?? '');
    gratPath.setAttribute('d', path(graticule) ?? '');
    raf = visible ? requestAnimationFrame(draw) : 0;
  };
  projection.rotate(START); landPath.setAttribute('d', path(land) ?? ''); gratPath.setAttribute('d', path(graticule) ?? '');
  host.classList.add('is-live');

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; last = 0; if (visible && !raf) raf = requestAnimationFrame(draw); }, { rootMargin: '100px' }).observe(host);
}
init();
document.addEventListener('astro:page-load', init);
