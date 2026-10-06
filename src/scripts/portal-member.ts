import { escapeHtml, webUrl } from '../lib/portal/safe-html';
/** A member's page: the profile behind ?id=, drawn in the same language as the search cards. */
import { avatarUrl, cityLabel, getProfile, initialsOf, roleLabel } from '../lib/portal/data';
import { getHistory, historyHtml } from '../lib/portal/work-render';
import { prettyPhone } from '../lib/portal/phone';

async function init() {
  const head = document.querySelector<HTMLElement>('[data-member-head]'); if (!head || head.dataset.wired) return; head.dataset.wired = '1';
  const empty = document.querySelector<HTMLElement>('[data-member-empty]')!; const body = document.querySelector<HTMLElement>('[data-member-body]')!;
  const params = new URLSearchParams(location.search); const id = params.get('id');
  // back to wherever the admin came from (Bryan, 2026-10-02: VIEW PROFILE from the approval list used to strand you on "back to search")
  const from = params.get('from'); const back = document.querySelector<HTMLAnchorElement>('[data-back]');
  if (back && !from) { try { const last = sessionStorage.getItem('tl-last-search'); if (last?.startsWith('/alumni-portal/home')) back.href = last; } catch { /* keeps the plain link */ } }   // back to the same results
  const co = params.get('co');   // opened from a company page
  if (back && from === 'company' && co) { back.href = `/alumni-portal/companies/?id=${encodeURIComponent(co)}`; back.textContent = '← BACK TO COMPANY'; }
  if (back && (from === 'approvals' || from === 'members')) { back.href = `/alumni-portal/admin/users${from === 'approvals' ? '#approvals' : '#members'}`; back.textContent = from === 'approvals' ? '← BACK TO WAITING FOR APPROVAL' : '← BACK TO MEMBERS'; }
  if (!id) { empty.textContent = 'No member chosen. Go back to search and pick someone.'; return; }
  const [got, history] = await Promise.all([getProfile(id).catch(() => null), getHistory(id).catch(() => null)]);
  if (!head.isConnected) return;   // left the page while it loaded (client-side navigation keeps this script running)
  if (!got) { empty.textContent = 'This member is not in the network, or you are not signed in as an approved member.'; return; }
  const { row: r, roles } = got;
  const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
  const av = $('[data-m-avatar]'); const url = avatarUrl(r); av.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="">` : initialsOf(r.full_name || '?');
  $('[data-m-name]').textContent = r.full_name || 'Unnamed member'; $('[data-m-status]').textContent = r.status === 'student' ? 'STUDENT' : 'ALUM';
  $('[data-m-work]').textContent = [r.current_title, r.current_company].filter(Boolean).join(' at ') || (r.linkedin_headline ?? '');   // their LinkedIn headline when they haven't typed a job
  // plain words, not codes (Bryan, 2026-10-05: "TL FA24", "Expected" read as jargon)
  const meta = [cityLabel(r.city), r.join_year && r.join_term ? `Joined TroyLabs in ${r.join_term === 'FA' ? 'Fall' : 'Spring'} ${r.join_year}` : '', r.grad_year ? `Class of ${r.grad_year}` : ''].filter(Boolean).join(' · ');
  $('[data-m-meta]').textContent = meta;
  const li = $('[data-m-linkedin]') as HTMLAnchorElement; if (r.linkedin_url && webUrl(r.linkedin_url)) { li.href = webUrl(r.linkedin_url)!; li.hidden = false; }
  const em = $('[data-m-email]') as HTMLAnchorElement; const addr = r.personal_email || r.usc_email; if (addr) { em.href = `mailto:${addr}`; em.hidden = false; }
  // both emails and the phone, written out: members are here to reach each other
  const contact = $('[data-m-contact]');
  const ways: [string, string | null, string][] = [['PERSONAL EMAIL', r.personal_email, `mailto:${r.personal_email}`], ['USC EMAIL', r.usc_email, `mailto:${r.usc_email}`], ['PHONE', r.phone ? prettyPhone(r.phone) : null, `tel:${r.phone}`]];
  contact.replaceChildren(...ways.filter(([, v]) => v).map(([label, value, href]) => { const row = document.createElement('div'); const dt = document.createElement('dt'); dt.className = 't-fine text-muted'; dt.textContent = label; const dd = document.createElement('dd'); const a = document.createElement('a'); a.className = 't-caption text-ink'; a.href = href; a.textContent = value!; dd.append(a); row.append(dt, dd); return row; }));
  contact.hidden = !contact.childElementCount;
  $('[data-m-bio]').textContent = r.bio || r.linkedin_about || 'No bio yet.';   // what they typed wins; else their LinkedIn About
  const sections: [string, string[]][] = [['E-Board roles', roleLabel(roles)], ['Divisions', r.divisions ?? []], ['TL BUILD startups', r.startups ?? []], ['Industries', r.industries ?? []]].filter(([, items]) => items.length) as [string, string[]][];
  $('[data-m-sections]').innerHTML = sections.map(([h, items]) => `<h2 class="t-sub portal-section-h">${h}</h2><div class="flex flex-wrap portal-card-tags" style="margin-top:0">${items.map((t) => `<span class="t-fine portal-tag">${escapeHtml(t)}</span>`).join('')}</div>`).join('');
  if (history) { $('[data-m-work-history]').innerHTML = historyHtml(history, { part: 'work' }); $('[data-m-extras]').innerHTML = historyHtml(history, { part: 'extras' }); }
  document.title = `${r.full_name || 'Member'} — TL Alumni Network Portal`;
  empty.hidden = true; head.hidden = false; body.hidden = false;
}
init();
document.addEventListener('astro:page-load', init);
