/**
 * Sign-in is a magic link to the email on your profile — no passwords anywhere (Bryan, 2026-09-16).
 * Any usc.edu address may ask in; the database creates the profile (unapproved) and an admin lets them
 * in on the Members page. Any other address must already be on a profile.
 */
import { supabase } from './supabase';

export const HOME = '/alumni-portal/home';
export const GATE = '/alumni-portal';

export async function sendMagicLink(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const addr = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return { ok: false, message: 'That does not look like an email address.' };
  const usc = /@(?:[a-z0-9-]+\.)*usc\.edu$/.test(addr);
  const { error } = await supabase().auth.signInWithOtp({ email: addr, options: { shouldCreateUser: usc, emailRedirectTo: `${location.origin}${HOME}` } });
  if (!error) return { ok: true };
  if (/signups not allowed|not allowed for otp/i.test(error.message)) return { ok: false, message: "We don't have that address on file. Use your usc.edu address to request access, or the email on your profile." };
  if (/rate limit|too many/i.test(error.message)) return { ok: false, message: 'Too many sign-in emails just now. Wait a few minutes and try again.' };
  return { ok: false, message: error.message };
}

export interface Me { id: string; email: string; full_name: string; approved: boolean; admin: boolean }

/** who is signed in, with the two facts every page needs: approved yet, and admin or not */
export async function me(): Promise<Me | null> {
  const sb = supabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const [{ data: profile }, { data: adminRow }] = await Promise.all([
    sb.from('profiles').select('full_name, approved').eq('id', session.user.id).maybeSingle(),
    sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle(),
  ]);
  return { id: session.user.id, email: session.user.email ?? '', full_name: profile?.full_name ?? '', approved: Boolean(profile?.approved), admin: Boolean(adminRow) };
}

export async function signOut() { await supabase().auth.signOut(); }

/** a light touch once per browser session so "active this month" can be a real number (a count, nothing more) */
export async function touchLastSeen(id: string) {
  try { if (sessionStorage.getItem('tl-seen')) return; sessionStorage.setItem('tl-seen', '1'); } catch { /* private mode: touch every load, harmless */ }
  await supabase().from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', id);
}
