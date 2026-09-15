/**
 * Alumni portal › the globe. Charlotte Chang's GlobeMap from the MVP (troylabs-alumni-network) — real
 * pins at real coordinates, drag to rotate, click a pin for the person — with one structural change
 * (Bryan, 2026-09-15): people are grouped into ONE STAR PER CITY, and cities whose stars would overlap
 * at the current zoom merge into a bigger star with a count (see lib/portal/cluster.ts for the rules
 * and the prior art). Clicking a merged star zooms until it splits; clicking a city opens the list of
 * people there; a city of one still shows Charlotte's card. Zoom is by the + / − buttons: the wheel
 * scrolls the page (OrbitControls hijacked it in the MVP).
 * DESIGN PREVIEW: fed placeholder people from the page; nothing is wired to data.
 */
import { useEffect, useMemo, useRef, useState, useCallback, type ComponentType } from 'react';
import { clusterCities, clusterLabel, expansionKmPerPx, groupByCity, type City, type Cluster, type GlobePerson } from '../../lib/portal/cluster';

export type GlobePin = GlobePerson;

const ALT = { start: 1.9, min: 0.25, max: 3, step: 1.5, ladder: [3, 2.4, 1.9, 1.4, 1.0, 0.7, 0.5, 0.35, 0.25] };
const tier = (n: number) => (n <= 1 ? 1 : n < 10 ? 2 : n < 50 ? 3 : 4);
const upper = (s: string) => s.toUpperCase();

function createStarMarker(c: Cluster, onClick: (c: Cluster, el: HTMLElement) => void) {
  const el = document.createElement('button');
  el.type = 'button';
  const label = c.count === 1 ? c.cities[0].people[0].full_name : `${clusterLabel(c)} · ${c.count}`;
  el.title = label; el.setAttribute('aria-label', label); el.dataset.count = String(c.count); el.dataset.cities = String(c.cities.length); el.dataset.key = c.key;
  el.className = `tl-star tl-star-${tier(c.count)}`;
  el.innerHTML = `
    <span class="tl-star-box">
      <span class="tl-star-glow"></span>
      <span class="tl-pin-name">${label}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#ff4a2a" stroke="#ffd56a" stroke-width="1.4" d="M12 2.2l2.85 6.55 7.1.65-5.35 4.7 1.7 6.9L12 17.5l-6.3 3.5 1.7-6.9L2.05 9.4l7.1-.65L12 2.2z" />
      </svg>
      ${c.count > 1 ? `<span class="tl-star-n" aria-hidden="true">${c.count}</span>` : ''}
    </span>`;
  // pointer-events:auto is required: the library's marker container is pointer-events:none, and children
  // inherit it — without this, hover and click never reach the pin (measured: elementFromPoint at the pin
  // centre returned the canvas). This also means pin clicks did not work in the MVP as deployed.
  el.style.pointerEvents = 'auto';
  el.addEventListener('click', (event) => { event.stopPropagation(); onClick(c, el); });
  return el;
}

type Open = { kind: 'person'; person: GlobePerson; key: string; anchor: { x: number; y: number } } | { kind: 'list'; cluster: Cluster } | null;

