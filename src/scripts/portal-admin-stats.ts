/** Admin › Overview and Analytics: fill every [data-stat] tile and [data-list] from the real numbers. */
import { me } from '../lib/auth';
import { networkStats, siteStats } from '../lib/portal/stats';
import { tickNumber } from '../lib/portal/tick';

const set = (key: string, value: string | number) => document.querySelectorAll<HTMLElement>(`[data-stat="${CSS.escape(key)}"]`).forEach((el) => { if (typeof value === 'number' && /^\d+$/.test(el.textContent?.trim() ?? '')) tickNumber(el, parseInt(el.textContent!, 10), value); else if (typeof value === 'number') tickNumber(el, 0, value, 700); else el.textContent = value; });
const list = (key: string, rows: [string, number][], empty: string) => { const el = document.querySelector<HTMLElement>(`[data-list="${key}"]`); if (el) el.innerHTML = rows.length ? rows.slice(0, 10).map(([k, n]) => `<li><span>${k}</span><span class="text-ink">${n}</span></li>`).join('') : `<li class="text-muted">${empty}</li>`; };

async function fill() {
  const n = await networkStats();
  set('members', n.members); set('students', n.students); set('alumni', n.alumni); set('active30', n.active30); set('pending', n.pending); set('completeness', `${n.completeness}%`); set('sentThisMonth', n.sentThisMonth);
  const hint = document.querySelector<HTMLElement>('[data-stat-hint="members"]'); if (hint) hint.textContent = `${n.students} students · ${n.alumni} alumni`;
  list('byCohort', n.byCohort, 'No semesters recorded yet.'); list('byCity', n.byCity, 'No cities yet.');
  const recent = document.querySelector<HTMLElement>('[data-recent-messages]'); if (recent && n.recent.length) recent.innerHTML = n.recent.map((m) => `<span class="text-ink">${m.title || '(untitled)'}</span> <span class="text-muted">· ${m.state}${m.when ? ` · ${new Date(m.when).toLocaleDateString()}` : ''}</span>`).join('<br>');
  if (!document.querySelector('[data-stat^="site:"]')) return;
  const s = await siteStats(30); const src = document.querySelector<HTMLElement>('[data-site-source]');
  if (!s.configured) { if (src) src.textContent = 'PostHog is not connected yet: add a personal API key as the POSTHOG_API_KEY secret on the posthog-stats function.'; return; }
  if (s.error) { if (src) src.textContent = `PostHog could not be read: ${s.error}`; return; }
  for (const [ev, count] of Object.entries(s.counts ?? {})) set(`site:${ev}`, count);
  for (const el of document.querySelectorAll<HTMLElement>('[data-stat^="site:"]')) if (el.textContent === '—') el.textContent = '0';
  list('pages', s.pages ?? [], 'No page views yet.');
  const dev = document.querySelector<HTMLElement>('[data-devices]'); if (dev) dev.textContent = Object.entries(s.devices ?? {}).map(([d, c]) => `${d} ${c}`).join(' · ') || 'no data yet';
}
async function init() {
  const page = document.querySelector<HTMLElement>('[data-stat]'); if (!page || document.documentElement.dataset.statsWired) return; document.documentElement.dataset.statsWired = '1';
  document.querySelectorAll<HTMLElement>('[data-action="refresh"]').forEach((b) => { b.dataset.wired = '1'; b.addEventListener('click', async (e) => { e.preventDefault(); await fill(); const o = b.textContent; b.textContent = 'REFRESHED'; setTimeout(() => { b.textContent = o; }, 1500); }); });
  const who = await me(); if (!who?.admin) return; await fill();
}
init();
document.addEventListener('astro:page-load', () => { delete document.documentElement.dataset.statsWired; init(); });
