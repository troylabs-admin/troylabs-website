import { escapeHtml } from '../lib/portal/safe-html';
/**
 * Admin › Overview and Analytics (rebuilt 2026-10-02): every [data-stat] tile and [data-list] from the real numbers,
 * the Overview's "needs your attention", coming up / recently sent, the copyable sign-up link, and on Analytics the
 * PostHog status line ("Connected · refreshed 6:12 AM"), the 7 / 30 / 90-day period and REFRESH.
 */
import { me } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { networkStats, siteStats, type MsgLine } from '../lib/portal/stats';
import { tickNumber } from '../lib/portal/tick';
import { cleanAudience, describeAudience } from '../../supabase/functions/_shared/audience';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const set = (key: string, value: string | number) => document.querySelectorAll<HTMLElement>(`[data-stat="${CSS.escape(key)}"]`).forEach((el) => { if (typeof value === 'number' && /^\d+$/.test(el.textContent?.trim() ?? '')) tickNumber(el, parseInt(el.textContent!, 10), value); else if (typeof value === 'number') tickNumber(el, 0, value, 700); else el.textContent = value; });
const list = (key: string, rows: [string, number][], empty: string) => { const el = $(`[data-list="${key}"]`); if (el) el.innerHTML = rows.length ? rows.slice(0, 10).map(([k, n]) => `<li><span>${escapeHtml(k)}</span><span class="text-ink">${n.toLocaleString()}</span></li>`).join('') : `<li class="text-muted">${empty}</li>`; };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const msgLine = (m: MsgLine, sent: boolean) => `<li><span><a class="text-ink no-underline" href="/alumni-portal/admin/messages">${escapeHtml(m.title || '(untitled)')}</a><br><span class="t-fine text-muted">${escapeHtml(describeAudience(cleanAudience(m.audience)))} · ${m.send_by === 'both' ? 'email + text' : escapeHtml(m.send_by ?? 'email')}</span></span><span class="t-fine text-muted" style="text-align:right">${sent ? `${escapeHtml(when(m.when))}<br>${m.sent_count} sent${m.failed_count ? ` · ${m.failed_count} failed` : ''}` : escapeHtml(when(m.when))}</span></li>`;
let days = 30, siteSeq = 0;   // siteSeq: only the latest period's answer is drawn (a slow 30-day answer once landed under "last 7 days")

async function delivery(): Promise<{ email: any; text: any } | null> {
  const { data: { session } } = await supabase().auth.getSession(); if (!session) return null;
  const r = await fetch('https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/send-message', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'status' }) }).catch(() => null);
  return r?.ok ? r.json() : null;
}

async function fillNetwork() {
  const n = await networkStats().catch(() => null);
  if (!n) { document.querySelectorAll<HTMLElement>('[data-stat]:not([data-stat^="site:"])').forEach((el) => (el.textContent = 'Unavailable')); return null; }
  set('members', n.members); set('students', n.students); set('alumni', n.alumni); set('active30', n.active30); set('pending', n.pending); set('completeness', `${n.completeness}%`); set('sentThisMonth', n.sentThisMonth); set('newThisMonth', n.newThisMonth);
  const hint = $('[data-stat-hint="members"]'); if (hint) hint.textContent = `${n.students} ${n.students === 1 ? 'student' : 'students'} · ${n.alumni} ${n.alumni === 1 ? 'alum' : 'alumni'}`;
  list('byCohort', n.byCohort, 'No semesters recorded yet.'); list('byCity', n.byCity, 'No cities yet.');
  const up = $('[data-upcoming]'); if (up) up.innerHTML = n.upcoming.length ? n.upcoming.map((m) => msgLine(m, false)).join('') : '<li class="text-muted"><span>Nothing scheduled. <a href="/alumni-portal/admin/messages" class="portal-linklike no-underline">Write a message</a> and pick SCHEDULE to send it later.</span></li>';
  const rec = $('[data-recent]'); if (rec) rec.innerHTML = n.recent.length ? n.recent.map((m) => msgLine(m, true)).join('') : '<li class="text-muted">Nothing sent yet.</li>';
  return n;
}

