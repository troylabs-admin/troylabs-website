/**
 * Cities as typed in the profile's LOCATION box (2026-10-26). Pure functions only (no network, no Supabase), so the rules
 * that decide which city someone gets are unit-tested (qa/portal/city-suggest-unit.mts):
 *  - parseTyped:        "Portland, ME" → { name: 'Portland', region: 'ME', isState: true }
 *  - fromGeocoder:      one Open-Meteo result → a suggestion we can place exactly (US state as its 2-letter code)
 *  - rankSuggestions:   cities already on the map first, then the geocoder's, without repeats; a typed state or
 *                       country puts its matches first and, for a US state, leaves other states out
 */
export interface CityRow { id: number; name: string; region: string; country: string; lat: number; lng: number }
/** a city we can place without guessing: either a row already in the list (id) or exact geocoder values */
export interface CitySuggestion { id?: number; name: string; region: string; country: string; lat: number; lng: number; detail: string; listed: boolean }

export const US: Record<string, string> = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY' };
export const STATES = new Set(Object.values(US));

export const cityLabel = (c: Pick<CityRow, 'name' | 'region' | 'country'> | null | undefined) => c ? `${c.name}${c.region ? `, ${c.region}` : ''}${c.country && c.country !== 'US' ? ` ${c.country}` : ''}` : '';
const key = (c: Pick<CityRow, 'name' | 'region' | 'country'>) => `${c.name.trim().toLowerCase()}|${c.region.trim().toUpperCase()}|${c.country.trim().toUpperCase()}`;

/** what they typed: the city part and, after a comma, a state (name or code) or a country */
export function parseTyped(text: string): { name: string; region: string; isState: boolean } {
  const [rawName = '', rawRegion = ''] = text.split(',').map((s) => s.trim());
  const region = US[rawRegion.toLowerCase()] ?? rawRegion.toUpperCase();
  return { name: rawName, region, isState: STATES.has(region) };
}

/** one Open-Meteo geocoding result (name, admin1, country, country_code, latitude, longitude) → a suggestion */
export function fromGeocoder(r: { name?: string; admin1?: string; country?: string; country_code?: string; latitude?: number; longitude?: number }): CitySuggestion | null {
  if (!r?.name || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return null;
  const country = (r.country_code ?? '').toUpperCase();
  const region = country === 'US' ? (US[(r.admin1 ?? '').toLowerCase()] ?? '') : '';
  const detail = [r.admin1, country === 'US' ? 'United States' : r.country].filter(Boolean).join(', ');
  return { name: r.name, region, country, lat: r.latitude, lng: r.longitude, detail, listed: false };
}

/** does this suggestion fit what they typed after the comma? (state code or name, country code, or a province / country
 *  name the geocoder gave, like "Toronto, Ontario" or "Toronto, Canada") */
const fits = (s: CitySuggestion, region: string) => !region || s.region.toUpperCase() === region || s.country.toUpperCase() === region
  || s.detail.toUpperCase().split(', ').includes(region);

/** listed cities first (already on the map), then the geocoder's in its own order; each place once; at most `max` */
export function rankSuggestions(listed: CityRow[], geocoded: CitySuggestion[], typed: string, max = 6): CitySuggestion[] {
  const { region, isState } = parseTyped(typed);
  const fromList = listed.map((c): CitySuggestion => ({ id: c.id, name: c.name, region: c.region, country: c.country, lat: c.lat, lng: c.lng, detail: 'Already on the map', listed: true }));
  const seen = new Set<string>(); const all: CitySuggestion[] = [];
  for (const s of [...fromList, ...geocoded]) { const k = key(s); if (seen.has(k)) continue; seen.add(k); all.push(s); }
  // "Portland, ME": only Maine's. "London, GB" or "Toronto, Canada": that country's first, the rest after
  const kept = isState ? all.filter((s) => fits(s, region)) : all;
  const ordered = region ? [...kept.filter((s) => fits(s, region)), ...kept.filter((s) => !fits(s, region))] : kept;
  return ordered.slice(0, max);
}
