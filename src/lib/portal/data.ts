/**
 * The portal's data access, one place: what a profile row looks like, how it becomes the Person the
 * search/globe pages draw, photos, cities, and the admin operations. Everything goes through the
 * browser client under row-level security (supabase/migrations) — there is no server in front of it.
 */
import { SUPABASE_URL, supabase } from '../supabase';
import type { Person } from './sample-people';
import { cardRole, type RoleTerm } from './roles';
import { US, cityLabel, fromGeocoder, parseTyped, rankSuggestions, type CityRow, type CitySuggestion } from './cities';
import { SIGNED_OUT_MESSAGE, explainError, noteSignedOut } from './session';
export { cityLabel, type CityRow, type CitySuggestion };

export interface ClaimedRole { role: string; term: 'FA' | 'SP'; year: number }
export interface ProfileRow {
  id: string; full_name: string; approved: boolean; declined_at: string | null;
  status: 'student' | 'alum'; grad_term: 'FA' | 'SP' | null; grad_year: number | null; join_term: 'FA' | 'SP' | null; join_year: number | null;
  divisions: string[]; current_title: string | null; current_company: string | null; linkedin_url: string | null; bio: string | null;
  industries: string[]; startups: string[]; city_id: number | null;
  usc_email: string | null; personal_email: string | null; phone: string | null; phone_opt_in: boolean; email_opt_in: boolean;
  avatar_path: string | null; avatar_source?: 'upload' | 'linkedin' | null;
  current_job_source?: 'manual' | 'linkedin' | null;
  linkedin_headline?: string | null; linkedin_about?: string | null; linkedin_skills?: string[]; linkedin_synced_at?: string | null; linkedin_sync_error?: string | null; request_note: string | null; created_at: string; updated_at: string; last_seen_at: string | null;
  claimed_roles: ClaimedRole[];
  approved_at?: string | null; approved_by?: string | null; declined_by?: string | null; email_opt_in_changed_at?: string | null; phone_opt_in_changed_at?: string | null;   // set by the database from what changed (record_keeping migration), never by a page
  submitted_at: string | null;   // SUBMIT FOR APPROVAL pressed (submit_application); only then do admins see them   // e-board roles they say they held, written while they wait; become eboard_roles when approved
  city?: CityRow | null;
}
export interface RoleRow { id?: number; profile_id: string; role: string; term: 'FA' | 'SP'; year: number }

const URL = () => SUPABASE_URL;
export const avatarUrl = (row: Pick<ProfileRow, 'avatar_path' | 'updated_at'>) => row.avatar_path ? `${URL()}/storage/v1/object/public/avatars/${row.avatar_path}?v=${Date.parse(row.updated_at) || 0}` : null;
export const initialsOf = (name: string) => name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
export const cohortOf = (term: string | null, year: number | null) => (term && year ? `${term}${String(year).slice(2)}` : '');
const SELECT = '*, city:cities(*)';
/** what a search card needs, nothing else (2026-10-05: `*` also sent each profile's 1,536-number embedding, ~19 KB a person,
 *  so 1,000 members would have been ~20 MB per visit to search) */
const CARD_SELECT = 'id, full_name, status, grad_year, join_term, join_year, divisions, current_title, current_company, linkedin_headline, industries, bio, avatar_path, updated_at, city:cities(name, region, lat, lng)';

