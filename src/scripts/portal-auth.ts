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

const PROFILE = '/alumni-portal/profile';
const here = () => location.pathname.replace(/\/$/, '');

async function gate() {
  if (!configured()) return;
  const root = document.documentElement;
  const who = await me();
  if (!who) { location.replace(GATE); return; }
  const state = who.approved ? 'ok' : who.declined ? 'declined' : 'pending';
  root.dataset.member = state;

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
  document.querySelectorAll<HTMLElement>('.nav-who').forEach((el) => { el.textContent = name.toUpperCase(); el.dataset.filled = ''; });
  document.dispatchEvent(new CustomEvent('tl:me', { detail: who }));
  void touchLastSeen(who.id);
}

function wireSignOut() {
  document.addEventListener('click', async (e) => {
    const a = (e.target as Element).closest('a[href="/alumni-portal"]') as HTMLAnchorElement | null;
    if (!a || !/sign out/i.test(a.textContent ?? '')) return;
    e.preventDefault(); await signOut(); location.href = GATE;
  }, { capture: true });
}

wireSignOut();
gate();
document.addEventListener('astro:page-load', gate);
