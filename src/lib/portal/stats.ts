/** Numbers for Admin › Overview and Analytics: the network from our database, the website from PostHog through the posthog-stats function. */
import { supabase } from '../supabase';
import { completeness, cohortOf, cityLabel, type ProfileRow } from './data';

export interface NetworkStats { members: number; students: number; alumni: number; active30: number; pending: number; completeness: number; byCohort: [string, number][]; byCity: [string, number][]; sentThisMonth: number; recent: { title: string; state: string; when: string | null }[] }
export async function networkStats(): Promise<NetworkStats> {
  const sb = supabase();
  const [{ data: rows }, { data: msgs }] = await Promise.all([sb.from('profiles').select('*, city:cities(*)'), sb.from('messages').select('title, state, sent_at, scheduled_for, updated_at').order('updated_at', { ascending: false }).limit(5)]);
  const all = (rows ?? []) as ProfileRow[]; const members = all.filter((r) => r.approved);
  const monthAgo = Date.now() - 30 * 864e5; const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const tally = (keys: string[]) => { const m = new Map<string, number>(); for (const k of keys) if (k) m.set(k, (m.get(k) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  return {
    members: members.length, students: members.filter((r) => r.status === 'student').length, alumni: members.filter((r) => r.status === 'alum').length,
    active30: members.filter((r) => r.last_seen_at && Date.parse(r.last_seen_at) > monthAgo).length,
    pending: all.filter((r) => !r.approved && !r.declined_at).length,
    completeness: members.length ? Math.round(members.reduce((n, r) => n + completeness(r), 0) / members.length) : 0,
    byCohort: tally(members.map((r) => cohortOf(r.join_term, r.join_year))), byCity: tally(members.map((r) => cityLabel(r.city))),
    sentThisMonth: (msgs ?? []).filter((m: any) => m.state === 'sent' && m.sent_at && Date.parse(m.sent_at) >= monthStart.getTime()).length,
    recent: (msgs ?? []).map((m: any) => ({ title: m.title, state: m.state, when: m.sent_at ?? m.scheduled_for ?? m.updated_at })),
  };
}

export interface SiteStats { configured: boolean; error?: string; days?: number; counts?: Record<string, number>; pages?: [string, number][]; devices?: Record<string, number>; portalPages?: [string, number][] }
export async function siteStats(days = 30): Promise<SiteStats> {
  const sb = supabase(); const { data: { session } } = await sb.auth.getSession(); if (!session) return { configured: false, error: 'signed out' };
  const url = ((import.meta.env.PUBLIC_SUPABASE_URL as string | undefined) || 'https://ackmhqxyxnceoarbhcrp.supabase.co') + `/functions/v1/posthog-stats?days=${days}`;
  // the functions gateway takes the session JWT alone; an `apikey` header in the new publishable format is rejected (measured: 401 "Invalid API key")
  const r = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
  if (!r) return { configured: false, error: 'unreachable' };
  return r.json().catch(() => ({ configured: false, error: `status ${r.status}` }));
}
