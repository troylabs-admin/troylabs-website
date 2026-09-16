/**
 * The portal's data access, one place: what a profile row looks like, how it becomes the Person the
 * search/globe pages draw, photos, cities, and the admin operations. Everything goes through the
 * browser client under row-level security (supabase/migrations) — there is no server in front of it.
 */
import { supabase } from '../supabase';
import type { Person } from './sample-people';

export interface ProfileRow {
  id: string; full_name: string; approved: boolean; declined_at: string | null;
  status: 'student' | 'alum'; grad_term: 'FA' | 'SP' | null; grad_year: number | null; join_term: 'FA' | 'SP' | null; join_year: number | null;
  divisions: string[]; current_title: string | null; current_company: string | null; linkedin_url: string | null; bio: string | null;
  industries: string[]; startups: string[]; city_id: number | null;
  usc_email: string | null; personal_email: string | null; phone: string | null; phone_opt_in: boolean;
  avatar_path: string | null; request_note: string | null; created_at: string; updated_at: string; last_seen_at: string | null;
  city?: CityRow | null;
}
export interface CityRow { id: number; name: string; region: string; country: string; lat: number; lng: number }
export interface RoleRow { id?: number; profile_id: string; role: string; term: 'FA' | 'SP'; year: number }

const URL = () => (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined) || 'https://ackmhqxyxnceoarbhcrp.supabase.co';
export const avatarUrl = (row: Pick<ProfileRow, 'avatar_path' | 'updated_at'>) => row.avatar_path ? `${URL()}/storage/v1/object/public/avatars/${row.avatar_path}?v=${Date.parse(row.updated_at) || 0}` : null;
export const initialsOf = (name: string) => name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
export const cohortOf = (term: string | null, year: number | null) => (term && year ? `${term}${String(year).slice(2)}` : '');
const SELECT = '*, city:cities(*)';

/** the shape the search page, the globe and the cards draw */
export function toPerson(r: ProfileRow): Person & { avatar: string | null } {
  return {
    id: r.id, full_name: r.full_name || 'Unnamed member', initials: initialsOf(r.full_name || '?'),
    status: r.status === 'student' ? 'STUDENT' : 'ALUM', cohort: cohortOf(r.join_term, r.join_year), classOf: r.grad_year ? String(r.grad_year) : '',
    division: (r.divisions?.[0] ?? '').replace('PRODUCT MANAGEMENT', 'PRODUCT'), current_title: r.current_title ?? '', current_company: r.current_company ?? '',
    industries: r.industries ?? [], bio: r.bio ?? '', city: r.city?.name ?? '', region: r.city?.region ?? '', lat: r.city?.lat ?? 0, lng: r.city?.lng ?? 0, programs: [],
    avatar: avatarUrl(r),
  };
}

// ── me ────────────────────────────────────────────────────────────────────────────────────────────
export async function myProfile(): Promise<ProfileRow | null> {
  const sb = supabase(); const { data: { session } } = await sb.auth.getSession(); if (!session) return null;
  const { data } = await sb.from('profiles').select(SELECT).eq('id', session.user.id).maybeSingle();
  return data as ProfileRow | null;
}
export async function saveMyProfile(patch: Partial<ProfileRow>): Promise<{ ok: true; row: ProfileRow } | { ok: false; message: string }> {
  const sb = supabase(); const { data: { session } } = await sb.auth.getSession(); if (!session) return { ok: false, message: 'You are signed out.' };
  const { city, ...fields } = patch as any;
  const { data, error } = await sb.from('profiles').update(fields).eq('id', session.user.id).select(SELECT).single();
  if (error) return { ok: false, message: /unique/i.test(error.message) ? 'That email is already on another profile.' : error.message };
  return { ok: true, row: data as ProfileRow };
}

/** square-crop and shrink a photo in the browser (phone photos are 3–8 MB; the bucket takes 1 MB), then upload */
export async function uploadAvatar(file: File): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const sb = supabase(); const { data: { session } } = await sb.auth.getSession(); if (!session) return { ok: false, message: 'You are signed out.' };
  if (!file.type.startsWith('image/')) return { ok: false, message: 'Choose an image file.' };
  const bitmap = await createImageBitmap(file).catch(() => null); if (!bitmap) return { ok: false, message: 'That image could not be read.' };
  const side = Math.min(bitmap.width, bitmap.height), size = 512;
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.84)); if (!blob) return { ok: false, message: 'Could not prepare the photo.' };
  const path = `${session.user.id}/avatar.webp`;
  const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/webp', cacheControl: '3600' });
  if (error) return { ok: false, message: error.message };
  const saved = await saveMyProfile({ avatar_path: path }); if (!saved.ok) return saved;
  return { ok: true, path };
}

