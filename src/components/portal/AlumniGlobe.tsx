/**
 * Alumni portal › the globe. Charlotte Chang's GlobeMap from the MVP (troylabs-alumni-network), ported
 * as-is: real pins at real coordinates, drag to rotate, zoom, click a pin for the person. Used unchanged
 * until the rest of the portal is wired; restyling it is a later pass (Bryan, 2026-09-14). Only the
 * Next.js plumbing changed: `dynamic()` → a client-side import, `Link` → <a>, the profile fetch → a
 * callback prop, and the popup card drawn with the portal's own classes.
 * DESIGN PREVIEW: fed placeholder pins from the page; nothing is wired to data.
 */
import { useEffect, useRef, useState, useCallback, type ComponentType } from 'react';

export interface GlobePin { id: string; full_name: string; lat: number; lng: number; current_title?: string | null; current_company?: string | null; city?: string | null; region?: string | null }

function createStarMarker(pin: GlobePin, onClick: (pin: GlobePin) => void) {
  const el = document.createElement('button');
  el.type = 'button';
  el.title = pin.full_name;
  el.setAttribute('aria-label', pin.full_name);
  el.innerHTML = `
    <span style="position:relative;display:block;width:34px;height:34px;">
      <span style="position:absolute;inset:4px;border-radius:999px;background:radial-gradient(circle, rgba(226,58,31,0.55) 0%, rgba(226,58,31,0) 70%);animation:tl-star-pulse 1.8s ease-in-out infinite;"></span>
      <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" style="position:relative;z-index:1;">
        <path fill="#ff4a2a" stroke="#ffd56a" stroke-width="1.4" d="M12 2.2l2.85 6.55 7.1.65-5.35 4.7 1.7 6.9L12 17.5l-6.3 3.5 1.7-6.9L2.05 9.4l7.1-.65L12 2.2z" />
      </svg>
    </span>`;
  if (!document.getElementById('tl-star-pulse-style')) {
    const style = document.createElement('style');
    style.id = 'tl-star-pulse-style';
    style.textContent = `@keyframes tl-star-pulse { 0%, 100% { transform: scale(0.85); opacity: 0.55; } 50% { transform: scale(1.25); opacity: 1; } }`;
    document.head.appendChild(style);
  }
  el.style.cssText = 'background:transparent;border:0;padding:0;cursor:pointer;transform:translate(-50%,-50%);filter:drop-shadow(0 0 10px rgba(255,74,42,0.95)) drop-shadow(0 0 18px rgba(255,213,106,0.55));line-height:0;z-index:2';
  el.addEventListener('click', (event) => { event.stopPropagation(); onClick(pin); });
  return el;
}

export default function AlumniGlobe({ pins, profileHref = (p) => `/alumni-portal/members/${p.id}` }: { pins: GlobePin[]; profileHref?: (p: GlobePin) => string }) {
  const [Globe, setGlobe] = useState<ComponentType<any> | null>(null);
  const globeRef = useRef<{ pointOfView: (pov: { lat?: number; lng?: number; altitude?: number }, ms?: number) => void; controls: () => { enableZoom: boolean; zoomSpeed: number } } | null>(null);
  const [selected, setSelected] = useState<GlobePin | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const clickHandlerRef = useRef<(pin: GlobePin) => void>(() => undefined);

  useEffect(() => { import('react-globe.gl').then((m) => setGlobe(() => m.default)); }, []);   // WebGL: client only

  useEffect(() => {
    const updateSize = () => { if (containerRef.current) setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight }); };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handlePinClick = useCallback((pin: GlobePin) => {
    setSelected(pin);
    globeRef.current?.pointOfView({ lat: pin.lat, lng: pin.lng, altitude: 1.5 }, 1000);
  }, []);
  clickHandlerRef.current = handlePinClick;

  return (
    <div ref={containerRef} className="portal-globe-wrap">
      {Globe && (
        <Globe
          ref={globeRef}
          onGlobeReady={() => {
            globeRef.current?.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 0);
            // The wheel scrolls the PAGE. OrbitControls binds it to zoom by default, so scrolling past the
            // globe blew it up to fill the viewport on the way up and shrank it to a dot on the way down
            // (Bryan, 2026-09-14). Drag still rotates; a pin click still flies in via pointOfView.
            const c = globeRef.current?.controls(); if (c) c.enableZoom = false;
          }}
          width={dimensions.width}
          height={dimensions.height}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          backgroundColor="rgba(0,0,0,0)"
          htmlElementsData={pins}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.02}
          htmlElement={(d: object) => createStarMarker(d as GlobePin, (pin) => clickHandlerRef.current(pin))}
          atmosphereColor="#c9a84c"
          atmosphereAltitude={0.15}
        />
      )}
      {selected && (
        <div className="portal-panel portal-globe-pop">
          <h3 className="t-name m-0">{selected.full_name}</h3>
          <p className="t-caption text-muted m-0">{selected.current_title}{selected.current_company ? ` · ${selected.current_company}` : ''}</p>
          {selected.city && <p className="t-fine text-muted m-0">{selected.city}{selected.region ? `, ${selected.region}` : ''}</p>}
          <div className="portal-inline" style={{ marginTop: 'calc(10 * var(--u))' }}>
            <a href={profileHref(selected)} className="t-label portal-linklike" style={{ color: 'var(--color-orange)' }}>VIEW PROFILE →</a>
            <button type="button" className="t-label portal-linklike" onClick={() => setSelected(null)}>CLOSE</button>
          </div>
        </div>
      )}
      <div className="t-label text-muted portal-globe-count">{pins.length} ALUMNI ON MAP</div>
    </div>
  );
}