export default function AlumniGlobe({ pins, onRefresh, profileHref = (p) => `/alumni-portal/members/${p.id}` }: { pins: GlobePerson[]; onRefresh?: () => void; profileHref?: (p: GlobePerson) => string }) {
  const [Globe, setGlobe] = useState<ComponentType<any> | null>(null);
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [altitude, setAltitude] = useState(ALT.start);
  const [view, setView] = useState({ kmPerPx: 30, lat: 30, lng: -80, alt: ALT.start, n: 0 });   // the settled camera; n bumps on every settle so clusters re-project
  const [programs, setPrograms] = useState<string[]>([]);
  const [open, setOpen] = useState<Open>(null);
  const [listQ, setListQ] = useState('');
  const clickRef = useRef<(c: Cluster, el: HTMLElement) => void>(() => undefined);
  const clusterCache = useRef(new Map<string, Cluster>());

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

  // the page's PROGRAM chips (toggled by portal-ui.ts) filter the people on the globe
  useEffect(() => {
    const read = () => setPrograms([...document.querySelectorAll<HTMLElement>('[data-globe-filters] .portal-chip[aria-pressed="true"]')].map((c) => c.textContent!.trim()));
    const onClick = (e: Event) => { if ((e.target as HTMLElement).closest('[data-globe-filters] .portal-chip')) setTimeout(read, 0); };
    document.addEventListener('click', onClick); read();
    return () => document.removeEventListener('click', onClick);
  }, []);

  /* Runs when the camera SETTLES (debounced controls 'change' + 'end' — not every frame, so stars don't
     reshuffle mid-drag). Measures km per screen pixel at the globe's centre from the library's own
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

  const shown = useMemo(() => (programs.length ? pins.filter((p) => p.programs?.some((x) => programs.includes(x))) : pins), [pins, programs]);
  const cities = useMemo(() => groupByCity(shown), [shown]);
  const clusters = useMemo(() => {
    // screen-space distances from the globe's real projection; a city on the far side never merges
    // "on the near side" uses the same test the library uses to decide whether to DRAW a star (three-globe's
    // isBehindGlobe: the star's 3D position against the camera's visible cone, at the stars' own altitude).
    // A plain acos(R/D) horizon differed from it by a few degrees, and a star drawn in that band stayed
    // unmerged and overlapped its neighbour (Boston at 73.6° from centre, measured).
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
    // reuse cluster objects whose membership didn't change, so the library keeps their DOM nodes
    const fresh = clusterCities(cities, distPx); const cache = clusterCache.current; const next = new Map<string, Cluster>();
    const out = fresh.map((c) => { const prev = cache.get(c.key); const keep = prev && prev.count === c.count ? prev : c; next.set(c.key, keep); return keep; });
    clusterCache.current = next; return out;
  }, [cities, view]);

  const anchorOf = (el: Element) => { const wrap = containerRef.current!.getBoundingClientRect(); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - wrap.left, y: r.top - wrap.top }; };
  // keep the person card on its pin: after the fly-in, after a drag, after a re-cluster (the pin's element
  // is looked up by key, since a re-cluster can rebuild it)
  useEffect(() => {
    if (open?.kind !== 'person') return;
    const el = containerRef.current?.querySelector(`.tl-star[data-key="${CSS.escape(open.key)}"]`);
    if (el) { const a = anchorOf(el); if (Math.abs(a.x - open.anchor.x) > 0.5 || Math.abs(a.y - open.anchor.y) > 0.5) setOpen({ ...open, anchor: a }); }
    else setOpen(null);   // its city merged into a bigger star — the card no longer has a pin to sit on
  }, [view, clusters, open]);
  const flyTo = useCallback((lat: number, lng: number, alt: number, ms = 900) => { globeRef.current?.pointOfView({ lat, lng, altitude: Math.min(ALT.max, Math.max(ALT.min, alt)) }, ms); }, []);
  const zoomBy = (f: number) => { const pov = globeRef.current?.pointOfView(); if (pov) flyTo(pov.lat, pov.lng, pov.altitude * f, 500); };

  const handleClick = useCallback((c: Cluster, el: HTMLElement) => {
    setListQ('');
    if (c.count === 1) {
      // Charlotte's card sits above the pin you clicked, and follows it: the fly-in moves the pin, and so
      // does any later drag (the anchor is re-read from the pin's element whenever the camera settles).
      const person = c.cities[0].people[0];
      setOpen({ kind: 'person', person, key: c.key, anchor: anchorOf(el) });
      flyTo(person.lat, person.lng, Math.min(altitude, 1.4));
      return;
    }
    if (c.cities.length > 1) {
      // merged star: fly to the coarsest zoom where it falls apart (supercluster's expansion zoom).
      // km-per-px scales with camera distance, i.e. with (1 + altitude).
      const ladder = ALT.ladder.filter((a) => a < altitude - 0.01).map((a) => (view.kmPerPx * (1 + a)) / (1 + altitude));
      const k = expansionKmPerPx(c, ladder);
      if (k !== null) { setOpen(null); flyTo(c.lat, c.lng, ((k / view.kmPerPx) * (1 + altitude)) - 1); return; }
    }
    setOpen({ kind: 'list', cluster: c });
    flyTo(c.lat, c.lng, altitude);
  }, [altitude, view, flyTo]);
  clickRef.current = handleClick;

  // one stable function for the life of the component: three-globe drops and rebuilds EVERY marker when
  // this prop's identity changes (`changedProps.htmlElement → dataMapper.clear()`), so an inline arrow
  // here — as in the MVP — meant a full rebuild on each render, restarting every pulse and, mid-coast,
  // racing the re-cluster (a duplicate Boston star was caught once).
  const buildStar = useCallback((d: object) => createStarMarker(d as Cluster, (c, el) => clickRef.current(c, el)), []);

  const list = open?.kind === 'list' ? open.cluster : null;
  const q = listQ.trim().toLowerCase();
  const rows = (people: GlobePerson[]) => people.filter((p) => !q || `${p.full_name} ${p.current_title ?? ''} ${p.current_company ?? ''} ${p.cohort ?? ''}`.toLowerCase().includes(q));

  return (
    <div ref={containerRef} className="portal-globe-wrap" data-open={open?.kind ?? ''} data-view={`${view.kmPerPx.toFixed(2)} km/px · alt ${altitude.toFixed(2)} · ${view.lat.toFixed(0)},${view.lng.toFixed(0)} · #${view.n}`}>   {/* data-view: the settled camera, for probes */}
      {Globe && (
        <Globe
          ref={globeRef}
          onGlobeReady={() => {
            globeRef.current?.pointOfView({ lat: 30, lng: -80, altitude: ALT.start }, 0);   // opened on the Americas where most alumni are; both US coasts well inside the disc, London on the edge
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

      {open?.kind === 'person' && (
        /* pin card (Charlotte, 2026-09-14): name · company + role · location · TL cohort · link to profile · small × in the corner */
        <div className="portal-panel portal-globe-pop" style={{ left: open.anchor.x, top: open.anchor.y }} role="dialog" aria-label={open.person.full_name}>
          <button type="button" className="portal-globe-x" aria-label="Close" onClick={() => setOpen(null)}>×</button>
          <h3 className="t-name m-0">{open.person.full_name}</h3>
          <p className="t-caption text-muted m-0">{open.person.current_title}{open.person.current_company ? ` · ${open.person.current_company}` : ''}</p>
          {open.person.city && <p className="t-fine text-muted m-0">{open.person.city}{open.person.region ? `, ${open.person.region}` : ''}</p>}
          {open.person.cohort && <p className="t-fine m-0 portal-globe-cohort">TL {open.person.cohort}</p>}
          <a href={profileHref(open.person)} className="t-label portal-linklike portal-globe-view">VIEW PROFILE →</a>
        </div>
      )}

      {list && (
        /* city list: everyone at this star. Grouped by city when a merged star can't be split any further. */
        <aside className="portal-panel portal-globe-list" role="dialog" aria-label={`${clusterLabel(list)} · ${list.count} alumni`}>
          <button type="button" className="portal-globe-x" aria-label="Close" onClick={() => setOpen(null)}>×</button>
          <h3 className="t-name m-0">{upper(list.seed.name)}{list.seed.region ? `, ${upper(list.seed.region)}` : ''}</h3>
          <p className="t-fine text-muted m-0 portal-globe-list-sub">{list.count} ALUMNI{list.cities.length > 1 ? ` · WITH ${upper(list.cities.slice(1, 4).map((c) => c.name).join(', '))}${list.cities.length > 4 ? ` +${list.cities.length - 4} MORE` : ''}` : ''}</p>
          {list.count > 8 && <input type="search" className="t-caption portal-input is-wide portal-globe-list-q" placeholder="Filter by name, company or cohort" aria-label="Filter this list" value={listQ} onChange={(e) => setListQ(e.target.value)} />}
          <div className="portal-globe-list-scroll">
            {list.cities.map((city) => { const r = rows(city.people); if (!r.length) return null; return (
              <section key={city.key}>
                {list.cities.length > 1 && <h4 className="t-fine text-muted m-0 portal-globe-list-city">{upper(city.name)}{city.region ? `, ${upper(city.region)}` : ''} · {city.people.length}</h4>}
                <ul className="m-0 p-0 list-none">
                  {r.map((p, i) => (
                    <li key={`${p.id}-${i}`}>
                      <a href={profileHref(p)} className="portal-globe-row no-underline">
                        <span className="t-caption text-ink portal-globe-row-name">{p.full_name}</span>
                        <span className="t-fine text-muted portal-globe-row-role">{p.current_title}{p.current_company ? ` · ${p.current_company}` : ''}</span>
                        {p.cohort && <span className="t-fine portal-globe-row-cohort">{p.cohort}</span>}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ); })}
            {q && list.cities.every((c) => rows(c.people).length === 0) && <p className="t-fine text-muted m-0" style={{ padding: '12px 0' }}>Nobody here matches “{listQ.trim()}”.</p>}
          </div>
        </aside>
      )}

      <div className="portal-globe-zoom" role="group" aria-label="Zoom">
        <button type="button" className="t-label" aria-label="Zoom in" onClick={() => zoomBy(1 / ALT.step)} disabled={altitude <= ALT.min + 0.01}>+</button>
        <button type="button" className="t-label" aria-label="Zoom out" onClick={() => zoomBy(ALT.step)} disabled={altitude >= ALT.max - 0.01}>−</button>
      </div>
      <div className="t-label text-muted portal-globe-count">{shown.length} ALUMNI · {cities.length} {cities.length === 1 ? 'CITY' : 'CITIES'}{programs.length ? ` · ${programs.join(' + ')}` : ''}</div>
    </div>
  );
}