/** the shape the search page, the globe and the cards draw */
export function toPerson(r: ProfileRow): Person & { avatar: string | null } {
  return {
    id: r.id, full_name: r.full_name || 'Unnamed member', initials: initialsOf(r.full_name || '?'),
    status: r.status === 'student' ? 'STUDENT' : 'ALUM', cohort: cohortOf(r.join_term, r.join_year), classOf: r.grad_year ? String(r.grad_year) : '',
    divisions: (r.divisions ?? []).map(d => d.replace('PRODUCT MANAGEMENT', 'PRODUCT')),
    division: (r.divisions?.[0] ?? '').replace('PRODUCT MANAGEMENT', 'PRODUCT'), current_title: r.current_title ?? '', current_company: r.current_company ?? '', headline: r.linkedin_headline ?? '',
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
export async function saveMyProfile(patch: Partial<ProfileRow>, id?: string): Promise<{ ok: true; row: ProfileRow } | { ok: false; message: string }> {
  const sb = supabase(); const { data: { session } } = await sb.auth.getSession(); if (!session) { noteSignedOut(); return { ok: false, message: SIGNED_OUT_MESSAGE }; }
  const { city, ...fields } = patch as any;
  // id: an admin editing someone else (2026-10-06); the profiles_admin policy and the profiles_admin_edit trigger decide what's allowed
  const { data, error } = await sb.from('profiles').update(fields).eq('id', id ?? session.user.id).select(SELECT).single();
  if (error) return { ok: false, message: /unique|duplicate key/i.test(error.message) ? 'That email is already on another profile.' : await explainError(error) };
  return { ok: true, row: data as ProfileRow };
}

/** square-crop and shrink a photo in the browser (phone photos are 3–8 MB; the bucket takes 1 MB), then upload */
export async function uploadAvatar(file: File, id?: string): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const sb = supabase(); const { data: { session } } = await sb.auth.getSession(); if (!session) { noteSignedOut(); return { ok: false, message: SIGNED_OUT_MESSAGE }; }
  if (!file.type.startsWith('image/')) return { ok: false, message: 'Choose an image file.' };
  const bitmap = await createImageBitmap(file).catch(() => null); if (!bitmap) return { ok: false, message: 'That image could not be read.' };
  const side = Math.min(bitmap.width, bitmap.height), size = 512;
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.84)); if (!blob) return { ok: false, message: 'Could not prepare the photo.' };
  const path = `${id ?? session.user.id}/avatar.webp`;   // id: an admin setting someone's photo (avatars_admin_write policy)
  const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/webp', cacheControl: '3600' });
  if (error) return { ok: false, message: await explainError(error, 'The photo didn’t upload. Try again, or try a smaller photo.') };
  const saved = await saveMyProfile({ avatar_path: path, avatar_source: 'upload' }, id); if (!saved.ok) return saved;   // their own photo: a LinkedIn sync never replaces it
  return { ok: true, path };
}

// ── cities: "City, ST" → a row with coordinates (looked up once, then shared by everyone) ─────────
export async function findOrCreateCity(text: string): Promise<{ ok: true; city: CityRow } | { ok: false; message: string }> {
  const { name: rawName, region: wantRegion, isState } = parseTyped(text); if (!rawName) return { ok: false, message: 'Type a city, like "Los Angeles, CA".' };
  const sb = supabase();
  // signed out (or a sign-in the server no longer accepts): say so now, before a lookup that would fail in technical words
  const { data: { session } } = await sb.auth.getSession(); if (!session) { noteSignedOut(); return { ok: false, message: SIGNED_OUT_MESSAGE }; }
  const { data: known, error: lookErr } = await sb.from('cities').select('*').ilike('name', rawName.replace(/[\\%_]/g, '\\$&')).limit(10);
  if (lookErr) return { ok: false, message: await explainError(lookErr, 'We couldn’t look that city up. Try again in a moment.') };
  // the only listed city of that name counts unless they typed a different US state (Portland, ME is not Portland, OR)
  const hit = (known ?? []).find((c: CityRow) => !wantRegion || c.region.toUpperCase() === wantRegion || c.country.toUpperCase() === wantRegion) ?? (known?.length === 1 && !isState ? known[0] : null);
  if (hit) return { ok: true, city: hit as CityRow };
  // not seen before: geocode once (Open-Meteo, no key), pick the result whose state matches, add it for everyone
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(rawName)}&count=8&language=en&format=json`).then((r) => r.json()).catch(() => null);
  if (!res) return { ok: false, message: 'We couldn’t look that city up. Check your connection and try again.' };
  const results: any[] = res.results ?? [];
  const pick = results.find((r) => wantRegion && (US[(r.admin1 ?? '').toLowerCase()] === wantRegion || (r.country_code ?? '').toUpperCase() === wantRegion)) ?? (isState ? null : results[0]);
  if (!pick) return { ok: false, message: `We couldn't find "${rawName}"${isState ? ` in ${wantRegion}` : ''}. Try the nearest big city.` };
  const region = pick.country_code === 'US' ? (US[(pick.admin1 ?? '').toLowerCase()] ?? '') : '';
  // through add_city (supabase/migrations/20261026000100_add_city.sql): members can't write the table itself
  const { data: city, error } = await sb.rpc('add_city', { new_name: pick.name, new_region: region, new_country: pick.country_code ?? '', new_lat: pick.latitude, new_lng: pick.longitude });
  if (error || !city?.id) return { ok: false, message: error ? await explainError(error, 'We couldn’t add that city just now. Try again in a minute, or pick the nearest big city.') : 'We couldn’t add that city just now. Try again in a minute, or pick the nearest big city.' };
  return { ok: true, city: city as CityRow };
}

/** suggestions while typing (2026-10-26): cities already on the map, then the geocoder's (Open-Meteo matches from the
 *  start of a name once 3 letters are typed; 2 letters match exactly). `signal` cancels a lookup the next keystroke replaces. */
