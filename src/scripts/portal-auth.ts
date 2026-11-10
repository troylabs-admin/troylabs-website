/**
 * The gate on every signed-in portal page. No session → back to the sign-in. With one:
 *   approved   → the whole portal; the nav names you; ADMIN only for admins, with a count of people waiting
 *   not yet    → a new account must fill in its profile and press SUBMIT FOR APPROVAL first (sent to /profile
 *                until then); after that, /home is the waiting screen; nothing else is reachable
 *   declined   → the same two pages, with the waiting screen saying so
 * The page learns which through <html data-member="ok|pending|declined"> and the `tl:me` event.
 * Data is protected by row-level security in the database; this only decides what to show.
 */
import { configured } from '../lib/supabase';
import { GATE, HOME, me, signOut, touchLastSeen, waitingCount } from '../lib/auth';
import { shortName } from '../lib/portal/names';
import { SIGNED_OUT_EVENT, signingOutOnPurpose, watchSession } from '../lib/portal/session';

const PROFILE = '/alumni-portal/profile';
const here = () => location.pathname.replace(/\/$/, '');

async function gate() {
  if (!configured()) return;
  // never on the sign-in page itself: after an in-site page change this listener still fires there, and "not signed in →
  // go to sign-in" reloaded it, wiping the "you were signed out" note and its ?again (found by location-suggest.mjs)
  if (here() === GATE) return;
  const root = document.documentElement;
  const who = await me();
  if (!who) { location.replace(GATE); return; }
  const state = who.approved ? 'ok' : who.declined ? 'declined' : 'pending';
  root.dataset.member = state;
  if (here() === HOME && returnIfAsked()) return;

  if (state !== 'ok') {
    // first things first: a new account creates its profile; then the waiting screen is the only other page
    if (state === 'pending' && !who.submitted && here() !== PROFILE) { location.replace(`${PROFILE}?welcome=1${here() === HOME ? '&from=search' : here().startsWith('/alumni-portal/') ? '&from=elsewhere' : ''}`); return; }   // from=: say why they landed here instead (audit: SEARCH silently bounced back)
    if (here() !== PROFILE && here() !== HOME) { location.replace(HOME); return; }
  }
  if (!who.admin) {
    root.removeAttribute('data-admin');
    document.querySelectorAll('a[href="/alumni-portal/admin"]').forEach((a) => a.closest('li')?.remove() ?? a.remove());
    if (location.pathname.startsWith('/alumni-portal/admin')) { location.replace(HOME); return; }
  } else {
    root.dataset.admin = '';
    void waitingCount().then((n) => {
      document.querySelectorAll<HTMLElement>('a[href="/alumni-portal/admin"], a[href="/alumni-portal/admin/users"]').forEach((a) => {
        a.querySelector('.portal-count')?.remove();
        if (n > 0) { const b = document.createElement('span'); b.className = 'portal-count'; b.textContent = String(n); b.title = `${n} waiting for approval`; a.append(b); }
      });
    });
  }
  const name = who.full_name || who.email.split('@')[0];
  document.querySelectorAll<HTMLElement>('.nav-who').forEach((el) => { el.textContent = shortName(name).toUpperCase(); el.title = `${name} · your profile`; el.dataset.filled = ''; });
  document.dispatchEvent(new CustomEvent('tl:me', { detail: who }));
  void touchLastSeen(who.id);
  signedInAs = who.email;
  watchSession();
}

/* Signed out while a page is open (2026-10-26): the session expired while a phone had the tab in the background, or the
   server stopped accepting it. A bar says so in words and offers the way back in; the page that has a form (the profile)
   keeps what was typed (see portal-profile.ts). Nothing is saved behind their back. */
let signedInAs = '';
function showSignedOutBar() {
  if (document.getElementById('signed-out-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'signed-out-bar'; bar.className = 'portal-signed-out'; bar.setAttribute('role', 'alert');
  bar.innerHTML = `<p class="t-caption m-0">You’ve been signed out. Sign in again to save. What you typed on this page is kept on this device.</p><a class="portal-btn is-small t-label" href="${GATE}?again=1">SIGN IN AGAIN</a>`;
  // their address and this page ride along in this device's storage, never in the link (links end up in history and analytics)
  bar.querySelector('a')!.addEventListener('click', () => {
    try { if (signedInAs) sessionStorage.setItem('tl-signin-email', signedInAs); localStorage.setItem('tl-return-to', JSON.stringify({ path: location.pathname + location.search, at: Date.now() })); } catch { /* private mode: they just type it */ }
  });
  document.body.append(bar);
}
/** back from signing in again: the page they were on, once (within a day) */
function returnIfAsked(): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem('tl-return-to') ?? 'null') as { path: string; at: number } | null;
    if (!saved) return false;
    localStorage.removeItem('tl-return-to');
    if (Date.now() - saved.at > 86_400_000 || !saved.path.startsWith('/alumni-portal/') || here() === saved.path.replace(/[?#].*$/, '').replace(/\/$/, '')) return false;
    location.replace(saved.path); return true;
  } catch { return false; }
}
document.addEventListener(SIGNED_OUT_EVENT, showSignedOutBar);

function wireSignOut() {
  document.addEventListener('click', async (e) => {
    const a = (e.target as Element).closest('a[href="/alumni-portal"]') as HTMLAnchorElement | null;
    if (!a || !/sign out/i.test(a.textContent ?? '')) return;
    e.preventDefault(); signingOutOnPurpose(); await signOut(); location.href = GATE;
  }, { capture: true });
}

wireSignOut();
gate();
document.addEventListener('astro:page-load', gate);
