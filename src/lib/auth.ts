/**
 * Sign-in is a magic link, no passwords (Bryan, 2026-09-16). Sign-up is the same door (Bryan, 2026-09-30):
 * anyone may ask for a link with any email they check; a first link creates the account, they create their
 * profile, and an admin approves them by hand on Admin › Members. Until then row-level security lets them
 * see only their own profile.
 */
import { supabase } from './supabase';
import { applicationMissing } from './portal/application';

const ACCOUNT_EMAIL = 'https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/account-email';
/** the `account-email` function: sign in with a second address, add / confirm / remove one (supabase/functions/account-email) */
export async function accountEmail(body: Record<string, unknown>): Promise<{ status: number; error?: string; sent?: boolean; otp?: boolean; saved?: boolean; pending?: boolean; removed?: boolean; ok?: boolean; reason?: string; email?: string; kind?: string }> {
  const { data: { session } } = await supabase().auth.getSession();
  const r = await fetch(ACCOUNT_EMAIL, { method: 'POST', headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: location.origin, ...body }) });
  return { status: r.status, ...(await r.json().catch(() => ({ error: `status ${r.status}` }))) };
}

export const HOME = '/alumni-portal/home';
export const GATE = '/alumni-portal';

export async function sendMagicLink(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const addr = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return { ok: false, message: 'That does not look like an email address.' };
  // a confirmed second address (e.g. your USC one) signs in to the same account: the function emails that address a link
  // for your account (2026-10-05). If the function is unreachable, fall through to the usual link: sign-in never depends on it.
  const routed = await accountEmail({ mode: 'sign-in', email: addr }).catch(() => null);
  if (routed?.sent) return { ok: true };
  if (routed?.error && routed.status === 429) return { ok: false, message: routed.error };
  const { error } = await supabase().auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}${HOME}` } });
  if (!error) return { ok: true };
  if (/rate limit|too many/i.test(error.message)) return { ok: false, message: 'Too many sign-in emails just now. Wait a few minutes and try again.' };
  // the mail service refused (e.g. Resend's daily cap on the free plan): say so plainly instead of Supabase's raw text
  if (/sending|smtp|email.*(failed|error)/i.test(error.message)) return { ok: false, message: 'We couldn’t send the email just now. Try again in a little while, or write to troylabs@usc.edu.' };
  return { ok: false, message: error.message };
}

export interface Me { id: string; email: string; full_name: string; approved: boolean; declined: boolean; submitted: boolean; admin: boolean; missing: string[] }

/** who is signed in, and the facts every page needs: approved, declined, admin, and what their sign-up still lacks */
export async function me(): Promise<Me | null> {
  const sb = supabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const [{ data: profile }, { data: adminRow }] = await Promise.all([
    sb.from('profiles').select('full_name, approved, declined_at, submitted_at, grad_year, join_year, divisions, city_id, linkedin_url, phone, personal_email').eq('id', session.user.id).maybeSingle(),
    sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle(),
  ]);
  return {
    id: session.user.id, email: session.user.email ?? '', full_name: profile?.full_name ?? '',
    approved: Boolean(profile?.approved), declined: Boolean(profile && !profile.approved && profile.declined_at), admin: Boolean(adminRow),
    submitted: Boolean(profile?.submitted_at),
    missing: applicationMissing({ full_name: profile?.full_name ?? '', grad_year: profile?.grad_year ?? null, join_year: profile?.join_year ?? null, divisions: profile?.divisions ?? [], city_id: profile?.city_id ?? null, linkedin_url: profile?.linkedin_url ?? null, phone: profile?.phone ?? null, personal_email: profile?.personal_email ?? null }),
  };
}

/** how many people are waiting for an admin (admins only; row-level security returns 0 to anyone else) */
export async function waitingCount(): Promise<number> {
  // only submitted applications (SUBMIT FOR APPROVAL): nobody reaches the admins before that
  const { count } = await supabase().from('profiles').select('id', { count: 'exact', head: true }).eq('approved', false).is('declined_at', null).not('submitted_at', 'is', null);
  return count ?? 0;
}

export async function signOut() { await supabase().auth.signOut(); }

/** a light touch once per browser session so "active this month" can be a real number (a count, nothing more) */
export async function touchLastSeen(id: string) {
  try { if (sessionStorage.getItem('tl-seen')) return; sessionStorage.setItem('tl-seen', '1'); } catch { /* private mode: touch every load, harmless */ }
  await supabase().from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', id);
}
