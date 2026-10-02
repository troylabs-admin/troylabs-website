import { escapeHtml, webUrl } from '../lib/portal/safe-html';
/** A member's page: the profile behind ?id=, drawn in the same language as the search cards. */
import { avatarUrl, cityLabel, cohortOf, getProfile, initialsOf, roleLabel } from '../lib/portal/data';

async function init() {
  const head = document.querySelector<HTMLElement>('[data-member-head]'); if (!head || head.dataset.wired) return; head.dataset.wired = '1';
  const empty = document.querySelector<HTMLElement>('[data-member-empty]')!; const body = document.querySelector<HTMLElement>('[data-member-body]')!;
  const params = new URLSearchParams(location.search); const id = params.get('id');
  // back to wherever the admin came from (Bryan, 2026-10-02: VIEW PROFILE from the approval list used to strand you on "back to search")
  const from = params.get('from'); const back = document.querySelector<HTMLAnchorElement>('[data-back]');
  if (back && !from) { try { const last = sessionStorage.getItem('tl-last-search'); if (last?.startsWith('/alumni-portal/home')) back.href = last; } catch { /* keeps the plain link */ } }   // back to the same results
  if (back && (from === 'approvals' || from === 'members')) { back.href = `/alumni-portal/admin/users${from === 'approvals' ? '#approvals' : '#members'}`; back.textContent = from === 'approvals' ? '← BACK TO WAITING FOR APPROVAL' : '← BACK TO MEMBERS'; }
  if (!id) { empty.textContent = 'No member chosen. Go back to search and pick someone.'; return; }
  const got = await getProfile(id).catch(() => null);
  if (!got) { empty.textContent = 'This member is not in the network, or you are not signed in as an approved member.'; return; }
  const { row: r, roles } = got;
  const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
  const av = $('[data-m-avatar]'); const url = avatarUrl(r); av.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="">` : initialsOf(r.full_name || '?');
  $('[data-m-name]').textContent = r.full_name || 'Unnamed member'; $('[data-m-status]').textContent = r.status === 'student' ? 'STUDENT' : 'ALUM';
  $('[data-m-work]').textContent = [r.current_title, r.current_company].filter(Boolean).join(' at ');
  const meta = [cityLabel(r.city), cohortOf(r.join_term, r.join_year) ? `Joined ${cohortOf(r.join_term, r.join_year)}` : '', r.grad_year ? (r.status === 'alum' ? `Class of ${r.grad_year}` : `Expected ${r.grad_year}`) : ''].filter(Boolean).join(' · ');
  $('[data-m-meta]').textContent = meta;
  const li = $('[data-m-linkedin]') as HTMLAnchorElement; if (r.linkedin_url && webUrl(r.linkedin_url)) { li.href = webUrl(r.linkedin_url)!; li.hidden = false; }
  const em = $('[data-m-email]') as HTMLAnchorElement; const addr = r.personal_email || r.usc_email; if (addr) { em.href = `mailto:${addr}`; em.hidden = false; }
  $('[data-m-bio]').textContent = r.bio || 'No bio yet.';
  const sections: [string, string[]][] = [['E-Board roles', roleLabel(roles)], ['Divisions', r.divisions ?? []], ['TL BUILD startups', r.startups ?? []], ['Industries', r.industries ?? []]].filter(([, items]) => items.length) as [string, string[]][];
  $('[data-m-sections]').innerHTML = sections.map(([h, items]) => `<h2 class="t-sub portal-section-h">${h}</h2><div class="flex flex-wrap portal-card-tags" style="margin-top:0">${items.map((t) => `<span class="t-fine portal-tag">${escapeHtml(t)}</span>`).join('')}</div>`).join('');
  document.title = `${r.full_name || 'Member'} — TL Alumni Network Portal`;
  empty.hidden = true; head.hidden = false; body.hidden = false;
}
init();
document.addEventListener('astro:page-load', init);