// ── cities: "City, ST" → a row with coordinates (looked up once, then shared by everyone) ─────────
const US: Record<string, string> = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY' };
export async function findOrCreateCity(text: string): Promise<{ ok: true; city: CityRow } | { ok: false; message: string }> {
  const [rawName, rawRegion = ''] = text.split(',').map((s) => s.trim()); if (!rawName) return { ok: false, message: 'Type a city, like "Los Angeles, CA".' };
  const sb = supabase();
  const wantRegion = US[rawRegion.toLowerCase()] ?? rawRegion.toUpperCase();
  const { data: known } = await sb.from('cities').select('*').ilike('name', rawName).limit(10);
  const hit = (known ?? []).find((c: CityRow) => !wantRegion || c.region.toUpperCase() === wantRegion) ?? (known?.length === 1 ? known[0] : null);
  if (hit) return { ok: true, city: hit as CityRow };
  // not seen before: geocode once (Open-Meteo, no key), pick the result whose state matches, save it
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(rawName)}&count=8&language=en&format=json`).then((r) => r.json()).catch(() => null);
  const results: any[] = res?.results ?? []; if (!results.length) return { ok: false, message: `We couldn't find "${rawName}". Try the nearest big city.` };
  const pick = results.find((r) => wantRegion && (US[(r.admin1 ?? '').toLowerCase()] === wantRegion || (r.country_code ?? '').toUpperCase() === wantRegion)) ?? results[0];
  const region = pick.country_code === 'US' ? (US[(pick.admin1 ?? '').toLowerCase()] ?? '') : '';
  const row = { name: pick.name, region, country: pick.country_code ?? '', lat: pick.latitude, lng: pick.longitude };
  const { data: created, error } = await sb.from('cities').insert(row).select('*').single();
  if (error) { const { data: again } = await sb.from('cities').select('*').eq('name', row.name).eq('region', row.region).eq('country', row.country).maybeSingle(); if (again) return { ok: true, city: again as CityRow }; return { ok: false, message: error.message }; }
  return { ok: true, city: created as CityRow };
}
export const cityLabel = (c: CityRow | null | undefined) => c ? `${c.name}${c.region ? `, ${c.region}` : ''}${c.country && c.country !== 'US' ? ` ${c.country}` : ''}` : '';

// ── the network ───────────────────────────────────────────────────────────────────────────────────
export async function listPeople(): Promise<(Person & { avatar: string | null })[]> {
  const { data } = await supabase().from('profiles').select(SELECT).eq('approved', true).order('full_name');
  return ((data ?? []) as ProfileRow[]).map(toPerson);
}
export async function getProfile(id: string): Promise<{ row: ProfileRow; roles: RoleRow[] } | null> {
  const sb = supabase();
  const [{ data: row }, { data: roles }] = await Promise.all([sb.from('profiles').select(SELECT).eq('id', id).maybeSingle(), sb.from('eboard_roles').select('*').eq('profile_id', id).order('year').order('term')]);
  return row ? { row: row as ProfileRow, roles: (roles ?? []) as RoleRow[] } : null;
}
export const roleLabel = (rs: RoleRow[]) => { const by = new Map<string, string[]>(); for (const r of rs) by.set(r.role, [...(by.get(r.role) ?? []), `${r.term === 'FA' ? 'FALL' : 'SPRING'} ${r.year}`]); return [...by].map(([role, terms]) => `${role} · ${terms.join(', ')}`); };

// ── admin ─────────────────────────────────────────────────────────────────────────────────────────
export async function adminListProfiles(): Promise<{ rows: ProfileRow[]; admins: Set<string>; roles: RoleRow[] }> {
  const sb = supabase();
  const [{ data: rows }, { data: admins }, { data: roles }] = await Promise.all([sb.from('profiles').select(SELECT).order('full_name'), sb.from('admins').select('user_id'), sb.from('eboard_roles').select('*')]);
  return { rows: (rows ?? []) as ProfileRow[], admins: new Set((admins ?? []).map((a: any) => a.user_id)), roles: (roles ?? []) as RoleRow[] };
}
export const setApproved = (id: string, approved: boolean) => supabase().from('profiles').update({ approved, declined_at: approved ? null : undefined }).eq('id', id);
export const setDeclined = (id: string) => supabase().from('profiles').update({ approved: false, declined_at: new Date().toISOString() }).eq('id', id);
export const setAdmin = (id: string, on: boolean) => on ? supabase().from('admins').upsert({ user_id: id }) : supabase().from('admins').delete().eq('user_id', id);
export async function setRoles(profileId: string, roles: Omit<RoleRow, 'profile_id' | 'id'>[]) {
  const sb = supabase(); await sb.from('eboard_roles').delete().eq('profile_id', profileId);
  if (roles.length) return sb.from('eboard_roles').insert(roles.map((r) => ({ ...r, profile_id: profileId })));
  return { error: null };
}
export const importRoster = (rows: { full_name: string; usc_email: string; join_term: 'FA' | 'SP' | null; join_year: number | null; division: string | null }[]) => supabase().from('roster').upsert(rows, { onConflict: 'usc_email' });
export const listRoster = async () => ((await supabase().from('roster').select('*').order('imported_at', { ascending: false })).data ?? []) as any[];

/** how filled-in a profile is, the same fields the profile page scores */
export function completeness(r: ProfileRow): number {
  const checks = [r.avatar_path, r.full_name, r.personal_email, r.join_year, r.current_title, r.current_company, r.linkedin_url, r.bio, r.divisions?.length, r.industries?.length, r.city_id, r.status === 'alum' ? r.grad_year : true];
  return Math.round((100 * checks.filter(Boolean).length) / checks.length);
}
