/**
 * Is this page really signed in? (2026-10-26) Jared filled in his whole profile on an iPhone while the page held a sign-in
 * the server didn't recognise (his first real sign-in came 50 minutes later), and UPDATE answered with Postgres's raw
 * "permission denied for table cities". The browser's stored session is only a claim; the server decides.
 *
 *  - checkSession()   asks the Auth server (getUser), not just the browser's storage (getSession). A sign-in the server
 *                     rejects is cleared on this device. A network failure is NOT treated as signed out: a weak signal
 *                     must never throw someone out of a half-filled form.
 *  - watchSession()   tells the page the moment its sign-in goes away: Supabase's SIGNED_OUT event, and a re-check
 *                     whenever the tab comes back to the front (a phone pauses background tabs, so tokens can lapse there).
 *  - explainError()   turns a failed save into words: "you've been signed out" only when the server confirms it, the
 *                     database's own plain-language messages as they are, and a plain sentence for anything technical.
 */
import { supabase } from '../supabase';

export const SIGNED_OUT_MESSAGE = 'You’ve been signed out. Sign in again to save. What you typed is kept on this device.';
export const SIGNED_OUT_EVENT = 'tl:signed-out';

export type SessionState = 'ok' | 'none' | 'unknown';

export async function checkSession(): Promise<SessionState> {
  const sb = supabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return 'none';
  const { error } = await sb.auth.getUser();
  if (!error) return 'ok';
  const status = (error as { status?: number }).status ?? 0;
  // 401/403 (expired, revoked, or the account behind it is gone) or no session at all: the server says no
  if (status === 401 || status === 403 || error.name === 'AuthSessionMissingError') {
    await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    return 'none';
  }
  return 'unknown';
}

let leavingOnPurpose = false;
/** the SIGN OUT link: the sign-out that follows is wanted, so no "you've been signed out" bar */
export const signingOutOnPurpose = () => { leavingOnPurpose = true; };

let lostAlready = false;
/** say, once, that the page has lost its sign-in (pages listen for SIGNED_OUT_EVENT) */
export function noteSignedOut() {
  if (lostAlready || leavingOnPurpose) return;
  lostAlready = true;
  document.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT));
}

let watching = false;
export function watchSession() {
  if (watching) return; watching = true;
  supabase().auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') noteSignedOut(); });
  const recheck = async () => { if (document.visibilityState === 'visible' && !lostAlready && (await checkSession()) === 'none') noteSignedOut(); };
  document.addEventListener('visibilitychange', recheck);
  window.addEventListener('pageshow', (e) => { if ((e as PageTransitionEvent).persisted) void recheck(); });   // Safari's back/forward cache
}

type DbError = { code?: string; message?: string; status?: number } | null | undefined;
const TECHNICAL = /permission denied for|JWT|violates (row-level|check|foreign key|not-null)|duplicate key|syntax error|relation .* does not exist|function .* does not exist|PGRST|schema cache/i;

/** a failed request in words people can act on */
export async function explainError(error: DbError, fallback = 'That didn’t save. Try again in a moment. If it keeps happening, write to troylabs@usc.edu.'): Promise<string> {
  if (!error) return fallback;
  const msg = error.message ?? '';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return 'We couldn’t reach TroyLabs. Check your connection and try again.';
  // a refusal that a missing sign-in would cause: confirm with the server before saying so
  if (error.status === 401 || /^PGRST30[123]$/.test(error.code ?? '') || /JWT/i.test(msg) || (error.code === '42501' && /^permission denied for/i.test(msg))) {
    if ((await checkSession()) === 'none') { noteSignedOut(); return SIGNED_OUT_MESSAGE; }
  }
  if (/duplicate key|unique/i.test(msg) && /email/i.test(msg)) return 'That email is already on another profile.';
  // the database's own messages are written for people (raise exception '…'): show them; anything technical gets a sentence
  if (msg && !TECHNICAL.test(msg)) return msg;
  return fallback;
}
