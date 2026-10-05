/**
 * Alumni portal › the globe. Charlotte Chang's GlobeMap from the MVP (troylabs-alumni-network) — real
 * pins at real coordinates, drag to rotate — with one structural change (Bryan, 2026-09-15): people are
 * grouped into ONE STAR PER CITY, and cities whose stars would overlap at the current zoom merge into a
 * bigger star with a count (see lib/portal/cluster.ts for the rules and the prior art).
 *
 * A tap SELECTS a star: the globe flies in, and a card sits on the star naming it — the city, how many
 * cities and people it holds — with a SEE WHO'S HERE link and a ×. The page (Network.tsx) is told which
 * star is selected and narrows its results to it; nothing scrolls on its own (Bryan: "it doesn't scroll…
 * it just says San Francisco +3 cities"). The selection follows the star through zooms and drags, and
 * through the re-clustering they cause: if the tapped city ends up inside a bigger star, that star is
 * selected; if a filter empties it, the selection clears. A star of one shows Charlotte's person card.
 * The globe OPENS with the whole world in view and a tap never zooms (Bryan, 2026-10-02: zoomed in, the globe
 * overflowed its frame and was cut square): a tap turns the globe to the star and opens its card, which lists
 * every city a merged star holds. Zoom is on purpose only (Bryan, 2026-10-05: "there's no button to zoom in"):
 * the + / − / reset stack in the lower right (Google Maps / Mapbox's control), a two-finger pinch on touch, or a
 * trackpad pinch (ctrl + wheel, Google Maps' cooperative gesture). Zoomed in, the disc outgrows the frame, so
 * the frame is a soft round porthole (portal.css), never a square cut. The plain wheel scrolls the PAGE
 * (OrbitControls hijacked it in the MVP).
 * Approved profiles supply live pins. The explicit sample preview supplies a generated roster.
 */
import React, { useEffect, useMemo, useRef, useState, useCallback, type ComponentType } from 'react';
import { clusterCities, clusterLabel, groupByCity, type City, type Cluster, type GlobePerson } from '../../lib/portal/cluster';
import { tickNumber } from '../../lib/portal/tick';

export type GlobePin = GlobePerson;
export type { Cluster } from '../../lib/portal/cluster';

/* zoom: each step multiplies the altitude by 0.6 (Google Maps halves the scale per level; 0.6 is gentler). From
   the square frame's 1.9 that is 1.14 · 0.68 · 0.41 · 0.25 (`min` = four steps, ≈ the old zoom stack's limit;
   the same ladder going out). Measured with ?sample=1: 14 → 1.8 km per px on desktop (33 → 4.3 on a phone),
   where the New York star of 42 splits into New York, Philadelphia, Boston, Washington and Toronto. Closer, the
   4096 px map texture visibly pixelates (looked at 0.15 and 0.10), and cities 50 km apart (San Francisco · Palo
   Alto) would still need ~0.1. */
const ALT = { start: 1.9, min: 1.9 * 0.6 ** 4, step: 0.6, ms: 600 };
const OPEN = { lat: 30, lng: -80 };   // the opening view: the Americas, where most alumni are
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const tier = (n: number) => (n <= 1 ? 1 : n < 10 ? 2 : n < 50 ? 3 : 4);
const upper = (s: string) => s.toUpperCase();
/* the altitude at which the whole disc fits the frame with a 10 % margin. The camera's vertical fov is 50°;
   the globe's apparent angular radius at distance R(1+alt) is asin(1/(1+alt)). Never closer than the desktop
   opening (1.9). */
const fitAltitude = (w: number, h: number) => { const k = (0.9 * Math.min(w, h) / h) * Math.tan((25 * Math.PI) / 180); return Math.max(ALT.start, 1 / Math.sin(Math.atan(k)) - 1); };