async function fillSite() {
  const status = $('[data-site-status]'); const want = days, seq = ++siteSeq;
  document.querySelectorAll<HTMLElement>('[data-period]').forEach((el) => (el.textContent = `last ${want} days`));
  const s = await siteStats(want); if (seq !== siteSeq) return;   // a newer period was picked while this one loaded
  const hint = $('[data-stat-hint="site:$pageview"]'); if (hint) hint.textContent = `page views, last ${want} days`;
  if (!s.configured || s.error) {
    if (status) { status.classList.add('is-warn'); status.textContent = !s.configured ? 'PostHog isn’t connected: the POSTHOG_API_KEY secret is missing on the posthog-stats function. Website and portal-use numbers can’t load until it’s added.' : `PostHog couldn’t be read just now (${s.error}). Press REFRESH to try again.`; }
    document.querySelectorAll<HTMLElement>('[data-stat^="site:"]').forEach((el) => (el.textContent = '—')); return;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-stat^="site:"]')) { const ev = el.dataset.stat!.slice(5); set(el.dataset.stat!, s.counts?.[ev] ?? 0); }
  list('pages', s.pages ?? [], 'No page views in this period.');
  list('portalPages', s.portalPages ?? [], 'Nobody opened the portal in this period.');
  const dev = Object.entries(s.devices ?? {}).sort((a, b) => b[1] - a[1]).map(([d, c]) => [d === 'unknown' ? 'not recorded' : d, c] as [string, number]);
  list('devices', dev, 'No data in this period.');
  if (status) { status.classList.remove('is-warn'); status.textContent = `Connected to PostHog · refreshed ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · last ${want} days`; }
}

async function fillAttention(n: Awaited<ReturnType<typeof fillNetwork>>) {
  const box = $('[data-attention]'); if (!box) return;
  const d = await delivery(); const items: string[] = [];
  if (n?.pending) items.push(`<li><span><span class="text-ink">${n.pending} ${n.pending === 1 ? 'person is' : 'people are'} waiting for approval.</span></span><a class="t-label portal-linklike no-underline" style="color:var(--color-orange)" href="/alumni-portal/admin/users#approvals">REVIEW →</a></li>`);
  if (n?.unfinished) items.push(`<li class="text-muted"><span>${n.unfinished} ${n.unfinished === 1 ? 'sign-up is' : 'sign-ups are'} still filling in ${n.unfinished === 1 ? 'their' : 'their'} profile. Nothing to do yet.</span></li>`);
  if (d && !d.email?.configured) items.push('<li><span>Email isn’t connected yet (no Resend key), so messages can be written and scheduled but not sent.</span><a class="t-label portal-linklike no-underline" href="/alumni-portal/admin/handoff">TECH STACK →</a></li>');
  else if (d?.email?.testMode) items.push('<li><span>Email is in Resend’s test mode: it only reaches you until usctroylabs.com is verified.</span><a class="t-label portal-linklike no-underline" href="/alumni-portal/admin/handoff">TECH STACK →</a></li>');
  if (d && (!d.text?.configured || d.text?.error)) items.push('<li><span>Texts aren’t connected yet (no Twilio keys).</span><a class="t-label portal-linklike no-underline" href="/alumni-portal/admin/handoff">TECH STACK →</a></li>');
  else if (d?.text?.trial) items.push('<li><span>Texts are on a Twilio trial: only Twilio’s sample texts can go out until the account is upgraded and the number verified.</span><a class="t-label portal-linklike no-underline" href="/alumni-portal/admin/handoff">TECH STACK →</a></li>');
  box.innerHTML = items.join('') || '<li class="text-muted">All caught up: nobody is waiting and messages can go out.</li>';
}

async function fill() {
  const n = await fillNetwork();
  await Promise.all([document.querySelector('[data-stat^="site:"]') ? fillSite() : Promise.resolve(), fillAttention(n)]);
}
async function init() {
  // once per page: the flag lives on the page's own element, so the first load (module run + astro:page-load) wires once
  // and a client-side navigation to a fresh page wires again (it used to wire twice and fetch everything twice)
  const page = document.querySelector<HTMLElement>('[data-stat]'); if (!page || page.dataset.statsWired) return; page.dataset.statsWired = '1';
  days = 30;
  document.querySelectorAll<HTMLElement>('[data-action="refresh"]').forEach((b) => { b.dataset.wired = '1'; b.addEventListener('click', async (e) => { e.preventDefault(); b.setAttribute('aria-busy', 'true'); b.textContent = 'REFRESHING…'; await fill(); b.removeAttribute('aria-busy'); b.textContent = 'REFRESH'; }); });
  document.querySelectorAll<HTMLElement>('[data-days] .portal-chip').forEach((c) => c.addEventListener('click', () => { days = Number(c.dataset.value); setTimeout(() => void fillSite(), 0); }));
  const copy = $('[data-copy-link]'); copy?.addEventListener('click', async () => { const v = ($('[data-signup-link]') as HTMLInputElement).value; try { await navigator.clipboard.writeText(v); copy.textContent = 'COPIED'; } catch { ($('[data-signup-link]') as HTMLInputElement).select(); copy.textContent = 'SELECTED: PRESS ⌘C'; } setTimeout(() => (copy.textContent = 'COPY'), 1800); });
  const who = await me(); if (!who?.admin) return; await fill();
}
init();
document.addEventListener('astro:page-load', init);