export async function suggestCities(text: string, signal?: AbortSignal): Promise<{ ok: true; list: CitySuggestion[] } | { ok: false; message: string }> {
  const { name } = parseTyped(text); if (name.length < 2) return { ok: true, list: [] };
  const sb = supabase();
  const [listed, geo] = await Promise.all([
    sb.from('cities').select('*').ilike('name', `${name.replace(/[\\%_]/g, '\\$&')}%`).order('name').limit(5).abortSignal(signal ?? new AbortController().signal),
    fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`, { signal }).then((r) => r.ok ? r.json() : null).catch(() => null),
  ]);
  if (signal?.aborted) return { ok: true, list: [] };
  if (!geo && listed.error) return { ok: false, message: 'We couldn’t look up cities just now. Check your connection, or type the city and press UPDATE.' };
  const geocoded = ((geo?.results ?? []) as unknown[]).map((r) => fromGeocoder(r as never)).filter((x): x is CitySuggestion => x !== null);
  return { ok: true, list: rankSuggestions((listed.data ?? []) as CityRow[], geocoded, text) };
}

/** a picked suggestion → its row: one already listed is used as is; a new one is added exactly as suggested (add_city) */
export async function placeSuggestion(s: CitySuggestion): Promise<{ ok: true; city: CityRow } | { ok: false; message: string }> {
  const sb = supabase();
  const { data: { session } } = await sb.auth.getSession(); if (!session) { noteSignedOut(); return { ok: false, message: SIGNED_OUT_MESSAGE }; }
  if (s.id) return { ok: true, city: { id: s.id, name: s.name, region: s.region, country: s.country, lat: s.lat, lng: s.lng } };
  const { data: city, error } = await sb.rpc('add_city', { new_name: s.name, new_region: s.region, new_country: s.country, new_lat: s.lat, new_lng: s.lng });
  if (error || !city?.id) return { ok: false, message: error ? await explainError(error, 'We couldn’t add that city just now. Try again in a minute.') : 'We couldn’t add that city just now. Try again in a minute.' };
  return { ok: true, city: city as CityRow };
}

// ── the network ───────────────────────────────────────────────────────────────────────────────────
export async function listPeople(): Promise<(Person & { avatar: string | null })[]> {
  const sb = supabase();
  const [{ data, error }, { data: roles }] = await Promise.all([sb.from('profiles').select(CARD_SELECT).eq('approved', true).order('full_name'), sb.from('eboard_roles').select('profile_id, role, term, year')]);
  if (error) throw error;
  const byPerson = new Map<string, RoleTerm[]>(); for (const r of (roles ?? []) as (RoleTerm & { profile_id: string })[]) byPerson.set(r.profile_id, [...(byPerson.get(r.profile_id) ?? []), r]);
  return ((data ?? []) as unknown as ProfileRow[]).map((r) => ({ ...toPerson(r), role: cardRole(byPerson.get(r.id) ?? []) }));   // the card's e-board tag
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
/** back onto the waiting list after a decline (or after REMOVE ACCESS) */
export const setRestored = (id: string) => supabase().from('profiles').update({ approved: false, declined_at: null }).eq('id', id);
/** SUBMIT FOR APPROVAL: the server checks the required answers, marks them submitted and keeps a backup copy */
export const submitApplication = () => supabase().rpc('submit_application');
/** approve one person or a hundred in one call; their claimed e-board roles become their record (approve_members) */
export const approveMany = (ids: string[]) => supabase().rpc('approve_members', { ids });
export const declineMany = (ids: string[]) => supabase().rpc('decline_members', { ids });
/** UNDO after an approve or a decline: back onto the waiting list */
export const restoreMany = (ids: string[]) => supabase().from('profiles').update({ approved: false, declined_at: null }).in('id', ids);
export const setAdmin = (id: string, on: boolean) => on ? supabase().from('admins').upsert({ user_id: id }) : supabase().from('admins').delete().eq('user_id', id);
export async function setRoles(profileId: string, roles: Omit<RoleRow, 'profile_id' | 'id'>[]) {
  return supabase().rpc('replace_eboard_roles', { target_profile: profileId, new_roles: roles });
}
export const importRoster = (rows: { full_name: string; usc_email: string; join_term: 'FA' | 'SP' | null; join_year: number | null; division: string | null }[]) => supabase().from('roster').upsert(rows.map(r => ({ ...r, divisions: r.division ? [r.division] : [] })), { onConflict: 'usc_email' });
export const listRoster = async () => ((await supabase().from('roster').select('*').order('imported_at', { ascending: false })).data ?? []) as any[];

/** how filled-in a profile is, the same fields the profile page scores */
export function completeness(r: ProfileRow): number {
  const checks = [r.avatar_path, r.full_name, r.personal_email, r.join_year, r.linkedin_url, r.bio, r.divisions?.length, r.industries?.length, r.city_id, r.status === 'alum' ? r.grad_year : true];
  return Math.round((100 * checks.filter(Boolean).length) / checks.length);
}
