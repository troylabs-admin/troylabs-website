/**
 * Company pages (Bryan, 2026-10-05, the ColorStack idea): every company TroyLabs members have worked at, and who worked
 * where. Built from LinkedIn work history (keyed by LinkedIn's company id) plus members who typed the company as their
 * current one. Row-level security keeps people waiting for approval out.
 */
import { supabase } from '../supabase';
import { avatarUrl, initialsOf } from './data';

export interface CompanyTile { linkedin_id: string; name: string; logo_path: string | null; people: number; current_people: number }
export interface Company { linkedin_id: string; name: string; logo_path: string | null; linkedin_url: string | null }
export interface CompanyRole { title: string; employment_type: string | null; start_year: number | null; start_month: number | null; end_year: number | null; end_month: number | null }
export interface CompanyPerson { id: string; full_name: string; status: 'student' | 'alum'; avatar: string | null; initials: string; roles: CompanyRole[]; now: boolean }

export async function companyDirectory(): Promise<CompanyTile[]> {
  const { data, error } = await supabase().rpc('company_directory'); if (error) throw error;
  return (data ?? []) as CompanyTile[];
}

type ProfileBit = { id: string; full_name: string; status: 'student' | 'alum'; avatar_path: string | null; updated_at: string; approved: boolean };
const person = (p: ProfileBit): Omit<CompanyPerson, 'roles' | 'now'> => ({ id: p.id, full_name: p.full_name || 'Unnamed member', status: p.status, avatar: avatarUrl(p), initials: initialsOf(p.full_name || '?') });

/** a company and its people: who's there now first, then who was, each with their roles there */
export async function getCompany(id: string): Promise<{ company: Company; people: CompanyPerson[] } | null> {
  const sb = supabase();
  const { data: company } = await sb.from('companies').select('linkedin_id, name, logo_path, linkedin_url').eq('linkedin_id', id).maybeSingle();
  if (!company) return null;
  const name = (company.name as string).replace(/[%_\\]/g, (c) => `\\${c}`);   // ilike pattern: the name literally
  const [jobs, typed] = await Promise.all([
    sb.from('work_experiences').select('title, employment_type, start_year, start_month, end_year, end_month, sort, profile:profiles!inner(id, full_name, status, avatar_path, updated_at, approved)').eq('company_linkedin_id', id).order('sort'),
    sb.from('profiles').select('id, full_name, status, avatar_path, updated_at, approved, current_title').eq('approved', true).ilike('current_company', name),
  ]);
  const by = new Map<string, CompanyPerson>();
  for (const j of (jobs.data ?? []) as unknown as (CompanyRole & { profile: ProfileBit })[]) {
    if (!j.profile?.approved) continue;
    const p = by.get(j.profile.id) ?? { ...person(j.profile), roles: [], now: false };
    p.roles.push({ title: j.title, employment_type: j.employment_type, start_year: j.start_year, start_month: j.start_month, end_year: j.end_year, end_month: j.end_month });
    p.now ||= !j.end_year; by.set(p.id, p);
  }
  for (const t of (typed.data ?? []) as (ProfileBit & { current_title: string | null })[]) {
    if (by.has(t.id)) { by.get(t.id)!.now = true; continue; }   // their LinkedIn already lists it; they say they're there now
    by.set(t.id, { ...person(t), roles: t.current_title ? [{ title: t.current_title, employment_type: null, start_year: null, start_month: null, end_year: null, end_month: null }] : [], now: true });
  }
  const newest = (p: CompanyPerson) => Math.max(0, ...p.roles.map((r) => (r.end_year ?? 9999) * 12 + (r.end_month ?? 12)));
  const people = [...by.values()].sort((a, b) => Number(b.now) - Number(a.now) || newest(b) - newest(a) || a.full_name.localeCompare(b.full_name));
  return { company: company as Company, people };
}
