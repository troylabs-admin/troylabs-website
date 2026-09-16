/** The sign-in page: one field, one button, a magic link. Already signed in → straight to the network. */
import { configured } from '../lib/supabase';
import { HOME, me, sendMagicLink } from '../lib/auth';

function init() {
  const form = document.getElementById('portal-auth') as HTMLFormElement | null;
  if (!form || form.dataset.ready) return;
  form.dataset.ready = '1';
  const msg = document.getElementById('portal-msg')!;
  const email = document.getElementById('portal-email') as HTMLInputElement;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  for (const tab of form.querySelectorAll<HTMLElement>('.portal-tab')) {
    tab.addEventListener('click', () => {
      form.dataset.tab = tab.dataset.tab;
      for (const b of form.querySelectorAll('.portal-tab')) b.setAttribute('aria-selected', String(b === tab));
      email.required = tab.dataset.tab === 'login'; msg.textContent = '';
    });
  }
  if (!configured()) {   // preview build: say so, never fake a login
    form.addEventListener('submit', (e) => { e.preventDefault(); msg.textContent = 'Sign-in opens when the alumni database goes live. Check back soon.'; });
    return;
  }
  me().then((who) => { if (who) location.replace(HOME); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!email.value.trim()) { msg.textContent = 'Enter the email on your profile.'; email.focus(); return; }
    button.disabled = true; msg.textContent = 'Sending your link…';
    const r = await sendMagicLink(email.value);
    button.disabled = false;
    msg.textContent = r.ok ? `Check your email — the link is on its way to ${email.value.trim()}. It works once and expires in an hour.` : r.message;
    if (r.ok) email.blur();
  });
}
init();
document.addEventListener('astro:page-load', init);
