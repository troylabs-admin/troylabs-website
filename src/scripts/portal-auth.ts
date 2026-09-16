/**
 * The gate on every signed-in portal page. No session → back to the sign-in. With one: the nav names
 * you, ADMIN shows only to admins (and /admin pages bounce non-admins), and the page learns whether
 * you are approved yet (<html data-member="ok|pending">) so it can show the network or the waiting note.
 * Without Supabase configured (a preview build) it does nothing, and the design preview stays usable.
 */
import { configured } from '../lib/supabase';
import { GATE, HOME, me, signOut, touchLastSeen } from '../lib/auth';

async function gate() {
  if (!configured()) return;
  const root = document.documentElement;
  const who = await me();
  if (!who) { location.replace(GATE); return; }
  root.dataset.member = who.approved ? 'ok' : 'pending';
  root.dataset.admin = who.admin ? '' : undefined as unknown as string;
  if (!who.admin) { root.removeAttribute('data-admin'); document.querySelectorAll('a[href="/alumni-portal/admin"]').forEach((a) => a.closest('li')?.remove() ?? a.remove()); }
  if (!who.admin && location.pathname.startsWith('/alumni-portal/admin')) { location.replace(HOME); return; }
  const name = who.full_name || who.email.split('@')[0];
  document.querySelectorAll<HTMLElement>('.nav-who').forEach((el) => { el.textContent = name.toUpperCase(); });
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