const starLabel = (c: Cluster) => (c.count === 1 ? c.cities[0].people[0].full_name : `${clusterLabel(c)} · ${c.count}`);
function decorateStar(el: HTMLElement, c: Cluster) {
  const label = starLabel(c);
  el.title = label; el.setAttribute('aria-label', label); el.dataset.count = String(c.count); el.dataset.cities = String(c.cities.length); el.dataset.key = c.key; el.dataset.seed = c.seed.key;   // seed: the stable handle (membership can change under a chip)
  el.className = `tl-star tl-star-${tier(c.count)}${el.classList.contains('is-selected') ? ' is-selected' : ''}`;
}
class GlobeBoundary extends React.Component<{ children: React.ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function createStarMarker(c: Cluster, onClick: (c: Cluster, el: HTMLElement) => void) {
  const el = document.createElement('button');
  el.type = 'button';
  decorateStar(el, c);
  el.innerHTML = `
    <span class="tl-star-box">
      <span class="tl-star-glow"></span>
      <span class="tl-pin-name"></span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10.5" fill="#151a20" stroke="#ff7d2c" stroke-width="0.65"/><path class="tl-star-point" fill="#ff7d2c" d="M12 5.5 13.6 10.4 18.5 12 13.6 13.6 12 18.5 10.4 13.6 5.5 12 10.4 10.4Z"/>
      </svg>
      <span class="tl-star-n" aria-hidden="true">${c.count}</span>
    </span>`;
  // pointer-events:auto is required: the library's marker container is pointer-events:none, and children
  // inherit it — without this, hover and click never reach the pin (measured: elementFromPoint at the pin
  // centre returned the canvas). This also means pin clicks did not work in the MVP as deployed.
  el.querySelector('.tl-pin-name')!.textContent = starLabel(c);
  el.style.pointerEvents = 'auto';
  el.addEventListener('click', (event) => { event.stopPropagation(); onClick(c, el); });
  return el;
}

export default function AlumniGlobe({ pins, onRefresh, onPick, onSeeList, reset = 0, profileHref = (p) => `/alumni-portal/members/?id=${p.id}` }: {
  pins: GlobePerson[]; onRefresh?: () => void;
  /** the selected star changed (null = nothing selected). The page narrows its list to it. */
  onPick?: (c: Cluster | null) => void;
  /** the card's SEE WHO'S HERE link — the page decides what that means (it scrolls to its results) */
  onSeeList?: () => void;
  /** bump to clear the selection and zoom back out to the opening view (the page's × on the place pill) */
  reset?: number;
  profileHref?: (p: GlobePerson) => string;
}) {
  const [Globe, setGlobe] = useState<ComponentType<any> | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [altitude, setAltitude] = useState(ALT.start);
  // the altitude the camera is HEADING to: a zoom step sets it at once (so two quick clicks add up, and a button
  // disables at its limit before the flight ends); a settle after a pinch or a drag sets it from the camera
  const [aim, setAim] = useState(ALT.start); const aimRef = useRef(ALT.start); const flyingUntil = useRef(0);
  const [view, setView] = useState({ kmPerPx: 30, lat: 30, lng: -80, alt: ALT.start, n: 0 });   // the settled camera; n bumps on every settle so clusters re-project
  const [selected, setSelected] = useState<{ seed: string; cities: string[] } | null>(null);   // the tapped star: its anchor city and the cities under it
  const lastSel = useRef<Cluster | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const clickRef = useRef<(c: Cluster, el: HTMLElement) => void>(() => undefined);
  const clusterCache = useRef(new Map<string, Cluster>());
  const reported = useRef<string>('');

  useEffect(() => {
    let active = true;
    const texture = new Image();
    const loaded = new Promise<void>((resolve, reject) => { texture.onload = () => resolve(); texture.onerror = () => reject(new Error('Map unavailable')); texture.src = '/maps/alumni-earth.png'; });
    Promise.all([import('react-globe.gl'), loaded]).then(([m]) => { if (active) setGlobe(() => m.default); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (ready || failed) return;
    const timeout = window.setTimeout(() => setFailed(true), 12000);
    return () => clearTimeout(timeout);
  }, [ready, failed]);
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    let inView = true;
    const update = () => { const g = globeRef.current; if (document.hidden || !inView) g?.pauseAnimation(); else g?.resumeAnimation(); };
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); }, { rootMargin: '100px' });
    observer.observe(containerRef.current); document.addEventListener('visibilitychange', update);
    const canvas = containerRef.current.querySelector('canvas');
    const lost = () => setFailed(true);
    canvas?.addEventListener('webglcontextlost', lost);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); canvas?.removeEventListener('webglcontextlost', lost); };
  }, [ready]);

  // Charlotte's "refresh": re-query the pins when the tab regains focus, so a globe left open for an
  // hour is not stale. Invisible by design — the Refresh button it also drove was dropped as redundant.
  useEffect(() => {
    if (!onRefresh) return;
    const refresh = () => onRefresh();
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisibility); };
  }, [onRefresh]);

  useEffect(() => {
    const updateSize = () => { if (containerRef.current) setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight }); };
    updateSize(); const observer = new ResizeObserver(updateSize); if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  /* Runs when the camera SETTLES. Measures km per screen pixel at the globe's centre from the library's own
     projection (a 1° step in longitude at the current latitude is 111.32·cos(lat) km) and bumps `view`
     so clusters re-project. */
  const measure = useCallback(() => {
    const g = globeRef.current; if (!g) return;
    const pov = g.pointOfView(); if (!pov) return;
    const a = g.getScreenCoords(pov.lat, pov.lng), b = g.getScreenCoords(pov.lat, pov.lng + 1);
    const px = Math.hypot(b.x - a.x, b.y - a.y); if (!px) return;
    const kmPerPx = (111.32 * Math.cos((pov.lat * Math.PI) / 180)) / px;
    setView((v) => (Math.abs(v.kmPerPx - kmPerPx) / v.kmPerPx < 0.002 && Math.abs(v.lat - pov.lat) < 0.02 && Math.abs(v.lng - pov.lng) < 0.02 ? v : { kmPerPx, lat: pov.lat, lng: pov.lng, alt: pov.altitude, n: v.n + 1 }));
    setAltitude(pov.altitude);
    if (performance.now() > flyingUntil.current) { aimRef.current = pov.altitude; setAim(pov.altitude); }   // the camera moved itself (pinch)
  }, []);
  // The controls' damping makes the globe coast for ~1.5–2 s after you let go (measured: 89 'change'
  // events, 12° of extra rotation). Re-cluster on a throttle while it coasts — the way Cesium re-clusters
  // every frame, just cheaper — and once more when it has settled, so stars never sit stale and overlapping.
  const settleTimer = useRef(0); const lastLive = useRef(0);
  const onCameraChange = useCallback(() => {
    const now = performance.now();
    if (now - lastLive.current > 250) { lastLive.current = now; measure(); }
    window.clearTimeout(settleTimer.current); settleTimer.current = window.setTimeout(measure, 150);
  }, [measure]);

  useEffect(() => () => { clearTimeout(settleTimer.current); const c = globeRef.current?.controls(); c?.removeEventListener('change', onCameraChange); c?.removeEventListener('end', measure); }, [onCameraChange, measure]);

  const cities = useMemo(() => groupByCity(pins), [pins]);
  const clusters = useMemo(() => {
    // screen-space distances from the globe's real projection; a city on the far side never merges.
    // "on the near side" uses the same test the library uses to decide whether to DRAW a star (three-globe's
    // isBehindGlobe: the star's 3D position against the camera's visible cone, at the stars' own altitude).
    const g = globeRef.current; const cam = g?.camera?.(); const R = 100, STAR_ALT = 0.02;
    const povDist = cam ? Math.hypot(cam.position.x, cam.position.y, cam.position.z) : 0;
    const edgeDist = Math.sqrt(povDist * povDist - R * R), edgeAngle = Math.acos(edgeDist / povDist);
    const nearSide = (c: City) => {
      if (!cam) return false;
      const pos = g.getCoords(c.lat, c.lng, STAR_ALT); const d = Math.hypot(pos.x - cam.position.x, pos.y - cam.position.y, pos.z - cam.position.z);
      if (d < edgeDist) return true;
      const posDist = Math.hypot(pos.x, pos.y, pos.z);
      return Math.acos((povDist * povDist + d * d - posDist * posDist) / (2 * povDist * d)) >= edgeAngle;
    };
    const screen = new Map<string, { x: number; y: number } | null>();
    const at = (c: City) => { if (!screen.has(c.key)) screen.set(c.key, nearSide(c) ? g.getScreenCoords(c.lat, c.lng, STAR_ALT) : null); return screen.get(c.key)!; };
    const distPx = (a: City, b: City) => { const p = at(a), q = at(b); return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : Infinity; };
    // cached by the SEED city (the star's anchor), not the full membership: a chip that empties Oakland out
    // of the San Francisco star must keep San Francisco's element so 382 can tick to 95
    const fresh = clusterCities(cities, distPx); const cache = clusterCache.current; const next = new Map<string, Cluster>();
    const out = fresh.map((c) => { const prev = cache.get(c.seed.key); if (!prev) { next.set(c.seed.key, c); return c; }
      if (prev.count !== c.count || prev.key !== c.key || prev.seed !== c.seed) { Object.assign(prev, c); }
      next.set(c.seed.key, prev); return prev; });
    clusterCache.current = next; return out;
  }, [cities, view]);

  // HTML markers are inserted by the renderer after React effects. Observe insertion as well as
  // cluster changes so a marker never keeps the old count while its live cluster has already changed.
  useEffect(() => {
    const wrap = containerRef.current; if (!wrap) return;
    const sync = () => {
      for (const c of clusters) {
        const el = wrap.querySelector<HTMLElement>(`.tl-star[data-seed="${CSS.escape(c.seed.key)}"]`); if (!el) continue;
        const from = Number(el.dataset.count);
        if (from !== c.count || el.dataset.key !== c.key || el.getAttribute('aria-label') !== starLabel(c)) {
          decorateStar(el, c);
          const name = el.querySelector('.tl-pin-name'); if (name && name.textContent !== starLabel(c)) name.textContent = starLabel(c);
          const n = el.querySelector<HTMLElement>('.tl-star-n'); if (n && from !== c.count) tickNumber(n, from, c.count);
        }
      }
    };
    const observer = new MutationObserver(sync); observer.observe(wrap, { childList: true, subtree: true }); sync();
    return () => observer.disconnect();
  }, [clusters]);

  /* the selection follows the stars: the tapped city's own star, the bigger star it merged into, or any
     star still holding one of the selected cities. A filter that empties every one of them does NOT clear
     the selection: it stays as a place with nobody in it (0 LEFT), because adding a filter may only narrow
     — dropping the place widened 32 to 43 (Bryan, 2026-09-15). Only × / CLEAR ALL / another tap change it. */
  const current = useMemo(() => {
    if (!selected) return null;
    return clusters.find((c) => c.seed.key === selected.seed) ?? clusters.find((c) => c.cities.some((x) => x.key === selected.seed)) ?? clusters.find((c) => c.cities.some((x) => selected.cities.includes(x.key))) ?? null;
  }, [clusters, selected]);
  useEffect(() => {
    if (!selected) { if (reported.current !== '') { reported.current = ''; onPick?.(null); } return; }
    if (current) {
      lastSel.current = current;
      const keys = current.cities.map((c) => c.key);
      if (current.seed.key !== selected.seed || keys.join('+') !== selected.cities.join('+')) setSelected({ seed: current.seed.key, cities: keys });
      const sig = `${current.key}#${current.count}`;
      // a snapshot, not the live object: the cache updates clusters in place (so stars keep their elements
      // and tick), which means the object's identity never changes — the page would never re-derive from it
      if (sig !== reported.current) { reported.current = sig; onPick?.({ ...current, cities: [...current.cities] }); }
    } else if (lastSel.current) {
      const sig = `${lastSel.current.key}#0`;
      if (sig !== reported.current) { reported.current = sig; onPick?.({ ...lastSel.current, count: 0, cities: lastSel.current.cities.map((c) => ({ ...c, people: [] })) }); }
    }
  }, [current, clusters, selected, onPick]);
  // the card sits on the selected star and follows it (fly-in, drag, re-cluster rebuilding the element)
  const anchorOf = (el: Element) => { const wrap = containerRef.current!.getBoundingClientRect(); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - wrap.left, y: r.top - wrap.top }; };
  useEffect(() => {
    if (!current) { setAnchor(null); return; }
    const el = containerRef.current?.querySelector<HTMLElement>(`.tl-star[data-seed="${CSS.escape(current.seed.key)}"]`);
    // no card while its star is out of sight — turned to the far side (the library hides it: display none, so
    // its box is all zeros and the card sat at a clamped spot pointing at nothing) or, zoomed in, outside the
    // round frame. It comes back when the star does. The selection itself stays. (No element yet = the renderer
    // has not inserted it: keep the card where it was, as before.)
    if (!el) return;
    const wrap = containerRef.current!.getBoundingClientRect(); const r = el.getBoundingClientRect();
    const inFrame = r.width > 0 && Math.hypot(r.left + r.width / 2 - wrap.left - wrap.width / 2, r.top + r.height / 2 - wrap.top - wrap.height / 2) <= Math.min(wrap.width, wrap.height) / 2;
    if (inFrame) { const a = anchorOf(el); setAnchor((old) => (old && Math.abs(a.x - old.x) < 0.5 && Math.abs(a.y - old.y) < 0.5 ? old : a)); }
    else setAnchor(null);
  }, [current, view, clusters]);
  useEffect(() => { containerRef.current?.querySelectorAll('.tl-star').forEach((el) => el.classList.toggle('is-selected', (el as HTMLElement).dataset.seed === current?.seed.key)); }, [current, clusters]);

  /* the opening height, where the whole world fits the frame, is also the furthest zoom-out */
  const fit = fitAltitude(dimensions.width, dimensions.height);
  const clampAlt = useCallback((a: number) => Math.min(fit, Math.max(ALT.min, a)), [fit]);
  /** every programmatic camera move: animated (a jump with reduced motion); the stars re-cluster once it lands */
  const flyTo = useCallback((pov: { lat?: number; lng?: number; altitude: number }, ms: number) => {
    const g = globeRef.current; if (!g) return;
    const d = reduceMotion() ? 0 : ms;
    aimRef.current = pov.altitude; setAim(pov.altitude); flyingUntil.current = performance.now() + d + 50;
    g.pointOfView(pov, d);   // lat/lng left out = kept (globe.gl merges with the current point of view)
    window.setTimeout(measure, d + 80);
  }, [measure]);
  /** turn the globe to a point at the CURRENT zoom (a tap or a city pick never zooms in or out) */
  const turnTo = useCallback((lat: number, lng: number, ms = 900) => { flyTo({ lat, lng, altitude: clampAlt(aimRef.current) }, ms); }, [flyTo, clampAlt]);
  /** + / −: toward the centre of the view, stepping from where the camera is heading */
  const zoomBy = useCallback((f: number) => {
    const next = clampAlt(aimRef.current * f);
    if (Math.abs(next - aimRef.current) > 1e-6) flyTo({ altitude: next }, ALT.ms);
  }, [flyTo, clampAlt]);
  const resetView = useCallback(() => flyTo({ ...OPEN, altitude: fit }, 900), [flyTo, fit]);
  // the frame changed size (window resize, phone rotation): fully zoomed out stays fully zoomed out (the whole
  // world in view); zoomed in stays zoomed in, within the new limits. The pinch's limits follow.
  const lastFit = useRef(fit);
  useEffect(() => {
    if (!ready) return; const g = globeRef.current; const old = lastFit.current; lastFit.current = fit;
    const c = g?.controls(); if (c) { c.minDistance = 100 * (1 + ALT.min); c.maxDistance = 100 * (1 + fit) + 0.01; }
    const pov = g?.pointOfView(); if (!pov) return;
    const target = aimRef.current >= old - 0.005 ? fit : clampAlt(aimRef.current);
    if (Math.abs(pov.altitude - target) > 0.005) { aimRef.current = target; setAim(target); g.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: target }, 0); }
  }, [fit, ready, clampAlt]);
  // the plain wheel scrolls the PAGE: stop it on the way down, before OrbitControls (on the canvas) sees it.
  // A trackpad pinch arrives as ctrl + wheel and goes through to zoom the globe, as on Google Maps.
  useEffect(() => {
    const wrap = containerRef.current; if (!wrap) return;
    const onWheel = (e: WheelEvent) => { if (!e.ctrlKey) e.stopPropagation(); };
    wrap.addEventListener('wheel', onWheel, { capture: true });
    return () => wrap.removeEventListener('wheel', onWheel, { capture: true });
  }, []);
  const atMin = aim <= ALT.min + 0.005, atMax = aim >= fit - 0.005;
  const atOpening = atMax && Math.abs(view.lat - OPEN.lat) < 0.5 && Math.abs(((view.lng - OPEN.lng + 540) % 360) - 180) < 0.5;

  const handleClick = useCallback((c: Cluster) => {
    setSelected({ seed: c.seed.key, cities: c.cities.map((x) => x.key) });
    turnTo(c.lat, c.lng);
  }, [turnTo]);
  clickRef.current = handleClick;
  const buildStar = useCallback((d: object) => createStarMarker(d as Cluster, (c, el) => clickRef.current(c, el)), []);   // stable: a new identity makes three-globe rebuild every marker
  // clearing = the selection goes; the globe stays where you left it pointed
  const clear = useCallback(() => { setSelected(null); }, []);
  const lastReset = useRef(reset);
  useEffect(() => { if (reset !== lastReset.current) { lastReset.current = reset; clear(); } }, [reset, clear]);

  const selectCity = (key: string) => {
    if (!key) { clear(); return; }
    const city = cities.find((c) => c.key === key); if (!city) return;
    const cluster = { key: city.key, seed: city, cities: [city], lat: city.lat, lng: city.lng, count: city.people.length };
    if (!ready || failed) { lastSel.current = cluster; reported.current = `${cluster.key}#${cluster.count}`; onPick?.(cluster); }
    setSelected({ seed: city.key, cities: [city.key] }); turnTo(city.lat, city.lng);
  };
  const popStyle = anchor ? { left: Math.max(Math.min(dimensions.width / 2, 200), Math.min(dimensions.width - Math.min(dimensions.width / 2, 200), anchor.x)), top: Math.min(dimensions.height - 16, Math.max(230, anchor.y)) } : undefined;
  const person = current?.count === 1 ? current.cities[0].people[0] : null;

  return (
    <div className="portal-globe">
    <div className="portal-globe-tools">
      <label className="t-fine text-muted" htmlFor="globe-city">FIND A CITY</label>
      <select id="globe-city" className="portal-input portal-select t-caption" value={selected?.seed ?? ''} onChange={(e) => selectCity(e.target.value)}>
        <option value="">All locations</option>
        {[...cities].sort((a,b) => a.name.localeCompare(b.name)).map((c) => <option key={c.key} value={c.key}>{c.name}{c.region ? `, ${c.region}` : ''} · {c.people.length}</option>)}
      </select>
    </div>
    <div ref={containerRef} className="portal-globe-wrap" data-ready={ready && !failed} data-open={current ? (person ? 'person' : 'place') : ''} data-view={`${view.kmPerPx.toFixed(2)} km/px · alt ${altitude.toFixed(2)} · ${view.lat.toFixed(0)},${view.lng.toFixed(0)} · #${view.n}`}>   {/* data-view: the settled camera, for probes */}
      <div className="portal-globe-canvas">
      {Globe && !failed && (
        <GlobeBoundary onError={() => setFailed(true)}><Globe
          ref={globeRef}
          onGlobeReady={() => {
            const open = fitAltitude(dimensions.width, dimensions.height);
            globeRef.current?.pointOfView({ ...OPEN, altitude: open }, 0); aimRef.current = open; setAim(open);
            // zoom stays ON for the two-finger pinch (and the trackpad's ctrl + wheel), clamped to the buttons'
            // limits; the plain wheel never reaches the controls (capture listener above). Distance = R(100)·(1 + alt).
            const c = globeRef.current?.controls(); if (c) { c.enableZoom = true; c.minDistance = 100 * (1 + ALT.min); c.maxDistance = 100 * (1 + open) + 0.01; c.addEventListener('change', onCameraChange); c.addEventListener('end', measure); }   // re-cluster when a drag, pinch or fly settles
            setReady(true); measure();
          }}
          width={dimensions.width}
          height={dimensions.height}
          globeImageUrl="/maps/alumni-earth.png"
          animateIn={false}
          backgroundColor="rgba(0,0,0,0)"
          htmlElementsData={clusters}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.02}
          htmlTransitionDuration={0}
          htmlElement={buildStar}
          atmosphereColor="#8297aa"
          atmosphereAltitude={0.10}
        /></GlobeBoundary>
      )}
      </div>
      {(!ready || failed) && <div className="portal-globe-status" role="status">
        <p className="t-caption">{failed ? 'The 3D globe is unavailable on this device.' : 'Loading the globe…'}</p>
        {failed && <p className="t-caption text-muted">Choose a city above or use the directory below to find members.</p>}
      </div>}

      {current && anchor && person && (
        /* pin card (Charlotte, 2026-09-14): name · company + role · location · TL cohort · link to profile · small × */
        <div className="portal-panel portal-globe-pop" style={popStyle} role="dialog" aria-label={person.full_name}>
          <button type="button" className="portal-globe-x" aria-label="Close" onClick={clear}>×</button>
          <h3 className="t-name m-0">{person.full_name}</h3>
          <p className="t-caption text-muted m-0">{person.current_title}{person.current_company ? ` · ${person.current_company}` : ''}</p>
          {person.city && <p className="t-fine text-muted m-0">{person.city}{person.region ? `, ${person.region}` : ''}</p>}
          {person.cohort && <p className="t-fine m-0 portal-globe-cohort">TL {person.cohort}</p>}
          <a href={profileHref(person)} className="t-label portal-linklike portal-globe-view">VIEW PROFILE →</a>
        </div>
      )}
      {current && anchor && !person && (
        /* place card: the star you tapped, named — city · how many cities and people · a way to the list */
        <div className="portal-panel portal-globe-pop portal-globe-place" style={popStyle} role="dialog" aria-label={`${clusterLabel(current)} · ${current.count} people`}>
          <button type="button" className="portal-globe-x" aria-label="Clear the selection" onClick={clear}>×</button>
          <h3 className="t-name m-0">{upper(current.seed.name)}{current.seed.region ? `, ${upper(current.seed.region)}` : ''}</h3>
          <p className="t-fine text-muted m-0 portal-globe-place-sub">
            <b className="text-ink">{current.count}</b> {current.count === 1 ? 'PERSON' : 'PEOPLE'}
            {current.cities.length > 1 && <> · WITH {upper(current.cities.slice(1, 4).map((c) => c.name).join(', '))}{current.cities.length > 4 ? ` +${current.cities.length - 4} MORE` : ''}</>}
          </p>
          {onSeeList && <button type="button" className="t-label portal-linklike portal-globe-view" onClick={onSeeList}>SEE WHO'S HERE ↓</button>}
        </div>
      )}

      {ready && !failed && (
        /* zoom (Google Maps / Mapbox: a small stack in a corner). It moves to the top corner while a card sits low
           in the frame (always on phones, where the card is a bottom sheet). aria-disabled, not disabled: a
           keyboard user who zooms to a limit keeps focus on the button. */
        <div className={`portal-globe-zoom${current && anchor && anchor.y > dimensions.height / 2 ? ' is-top' : ''}`} role="group" aria-label="Zoom the globe">
          <button type="button" aria-label="Zoom in" aria-disabled={atMin} onClick={() => { if (!atMin) zoomBy(ALT.step); }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v11M2.5 8h11" /></svg>
          </button>
          <button type="button" aria-label="Zoom out" aria-disabled={atMax} onClick={() => { if (!atMax) zoomBy(1 / ALT.step); }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h11" /></svg>
          </button>
          <button type="button" aria-label="Reset view" aria-disabled={atOpening} onClick={() => { if (!atOpening) resetView(); }}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.3 9.6A5 5 0 1 0 4.2 4.4" /><path d="M4.4 1.6v3h3" /></svg>
          </button>
        </div>
      )}
      <div className="t-label text-muted portal-globe-count">{pins.length} ALUMNI · {cities.length} {cities.length === 1 ? 'CITY' : 'CITIES'}</div>
    </div>
    </div>
  );
}
