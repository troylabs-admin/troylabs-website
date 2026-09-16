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
 * Zoom is by the + / − buttons: the wheel scrolls the page (OrbitControls hijacked it in the MVP).
 * DESIGN PREVIEW: fed placeholder people from the page; nothing is wired to data.
 */
import React, { useEffect, useMemo, useRef, useState, useCallback, type ComponentType } from 'react';
import { clusterCities, clusterLabel, expansionKmPerPx, groupByCity, type City, type Cluster, type GlobePerson } from '../../lib/portal/cluster';
import { tickNumber } from '../../lib/portal/tick';

export type GlobePin = GlobePerson;
export type { Cluster } from '../../lib/portal/cluster';

const ALT = { start: 1.9, min: 0.25, max: 3, step: 1.5, ladder: [3, 2.4, 1.9, 1.4, 1.0, 0.7, 0.5, 0.35, 0.25] };
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
  el.className = `tl-star tl-star-${tier(c.count)}`;
}
function createStarMarker(c: Cluster, onClick: (c: Cluster, el: HTMLElement) => void) {
  const el = document.createElement('button');
  el.type = 'button';
  decorateStar(el, c);
  el.innerHTML = `
    <span class="tl-star-box">
      <span class="tl-star-glow"></span>
      <span class="tl-pin-name">${starLabel(c)}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#ff4a2a" stroke="#ffd56a" stroke-width="1.4" d="M12 2.2l2.85 6.55 7.1.65-5.35 4.7 1.7 6.9L12 17.5l-6.3 3.5 1.7-6.9L2.05 9.4l7.1-.65L12 2.2z" />
      </svg>
      <span class="tl-star-n" aria-hidden="true">${c.count}</span>
    </span>`;
  // pointer-events:auto is required: the library's marker container is pointer-events:none, and children
  // inherit it — without this, hover and click never reach the pin (measured: elementFromPoint at the pin
  // centre returned the canvas). This also means pin clicks did not work in the MVP as deployed.
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
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [altitude, setAltitude] = useState(ALT.start);
  const [view, setView] = useState({ kmPerPx: 30, lat: 30, lng: -80, alt: ALT.start, n: 0 });   // the settled camera; n bumps on every settle so clusters re-project
  const [selected, setSelected] = useState<{ seed: string; cities: string[] } | null>(null);   // the tapped star: its anchor city and the cities under it
  const lastSel = useRef<Cluster | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const clickRef = useRef<(c: Cluster, el: HTMLElement) => void>(() => undefined);
  const clusterCache = useRef(new Map<string, Cluster>());
  const reported = useRef<string>('');

  useEffect(() => { import('react-globe.gl').then((m) => setGlobe(() => m.default)); }, []);   // WebGL: client only

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
    updateSize(); window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
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
      if (prev.count !== c.count || prev.key !== c.key) { (prev as any).__from = prev.count; prev.count = c.count; prev.cities = c.cities; prev.key = c.key; }
      next.set(c.seed.key, prev); return prev; });
    clusterCache.current = next; return out;
  }, [cities, view]);

  // numbers tick, they don't jump: a star whose head-count changed counts to its new value
  useEffect(() => {
    for (const c of clusters) {
      const from = (c as any).__from as number | undefined; if (from === undefined) continue; delete (c as any).__from;
      const el = containerRef.current?.querySelector<HTMLElement>(`.tl-star[data-seed="${CSS.escape(c.seed.key)}"]`); if (!el) continue;
      decorateStar(el, c); const name = el.querySelector('.tl-pin-name'); if (name) name.textContent = starLabel(c);
      const n = el.querySelector<HTMLElement>('.tl-star-n'); if (n) tickNumber(n, from, c.count);
    }
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
    const el = containerRef.current?.querySelector(`.tl-star[data-seed="${CSS.escape(current.seed.key)}"]`);
    if (el) { const a = anchorOf(el); setAnchor((old) => (old && Math.abs(a.x - old.x) < 0.5 && Math.abs(a.y - old.y) < 0.5 ? old : a)); }
  }, [current, view, clusters]);
  useEffect(() => { containerRef.current?.querySelectorAll('.tl-star').forEach((el) => el.classList.toggle('is-selected', (el as HTMLElement).dataset.seed === current?.seed.key)); }, [current, clusters]);

  const flyTo = useCallback((lat: number, lng: number, alt: number, ms = 900) => { globeRef.current?.pointOfView({ lat, lng, altitude: Math.min(ALT.max, Math.max(ALT.min, alt)) }, ms); }, []);
  const zoomBy = (f: number) => { const pov = globeRef.current?.pointOfView(); if (pov) flyTo(pov.lat, pov.lng, pov.altitude * f, 500); };

  const handleClick = useCallback((c: Cluster) => {
    // zoom in on what you tapped: a bunched star to the coarsest zoom where it splits (supercluster's
    // expansion zoom; km-per-px scales with camera distance, i.e. with 1 + altitude), a lone city a bit closer
    let target = Math.max(ALT.min, Math.min(altitude, 1.0) * 0.7);
    if (c.cities.length > 1) {
      const ladder = ALT.ladder.filter((a) => a < altitude - 0.01).map((a) => (view.kmPerPx * (1 + a)) / (1 + altitude));
      const k = expansionKmPerPx(c, ladder);
      if (k !== null) target = (k / view.kmPerPx) * (1 + altitude) - 1;
    }
    setSelected({ seed: c.seed.key, cities: c.cities.map((x) => x.key) });
    flyTo(c.lat, c.lng, target);
  }, [altitude, view, flyTo]);
  clickRef.current = handleClick;
  const buildStar = useCallback((d: object) => createStarMarker(d as Cluster, (c, el) => clickRef.current(c, el)), []);   // stable: a new identity makes three-globe rebuild every marker
  // clearing = the selection goes and the globe returns to its opening size, where you left it pointed
  const clear = useCallback(() => { setSelected(null); const pov = globeRef.current?.pointOfView(); if (pov) flyTo(pov.lat, pov.lng, fitAltitude(dimensions.width, dimensions.height)); }, [flyTo, dimensions]);
  const lastReset = useRef(reset);
  useEffect(() => { if (reset !== lastReset.current) { lastReset.current = reset; clear(); } }, [reset, clear]);

  const person = current?.count === 1 ? current.cities[0].people[0] : null;

  return (
    <div className="portal-globe">
    <div ref={containerRef} className="portal-globe-wrap" data-open={current ? (person ? 'person' : 'place') : ''} data-view={`${view.kmPerPx.toFixed(2)} km/px · alt ${altitude.toFixed(2)} · ${view.lat.toFixed(0)},${view.lng.toFixed(0)} · #${view.n}`}>   {/* data-view: the settled camera, for probes */}
      <div className="portal-globe-canvas">
      {Globe && (
        <Globe
          ref={globeRef}
          onGlobeReady={() => {
            globeRef.current?.pointOfView({ lat: 30, lng: -80, altitude: fitAltitude(dimensions.width, dimensions.height) }, 0);   // opened on the Americas where most alumni are
            const c = globeRef.current?.controls(); if (c) { c.enableZoom = false; c.addEventListener('change', onCameraChange); c.addEventListener('end', measure); }   // wheel scrolls the PAGE; re-cluster when a drag or fly settles
            measure();
          }}
          width={dimensions.width}
          height={dimensions.height}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          backgroundColor="rgba(0,0,0,0)"
          htmlElementsData={clusters}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.02}
          htmlTransitionDuration={0}
          htmlElement={buildStar}
          atmosphereColor="#c9a84c"
          atmosphereAltitude={0.15}
        />
      )}
      </div>

      {current && anchor && person && (
        /* pin card (Charlotte, 2026-09-14): name · company + role · location · TL cohort · link to profile · small × */
        <div className="portal-panel portal-globe-pop" style={{ left: anchor.x, top: anchor.y }} role="dialog" aria-label={person.full_name}>
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
        <div className="portal-panel portal-globe-pop portal-globe-place" style={{ left: anchor.x, top: anchor.y }} role="dialog" aria-label={`${clusterLabel(current)} · ${current.count} people`}>
          <button type="button" className="portal-globe-x" aria-label="Clear the selection" onClick={clear}>×</button>
          <h3 className="t-name m-0">{upper(current.seed.name)}{current.seed.region ? `, ${upper(current.seed.region)}` : ''}</h3>
          <p className="t-fine text-muted m-0 portal-globe-place-sub">
            <b className="text-ink">{current.count}</b> {current.count === 1 ? 'PERSON' : 'PEOPLE'}
            {current.cities.length > 1 && <> · WITH {upper(current.cities.slice(1, 4).map((c) => c.name).join(', '))}{current.cities.length > 4 ? ` +${current.cities.length - 4} MORE` : ''}</>}
          </p>
          {onSeeList && <button type="button" className="t-label portal-linklike portal-globe-view" onClick={onSeeList}>SEE WHO'S HERE ↓</button>}
        </div>
      )}

      <div className="portal-globe-zoom" role="group" aria-label="Zoom">
        <button type="button" className="t-label" aria-label="Zoom in" onClick={() => zoomBy(1 / ALT.step)} disabled={altitude <= ALT.min + 0.01}>+</button>
        <button type="button" className="t-label" aria-label="Zoom out" onClick={() => zoomBy(ALT.step)} disabled={altitude >= ALT.max - 0.01}>−</button>
      </div>
      <div className="t-label text-muted portal-globe-count">{pins.length} ALUMNI · {cities.length} {cities.length === 1 ? 'CITY' : 'CITIES'}</div>
    </div>
    </div>
  );
}
