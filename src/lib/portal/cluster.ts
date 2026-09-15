/**
 * Globe clustering. Two levels, both deterministic:
 *  1. CITY — everyone in the same city shares one star (people are geocoded by city, so their pins
 *     would sit on the exact same spot anyway). This is the unit Bryan asked for: "one star per city".
 *  2. CLUSTER — cities whose stars would overlap ON SCREEN at the current zoom are merged into one
 *     bigger star, seeded on the largest city so the star stays on land. Same idea as Mapbox's
 *     supercluster (greedy, radius in pixels — theirs defaults to 40 px) and Cesium's EntityCluster
 *     (screen-space pixelRange). Distances come from the globe's own screen projection, taken when the
 *     camera settles (not every frame) — so stars don't shuffle mid-drag, and perspective foreshortening
 *     near the edge is exact rather than approximated (a cos θ estimate under-merged by 2× at 40° off
 *     centre, measured).
 *  Some cities can never split on this globe: San Francisco and Oakland are 13 km apart, and even at
 *  the closest zoom one pixel is several km. Such a star opens a list grouped by city instead.
 * Click on a merged cluster flies to the zoom where it splits (supercluster's "expansion zoom");
 * click on a single city opens the list of people there.
 */
export interface GlobePerson { id: string; full_name: string; lat: number; lng: number; current_title?: string | null; current_company?: string | null; city?: string | null; region?: string | null; cohort?: string | null; programs?: string[] }
export interface City { key: string; name: string; region: string; lat: number; lng: number; people: GlobePerson[] }
export interface Cluster { key: string; lat: number; lng: number; count: number; cities: City[]; seed: City }

const EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** level 1: one entry per city (by name+region, falling back to rounded coordinates), biggest first */
export function groupByCity(people: GlobePerson[]): City[] {
  const map = new Map<string, City>();
  for (const p of people) {
    const key = p.city ? `${p.city}|${p.region ?? ''}`.toLowerCase() : `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
    let c = map.get(key);
    if (!c) { c = { key, name: p.city ?? `${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`, region: p.region ?? '', lat: p.lat, lng: p.lng, people: [] }; map.set(key, c); }
    c.people.push(p);
  }
  return [...map.values()].sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name));
}

/** star diameter in px by head-count — must match .tl-star-N in portal.css */
export const starPx = (n: number) => (n <= 1 ? 34 : n < 10 ? 40 : n < 50 ? 48 : 58);
/** on-screen distance between two cities' stars, in px; Infinity = never merge (e.g. one is on the far side) */
export type DistPx = (a: City, b: City) => number;

/** level 2: greedy merge, seeds taken biggest-first. Two stars merge when their centres would sit closer
 *  than the two half-diameters plus a 6 px gap (supercluster's fixed 40 px assumes same-size dots; ours
 *  grow with head-count). `distPx` is the caller's projection: the globe's real screen projection for the
 *  live view (perspective foreshortening near the edge included), or plain geodesic ÷ km-per-px when
 *  predicting how a star splits once it's flown to the centre. */
export function clusterCities(cities: City[], distPx: DistPx, gapPx = 6): Cluster[] {
  const taken = new Set<string>(); const out: Cluster[] = [];
  for (const seed of cities) {
    if (taken.has(seed.key)) continue;
    taken.add(seed.key);
    const members = [seed]; let count = seed.people.length;
    for (const c of cities) {
      if (taken.has(c.key)) continue;
      if (distPx(seed, c) <= (starPx(count) + starPx(c.people.length)) / 2 + gapPx) { taken.add(c.key); members.push(c); count += c.people.length; }
    }
    out.push({ key: members.map((m) => m.key).join('+'), lat: seed.lat, lng: seed.lng, count, cities: members, seed });
  }
  return out;
}

/** geodesic projection at the view centre: km ÷ km-per-px (no foreshortening — used for a star we're about to centre) */
export const geodesicPx = (kmPerPx: number): DistPx => (a, b) => haversineKm(a.lat, a.lng, b.lat, b.lng) / kmPerPx;

/** the coarsest km-per-px (furthest zoom-out) at which this cluster falls apart into ≥ 2 — for click-to-expand */
export function expansionKmPerPx(cluster: Cluster, ladder: number[]): number | null {
  for (const kmPerPx of [...ladder].sort((a, b) => b - a)) if (clusterCities(cluster.cities, geodesicPx(kmPerPx)).length > 1) return kmPerPx;
  return null;
}

export const clusterLabel = (c: Cluster) => c.cities.length > 1 ? `${c.seed.name} +${c.cities.length - 1} ${c.cities.length === 2 ? 'city' : 'cities'}` : c.seed.name;
