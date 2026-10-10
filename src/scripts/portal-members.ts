/**
 * Admin › Members, for real: the waiting list (built for a hundred: search, sort, select all, bulk approve /
 * decline with UNDO, 25 at a time), a server-paged member directory, admin on/off, e-board roles saved per person, and
 * a CSV export of the current filter. All through the browser client under the admin policies.
 */
import { me } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { webUrl } from '../lib/portal/safe-html';
import { approveMany, avatarUrl, cityLabel, cohortOf, declineMany, initialsOf, restoreMany, setAdmin, setDeclined, setRestored, setRoles, type ProfileRow, type RoleRow } from '../lib/portal/data';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fb = (text: string, ok = true) => { const el = document.getElementById('members-fb'); if (el) { el.textContent = text; el.style.color = ok ? '' : 'var(--color-orange)'; } };
let rows: ProfileRow[] = [], admins = new Set<string>(), roles: RoleRow[] = [], myId = '';
const PAGE = 25;
const q = { search: '', sort: 'oldest', shown: PAGE, picked: new Set<string>(), open: new Set<string>() };
let qBusy = false;
let pendingDecline: string[] = [];
let lastAction: { kind: 'approved' | 'declined'; ids: string[] } | null = null;

type MemberRow = ProfileRow & { is_admin: boolean; roles: RoleRow[] };
let memberRows: MemberRow[] = [], memberPage = 1, memberTotal = 0, memberSize = 20, memberCohorts: string[] = [];
let memberRequest = 0, memberTimer: ReturnType<typeof setTimeout> | undefined, membersReady = false, memberExporting = false, memberLoadFailed = false;
let memberExportGeneration = 0;
const memberFilters = () => {
  const picked = (key: string) => [...document.querySelectorAll<HTMLElement>(`[data-filter="${key}"] .portal-chip[aria-pressed="true"]`)].map(el => el.dataset.value!);
  return { p_search: (document.getElementById('members-q') as HTMLInputElement).value.trim(), p_statuses: picked('status').map(s=>s.toLowerCase()), p_cohorts: picked('cohort'), p_divisions: picked('division') };
};
function memberPaging(busy = false) {
  const pages = Math.max(1, Math.ceil(memberTotal / memberSize));
  document.querySelectorAll<HTMLButtonElement>('[data-member-prev]').forEach(b=>b.disabled=busy||memberPage<=1);
  document.querySelectorAll<HTMLButtonElement>('[data-member-next]').forEach(b=>b.disabled=busy||memberPage>=pages);
  document.querySelectorAll<HTMLElement>('[data-page-label]').forEach(el=>el.textContent=busy?'Loading members…':`Page ${memberPage} of ${pages}`);
  const count = document.querySelector<HTMLElement>('[data-members-count]');
  if(count) count.textContent=busy?'Loading…':memberTotal?`Showing ${((memberPage-1)*memberSize+1).toLocaleString()}–${Math.min(memberPage*memberSize,memberTotal).toLocaleString()} of ${memberTotal.toLocaleString()} members`:'No members match these filters.';
  const selected = Object.values(memberFilters()).filter(Array.isArray).reduce((n,a)=>n+a.length,0);
  document.querySelector<HTMLElement>('[data-filter-count]')!.textContent=selected?`(${selected} active)`:'';
  document.querySelector<HTMLButtonElement>('[data-action="export"]')!.disabled=busy||!membersReady||memberExporting;
}
async function loadMembers() {
  const table=document.querySelector<HTMLElement>('[data-members]'); if(!table) return;
  const request=++memberRequest; membersReady=false; memberPaging(true); table.setAttribute('aria-busy','true');
  table.querySelector('tbody')!.innerHTML='<tr><td colspan="7" class="text-muted">Loading members…</td></tr>';
  const result=await supabase().rpc('admin_member_page',{...memberFilters(),p_page:memberPage,p_page_size:memberSize});
  if(!table.isConnected||request!==memberRequest) return;
  table.setAttribute('aria-busy','false');
  if(result.error){memberLoadFailed=true;memberPaging(true);document.querySelectorAll<HTMLElement>('[data-page-label]').forEach(el=>el.textContent='Members unavailable');document.querySelector<HTMLElement>('[data-members-count]')!.textContent='Couldn’t load members.';table.querySelector('tbody')!.innerHTML='<tr><td colspan="7" class="text-muted">Couldn’t load members. <button type="button" class="portal-linklike" data-member-retry>TRY AGAIN</button></td></tr>';fb('Couldn’t load members. Try again before making changes.',false);return;}
  if(memberLoadFailed){fb('');memberLoadFailed=false;}
  const data=result.data;memberRows=data.rows??[];memberTotal=data.total??0;memberPage=data.page??1;memberCohorts=data.cohorts??[];
  rows=rows.filter(r=>!r.approved).concat(memberRows);admins=new Set(memberRows.filter(r=>r.is_admin).map(r=>r.id));roles=memberRows.flatMap(r=>r.roles??[]);membersReady=true;
  renderTable();renderCohortChips();memberPaging();
}
async function load() {
  const root=document.getElementById('requests-list');if(!root)return;
  // Approval selection spans the whole waiting list; fetch it separately in bounded requests.
  const pending:ProfileRow[]=[];const sb=supabase();let failed=false;
  for(let from=0;;from+=100){
    const {data,error}=await sb.from('profiles').select('*, city:cities(*)').eq('approved',false).order('id').range(from,from+99);
    if(!root.isConnected)return;
    if(error){failed=true;break;}pending.push(...(data??[]));if((data??[]).length<100)break;
  }
  if(failed){
    root.innerHTML='<li class="t-caption text-muted">Couldn’t load applications. Reload to try again.</li>';
    document.querySelectorAll<HTMLElement>('[data-q-bar], [data-q-tools], [data-q-more], #declined-fold').forEach(el=>el.hidden=true);
    await loadMembers();return;
  }
  rows=pending.concat(memberRows);renderRequests();await loadMembers();
}

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const ago = (iso: string) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : date(iso); };
const termWord = (t: string) => (t === 'FA' ? 'Fall' : 'Spring');
/** "Director of Tech (Fall 2024, Spring 2025)" */
const claimedText = (r: ProfileRow) => { const by = new Map<string, string[]>(); for (const c of r.claimed_roles ?? []) by.set(c.role, [...(by.get(c.role) ?? []), `${termWord(c.term)} ${c.year}`]); return [...by].map(([role, terms]) => `${role[0]}${role.slice(1).toLowerCase()} (${terms.join(', ')})`).join('; '); };
const waiting = () => rows.filter((r) => !r.approved && !r.declined_at);
const ready = () => waiting().filter((r) => r.submitted_at);   // SUBMIT FOR APPROVAL pressed; anyone still filling in their profile isn't shown
/** the queue as shown: search, then sort */
function queue() {
  const words = q.search.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = (r: ProfileRow) => `${r.full_name} ${r.personal_email ?? ''} ${r.usc_email ?? ''} ${(r.divisions ?? []).join(' ')} ${cohortOf(r.join_term, r.join_year)} ${r.grad_year ?? ''} ${r.request_note ?? ''} ${claimedText(r)}`.toLowerCase();
  const list = ready().filter((r) => words.every((w) => hay(r).includes(w)));
  return list.sort((x, y) => q.sort === 'name' ? x.full_name.localeCompare(y.full_name) : q.sort === 'newest' ? y.created_at.localeCompare(x.created_at) : x.created_at.localeCompare(y.created_at));
}
function renderRequests() {
  const list = document.getElementById('requests-list')!; const all = ready(); const matching = queue(); const shown = matching.slice(0, q.shown);
  for (const id of [...q.picked]) if (!all.some((r) => r.id === id)) q.picked.delete(id);   // decided elsewhere, or gone
  document.getElementById('requests-n')!.textContent = all.length.toLocaleString();
  (document.querySelector('[data-q-tools]') as HTMLElement).hidden = all.length < 2;
  (document.querySelector('[data-q-bar]') as HTMLElement).hidden = !all.length;
  list.innerHTML = shown.length ? shown.map((r) => {
    const photo = avatarUrl(r); const li = r.linkedin_url ? webUrl(r.linkedin_url) : null; const claimed = claimedText(r);
    const year = r.grad_year ? (r.status === 'alum' ? `Class of ${r.grad_year}` : `Expected ${r.grad_year}`) : '';
    const facts = [year, cohortOf(r.join_term, r.join_year) ? `joined ${cohortOf(r.join_term, r.join_year)}` : '', (r.divisions ?? []).join(', ')].filter(Boolean).map(esc).join(' · ');
    const emails = [r.personal_email, r.usc_email].filter(Boolean).map((e) => esc(e!)).join(' · ');
    const open = q.open.has(r.id);
    return `<li class="portal-request portal-q-row${q.picked.has(r.id) ? ' is-selected' : ''}" data-id="${r.id}">
      <label class="portal-check portal-q-pick" aria-label="Select ${esc(r.full_name)}"><input type="checkbox" data-q-pick="${r.id}"${q.picked.has(r.id) ? ' checked' : ''} /><i></i></label>
      <span class="portal-avatar t-fine" aria-hidden="true">${photo ? `<img src="${esc(photo)}" alt="">` : esc(initialsOf(r.full_name))}</span>
      <div class="portal-q-main">
        <p class="m-0"><span class="text-ink portal-q-name">${esc(r.full_name)}</span> <span class="t-fine portal-tag">${r.status === 'student' ? 'STUDENT' : 'ALUM'}</span></p>
        <p class="m-0 t-fine text-muted">${facts}</p>
        ${claimed ? `<p class="m-0 t-fine portal-q-claim">E-board: ${esc(claimed)}</p>` : ''}
        <p class="m-0 t-fine text-muted">${emails} · submitted ${ago(r.submitted_at || r.created_at)}</p>
      </div>
      <div class="portal-request-actions portal-q-actions">
        <button type="button" class="t-label portal-linklike" style="color:var(--color-orange)" data-approve="${r.id}">APPROVE</button>
        <button type="button" class="t-label portal-linklike" data-decline="${r.id}">DECLINE</button>
        <button type="button" class="t-label portal-linklike" data-q-details="${r.id}" aria-expanded="${open}">${open ? 'LESS' : 'DETAILS'}</button>
      </div>
      <div class="portal-q-details t-fine" ${open ? '' : 'hidden'}>
        ${r.request_note ? `<p class="m-0"><span class="text-muted">Their note:</span> “${esc(r.request_note)}”</p>` : '<p class="m-0 text-muted">No note.</p>'}
        <p class="m-0"><span class="text-muted">Now:</span> ${esc([r.current_title, r.current_company].filter(Boolean).join(' at ') || '—')} · ${esc(cityLabel(r.city) || 'no city')}</p>
        <p class="m-0">${li ? `<a href="${esc(li)}" target="_blank" rel="noopener noreferrer" class="text-ink">LinkedIn ↗</a> · ` : ''}<a class="portal-linklike no-underline" href="/alumni-portal/members/?id=${r.id}&from=approvals">VIEW FULL PROFILE →</a></p>
      </div>
    </li>`;
  }).join('') : `<li class="t-caption text-muted">${all.length ? 'Nobody matches that search.' : 'Nobody waiting. New sign-ups show up here once they finish their profile.'}</li>`;
  const more = document.querySelector<HTMLButtonElement>('[data-q-more]')!; const left = matching.length - shown.length;
  more.hidden = left <= 0; more.textContent = `SHOW ${Math.min(PAGE, left)} MORE · ${left} LEFT`;
  syncPicks(shown, matching);

  const date2 = date;
  const declined = rows.filter((r) => !r.approved && r.declined_at).sort((x, y) => (y.declined_at ?? '').localeCompare(x.declined_at ?? ''));
  const fold = document.getElementById('declined-fold') as HTMLDetailsElement | null;
  if (fold) {
    fold.hidden = !declined.length; document.getElementById('declined-n')!.textContent = declined.length.toLocaleString();
    document.getElementById('declined-list')!.innerHTML = declined.map((r) => `<li data-id="${r.id}"><span class="portal-declined-who"><span class="text-ink">${esc(r.full_name || 'No name yet')}</span> <span class="text-muted">· ${esc(r.personal_email || r.usc_email || '')} · declined ${date2(r.declined_at!)}</span></span><span class="portal-inline portal-declined-actions"><button type="button" class="t-label portal-linklike" style="color:var(--color-orange)" data-approve="${r.id}">APPROVE</button><button type="button" class="t-label portal-linklike" data-restore="${r.id}">BACK TO WAITING LIST</button></span></li>`).join('');
  }
  // the nav badges count the people who can be decided now
  document.querySelectorAll<HTMLElement>('a[href="/alumni-portal/admin"] .portal-count, a[href="/alumni-portal/admin/users"] .portal-count').forEach((b) => { if (all.length) b.textContent = String(all.length); else b.remove(); });
}
/** the selection bar: what's ticked, select-all of what's shown, and the Gmail-style "select all N" */
function syncPicks(shown = queue().slice(0, q.shown), matching = queue()) {
  const n = q.picked.size; const allBox = document.getElementById('q-all') as HTMLInputElement | null; if (!allBox) return;
  const shownPicked = shown.filter((r) => q.picked.has(r.id)).length;
  allBox.checked = shown.length > 0 && shownPicked === shown.length; allBox.indeterminate = shownPicked > 0 && shownPicked < shown.length;
  document.querySelector<HTMLElement>('[data-q-all-label]')!.textContent = `Select ${shown.length} shown`;
  const every = document.querySelector<HTMLButtonElement>('[data-q-everyone]')!;
  every.hidden = !matching.length; every.disabled = qBusy || matching.every(r => q.picked.has(r.id)); every.textContent = `SELECT ALL ${matching.length}`;
  document.querySelector<HTMLElement>('[data-q-clear]')!.hidden = !n;
  document.querySelector<HTMLElement>('[data-q-selected]')!.textContent = `${n} selected`;
  for (const sel of ['[data-q-approve]', '[data-q-decline]']) { const b = document.querySelector<HTMLButtonElement>(sel)!; b.disabled = qBusy || !n; b.textContent = `${sel.includes('approve') ? 'APPROVE' : 'DECLINE'} ${n ? `${n} ` : ''}SELECTED`; }
}
const qfb = (html: string, ok = true) => {
  const el = document.getElementById('q-fb'); if (!el) return;
  el.innerHTML = html; el.hidden = !html; el.classList.toggle('is-error', !ok);
  if (html) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
};
function queueBusy(on: boolean) {
  qBusy = on;
  document.getElementById('approvals')?.setAttribute('aria-busy', String(on));
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('#approvals button, #approvals input, #approvals select').forEach(el => { el.disabled = on; });
  if (!on) syncPicks();
}
function cancelPendingDecline() { if (pendingDecline.length) { pendingDecline = []; qfb(''); } }
function askDecline(ids: string[]) {
  if (!ids.length) return; pendingDecline = ids;
  qfb(`<div class="portal-queue-result"><span>Decline ${people(ids.length)}? They will stay outside the network.</span><span class="portal-inline"><button type="button" class="portal-btn is-small is-quiet t-label" data-q-confirm-decline>DECLINE ${ids.length}</button><button type="button" class="t-label portal-linklike" data-q-dismiss>CANCEL</button></span></div>`);
}
const people = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'person' : 'people'}`;
/** tell the people just approved that they're in (send-message, mode 'approved'); the approval itself never depends on it */
async function emailApproved(ids: string[]): Promise<{ sent: number; texted: number; error: string | null }> {
  try {
    const { data: { session } } = await supabase().auth.getSession();
    const r = await fetch('https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/send-message', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'approved', ids }) });
    const b = await r.json().catch(() => ({})); return { sent: b.sent ?? 0, texted: b.texted ?? 0, error: r.ok ? b.error ?? null : b.error ?? `status ${r.status}` };
  } catch { return { sent: 0, texted: 0, error: 'couldn’t reach the email service' }; }
}
async function decide(kind: 'approved' | 'declined', ids: string[]) {
  if (!ids.length || qBusy) return;
  const root = document.getElementById('approvals'); queueBusy(true); pendingDecline = [];
  const names = ids.length === 1 ? (rows.find(r => r.id === ids[0])?.full_name || '1 person') : people(ids.length);
  qfb(`${kind === 'approved' ? 'Approving' : 'Declining'} ${esc(names)}…`);
  try {
    const res = kind === 'approved' ? await approveMany(ids) : await declineMany(ids);
    const notification = kind === 'approved' && !res.error && res.data !== 0 ? emailApproved(ids) : null;
    if (!root?.isConnected) { await notification; return; }
    if (res.error) { qfb(`Couldn’t ${kind === 'approved' ? 'approve' : 'decline'} the selection. ${esc(res.error.message)}`, false); return; }
    for (const id of ids) q.picked.delete(id);
    const changed = typeof res.data === 'number' ? res.data : ids.length;
    const allChanged = changed === ids.length;
    lastAction = allChanged ? { kind, ids } : null;
    const result = `<div class="portal-queue-result"><strong>${kind === 'approved' ? 'Approved' : 'Declined'} ${allChanged ? esc(names) : people(changed)}.</strong>${allChanged ? '<button type="button" class="t-label portal-linklike" data-q-undo>UNDO</button>' : ''}</div>${!allChanged ? '<p class="t-fine text-muted m-0">Some applications had already changed. The list is refreshed.</p>' : ''}`;
    await load(); if (!root.isConnected) return; queueBusy(true);
    qfb(result + (notification ? '<p class="t-fine text-muted m-0">Sending notification…</p>' : '')); queueBusy(true); fb('');
    if (notification) {
      const mail = await notification!; if (!root.isConnected) return;
      const note = mail.error
        ? `<details class="portal-queue-notice"><summary>Access granted. There was a problem with the notification.</summary><p>${esc(mail.error)}</p><p>Approval is saved. Do not approve again to retry a notification.</p></details>`
        : mail.sent || mail.texted ? `<p class="t-fine text-muted m-0">${[mail.sent && `${mail.sent} email${mail.sent === 1 ? '' : 's'}`, mail.texted && `${mail.texted} text${mail.texted === 1 ? '' : 's'}`].filter(Boolean).join(' and ')} sent.</p>` : '';
      qfb(result + note);
    }
  } catch { if (root?.isConnected) qfb('Couldn’t confirm the result. Refresh the page before trying again.', false); }
  finally { if (root?.isConnected) queueBusy(false); }
}

function renderTable() {
  const tbody = document.querySelector<HTMLElement>('[data-members] tbody')!;
  const members = memberRows;
  tbody.innerHTML = members.map((r) => {
    const status = r.status === 'student' ? 'STUDENT' : 'ALUM'; const division = (r.divisions ?? []).join(', ').replace('PRODUCT MANAGEMENT', 'PRODUCT'); const city = cityLabel(r.city); const email = r.personal_email || r.usc_email || '';
    return `<tr data-id="${r.id}" data-status="${status}" data-cohort="${cohortOf(r.join_term, r.join_year)}" data-division="${esc((r.divisions ?? []).map((d) => d.replace('PRODUCT MANAGEMENT', 'PRODUCT')).join('|'))}" data-text="${esc(`${r.full_name} ${r.usc_email ?? ''} ${r.personal_email ?? ''} ${r.current_company ?? ''} ${city} ${division}`.toLowerCase())}">
      <td class="m-name"><a class="text-ink no-underline portal-name-link" href="/alumni-portal/members/?id=${r.id}&from=members">${esc(r.full_name || '(no name yet)')}</a>${admins.has(r.id) ? ' <span class="t-fine portal-role">ADMIN</span>' : ''}<span class="t-fine text-muted m-email">${esc(email)}</span></td><td class="m-status"><span class="t-fine portal-tag">${status}</span></td><td class="text-muted m-col">${cohortOf(r.join_term, r.join_year) || '—'}</td><td class="text-muted m-col">${esc(division) || '—'}</td><td class="text-muted m-col m-city">${esc(city) || '—'}</td>
      <td class="t-fine text-muted m-meta">${[cohortOf(r.join_term, r.join_year), esc(division), esc(city)].filter(Boolean).join(' · ')}</td>
      <td class="m-actions"><span class="portal-row-actions"><a class="t-fine portal-linklike no-underline" href="/alumni-portal/profile?id=${r.id}">EDIT</a><button type="button" class="t-fine portal-linklike" data-roles-for="${r.id}">ROLES</button><button type="button" class="t-fine portal-linklike" data-admin-toggle="${r.id}"${r.id === myId ? ' disabled title="You cannot change your own admin access"' : ''}>${admins.has(r.id) ? 'REMOVE ADMIN' : 'MAKE ADMIN'}</button><button type="button" class="t-fine portal-linklike" data-remove="${r.id}"${r.id === myId ? ' disabled title="You cannot remove your own access"' : ''}>REMOVE ACCESS</button></span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="text-muted">No members match the current search or filters.</td></tr>';
}

/** the Members filter's cohort chips: every cohort approved members joined in, newest first (was four fixed ones) */
function renderCohortChips() {
  const box = document.querySelector<HTMLElement>('[data-filter="cohort"]'); if (!box) return;
  const on = new Set([...box.querySelectorAll<HTMLElement>('.portal-chip[aria-pressed="true"]')].map((c) => c.dataset.value!));
  const key = (c: string) => Number(c.slice(2)) * 2 + (c.startsWith('FA') ? 1 : 0);
  const list = [...memberCohorts].sort((a,b)=>key(b)-key(a));
  box.innerHTML = list.map((c) => `<button type="button" class="t-fine portal-chip" aria-pressed="${on.has(c)}" data-value="${esc(c)}">${esc(c)}</button>`).join('') || '<span class="t-fine text-muted">No cohorts yet</span>';
}
function openRoles(btn: HTMLElement) {
  const id = btn.dataset.rolesFor!; const tr = btn.closest('tr')!; const next = tr.nextElementSibling as HTMLElement | null;
  if (next?.classList.contains('portal-row-detail')) { next.remove(); btn.textContent = 'ROLES'; return; }
  const tpl = document.querySelector<HTMLTemplateElement>('#roles-picker')!; const row = document.createElement('tr'); row.className = 'portal-row-detail';
  const td = document.createElement('td'); td.colSpan = tr.children.length; td.appendChild(tpl.content.cloneNode(true)); row.appendChild(td); tr.after(row); btn.textContent = 'CLOSE';
  const person = rows.find((r) => r.id === id)!; td.querySelector<HTMLElement>('[data-roles-name]')!.textContent = person.full_name || 'this member';
  const list = td.querySelector<HTMLElement>('.portal-role-years')!;
  const pair = (term = 'Fall', year = '') => { const t = document.createElement('span'); t.className = 'portal-term-pair'; t.innerHTML = `<select class="t-caption portal-input portal-select" aria-label="Semester"><option${term === 'Fall' ? ' selected' : ''}>Fall</option><option${term === 'Spring' ? ' selected' : ''}>Spring</option></select><input class="t-caption portal-input" inputmode="numeric" placeholder="Year" aria-label="Year" value="${year}" style="max-width:calc(120 * var(--u))" />`; return t; };
  const addRow = (key: string, terms: [string, string][]) => { const r = document.createElement('div'); r.className = 'portal-inline portal-role-year'; r.dataset.role = key; r.innerHTML = `<span class="t-fine portal-tagx" style="flex:none">${esc(key)}</span><span class="portal-terms"></span><button type="button" class="t-label portal-linklike" data-more>+ ANOTHER SEMESTER</button>`; const box = r.querySelector('.portal-terms')!; (terms.length ? terms : [['Fall', '']] as [string, string][]).forEach(([t, y]) => box.appendChild(pair(t, y))); r.querySelector('[data-more]')!.addEventListener('click', () => box.appendChild(pair())); list.appendChild(r); };
  const mine = roles.filter((r) => r.profile_id === id); const byRole = new Map<string, [string, string][]>(); for (const r of mine) byRole.set(r.role, [...(byRole.get(r.role) ?? []), [r.term === 'FA' ? 'Fall' : 'Spring', String(r.year)]]);
  for (const chip of td.querySelectorAll<HTMLElement>('.portal-chip')) {
    const key = chip.textContent!.replace(/^✓\s*/, '').trim(); if (byRole.has(key)) { chip.setAttribute('aria-pressed', 'true'); addRow(key, byRole.get(key)!); }
    chip.addEventListener('click', () => { const on = chip.getAttribute('aria-pressed') !== 'true'; chip.setAttribute('aria-pressed', String(on)); const existing = list.querySelector<HTMLElement>(`[data-role="${CSS.escape(key)}"]`); if (on && !existing) addRow(key, []); else if (!on && existing) existing.remove(); });
  }
  td.querySelector<HTMLElement>('[data-action="save-roles"]')!.addEventListener('click', async (e) => {
    e.preventDefault(); const out: Omit<RoleRow, 'profile_id' | 'id'>[] = [];
    for (const r of list.querySelectorAll<HTMLElement>('.portal-role-year')) for (const t of r.querySelectorAll<HTMLElement>('.portal-term-pair')) { const y = parseInt(t.querySelector('input')!.value, 10); if (!/^\d{4}$/.test(t.querySelector('input')!.value.trim()) || y < 1900 || y > 2100) { td.querySelector<HTMLElement>('.portal-feedback')!.textContent = 'Enter a valid year for every selected role.'; return; } out.push({ role: r.dataset.role!, term: t.querySelector('select')!.value === 'Fall' ? 'FA' : 'SP', year: y }); }
    const res = await setRoles(id, out); const f = td.querySelector<HTMLElement>('.portal-feedback')!;
    if (res.error) { f.textContent = res.error.message; f.style.color = 'var(--color-orange)'; } else { f.textContent = out.length ? `Saved: ${out.length} semester${out.length === 1 ? '' : 's'} of e-board history.` : 'Saved: no e-board roles.'; roles = roles.filter((r) => r.profile_id !== id).concat(out.map((o) => ({ ...o, profile_id: id }))); }
  });
}

async function exportCsv() {
  if(memberExporting)return;
  const root = document.querySelector('[data-members]');
  const generation = ++memberExportGeneration;
  const current = () => root?.isConnected && generation === memberExportGeneration;
  memberExporting=true;
  const filters=memberFilters(), pick:MemberRow[]=[]; const seen=new Set<string>(); const button=document.querySelector<HTMLButtonElement>('[data-action="export"]')!;button.disabled=true;fb('Preparing the filtered export…');
  try {
    let expectedTotal: number | undefined;
    for(let page=1;;page++){
      const {data,error}=await supabase().rpc('admin_member_page',{...filters,p_page:page,p_page_size:100});
      // Astro keeps this module alive after navigation. Old exports must never update a new visit.
      if(!current())return;
      if(error)throw error;
      expectedTotal ??= data.total;
      // Offset pages can shift while another admin edits the roster. Fail rather than silently omit rows.
      if(data.total!==expectedTotal||data.page!==page)throw new Error('Member list changed during export');
      for(const row of data.rows){
        if(seen.has(row.id))throw new Error('Member order changed during export');
        seen.add(row.id);pick.push(row);
      }
      if(page*100>=data.total||!data.rows.length)break;
    }
    if(pick.length!==expectedTotal)throw new Error('Incomplete member export');
  const cols = ['full_name', 'status', 'usc_email', 'personal_email', 'phone', 'phone_opt_in', 'join', 'grad_year', 'divisions', 'current_title', 'current_company', 'city', 'industries', 'startups', 'linkedin_url', 'admin', 'email_opt_in', 'joined_at', 'submitted_at', 'approved_at', 'last_seen_at'];
  const line = (vals: unknown[]) => vals.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  const csv = [line(cols), ...pick.map((r) => line([r.full_name, r.status, r.usc_email, r.personal_email, r.phone, r.phone_opt_in, cohortOf(r.join_term, r.join_year), r.grad_year, (r.divisions ?? []).join('; '), r.current_title, r.current_company, cityLabel(r.city), (r.industries ?? []).join('; '), (r.startups ?? []).join('; '), r.linkedin_url, r.is_admin, r.email_opt_in, r.created_at, r.submitted_at, r.approved_at, r.last_seen_at]))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `troylabs-members-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);fb(`Exported ${pick.length} member${pick.length === 1 ? '' : 's'} matching the selected filters.`);
  }catch{if(current())fb('Couldn’t export all matching members. The member list may have changed; try again.',false);}
  finally{if(current()){memberExporting=false;button.disabled=!membersReady;}}
}

async function init() {
  const table = document.querySelector<HTMLElement>('[data-members]'); if (!table || table.dataset.wired) return; table.dataset.wired = '1';
  document.querySelectorAll<HTMLElement>('[data-action]').forEach((b) => { b.dataset.wired = '1'; });
  const who = await me(); if (!who?.admin || !table.isConnected) return; myId = who.id;
  // a fresh page each visit: the module outlives client-side navigation, the search box doesn't (a stale search once
  // showed "Nobody matches" under an empty box after VIEW FULL PROFILE → back)
  q.search = ''; q.sort = 'oldest'; q.shown = PAGE; q.picked.clear(); q.open.clear(); lastAction = null; qBusy = false; pendingDecline = [];
  memberSize=matchMedia('(max-width: 767px)').matches?10:20;memberPage=1;memberTotal=0;memberRows=[];membersReady=false;memberRequest++;clearTimeout(memberTimer);
  memberExportGeneration++;memberExporting=false;memberLoadFailed=false;
  const search=document.getElementById('members-q') as HTMLInputElement;
  search.addEventListener('input',()=>{memberPage=1;memberRequest++;clearTimeout(memberTimer);memberTimer=setTimeout(()=>void loadMembers(),250);});
  const screen=matchMedia('(max-width: 767px)');const resized=()=>{if(!table.isConnected){screen.removeEventListener('change',resized);return;}memberSize=screen.matches?10:20;memberPage=1;void loadMembers();};screen.addEventListener('change',resized);
  await load(); if (!table.isConnected) return;
  // the waiting list's own controls
  document.getElementById('q-search')?.addEventListener('input', (e) => { q.search = (e.target as HTMLInputElement).value; q.shown = PAGE; q.picked.clear(); cancelPendingDecline(); renderRequests(); });
  document.getElementById('q-sort')?.addEventListener('change', (e) => { q.sort = (e.target as HTMLSelectElement).value; renderRequests(); });
  document.getElementById('q-all')?.addEventListener('change', (e) => { cancelPendingDecline(); const on = (e.target as HTMLInputElement).checked; for (const r of queue().slice(0, q.shown)) on ? q.picked.add(r.id) : q.picked.delete(r.id); if (!on) q.picked.clear(); renderRequests(); });
  document.getElementById('requests-list')?.addEventListener('change', (e) => { const box = (e.target as HTMLElement).closest<HTMLInputElement>('[data-q-pick]'); if (!box) return; cancelPendingDecline(); box.checked ? q.picked.add(box.dataset.qPick!) : q.picked.delete(box.dataset.qPick!); box.closest('li')?.classList.toggle('is-selected', box.checked); syncPicks(); });
  document.querySelector('.portal-section')!.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement; const b = t.closest<HTMLElement>('button'); if (!b || (b as HTMLButtonElement).disabled || (qBusy && b.closest('#approvals'))) return;
    if (b.dataset.approve) await decide('approved', [b.dataset.approve]);
    else if (b.hasAttribute('data-q-approve')) { await decide('approved', [...q.picked]); }
    else if (b.hasAttribute('data-q-decline')) { askDecline([...q.picked]); }
    else if (b.hasAttribute('data-q-undo') && lastAction) {
      const a = lastAction, root = document.getElementById('approvals'); queueBusy(true);
      qfb('Undoing…');   // at once: the restore takes a moment, and a tap that changes nothing reads as broken (Bryan, 2026-10-08)
      try {
        const r = await restoreMany(a.ids); if (!root?.isConnected) return;
        if (r.error) qfb(`Couldn’t undo. ${esc(r.error.message)} <button type="button" class="t-label portal-linklike" data-q-undo>TRY AGAIN</button>`, false);
        else { lastAction = null; await load(); if (root.isConnected) qfb(`Undone: ${people(a.ids.length)} back on the waiting list.${a.kind === 'approved' ? '<p class="t-fine text-muted m-0">Notifications already sent cannot be recalled.</p>' : ''}`); }
      } finally { if (root?.isConnected) queueBusy(false); }
    }
    else if (b.hasAttribute('data-q-confirm-decline')) await decide('declined', [...pendingDecline]);
    else if (b.hasAttribute('data-q-dismiss')) { pendingDecline = []; qfb(''); }
    else if (b.hasAttribute('data-q-clear')) { q.picked.clear(); cancelPendingDecline(); renderRequests(); }
    else if (b.hasAttribute('data-q-everyone')) { cancelPendingDecline(); for (const r of queue()) q.picked.add(r.id); renderRequests(); }
    else if (b.hasAttribute('data-q-more')) { q.shown += PAGE; renderRequests(); }
    else if (b.dataset.qDetails) { const id = b.dataset.qDetails; q.open.has(id) ? q.open.delete(id) : q.open.add(id); const row = b.closest('li')!; const d = row.querySelector<HTMLElement>('.portal-q-details')!; d.hidden = !q.open.has(id); b.textContent = q.open.has(id) ? 'LESS' : 'DETAILS'; b.setAttribute('aria-expanded', String(q.open.has(id))); }
    else if (b.closest('[data-member-query] [data-filter]') && b.classList.contains('portal-chip')) { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); memberPage=1;await loadMembers(); }
    else if(b.hasAttribute('data-member-clear')){document.querySelectorAll('[data-member-query] .portal-chip').forEach(el=>el.setAttribute('aria-pressed','false'));search.value='';memberPage=1;await loadMembers();}
    else if(b.hasAttribute('data-member-prev')||b.hasAttribute('data-member-next')){memberPage+=b.hasAttribute('data-member-next')?1:-1;await loadMembers();document.getElementById('members')?.scrollIntoView({block:'start'});}
    else if(b.hasAttribute('data-member-retry')){await loadMembers();}
    else if (b.dataset.restore) { const r = await setRestored(b.dataset.restore); fb(r.error ? r.error.message : 'Back on the waiting list.', !r.error); await load(); }
    else if (b.dataset.decline) { askDecline([b.dataset.decline]); }
    else if (b.dataset.adminToggle) {   // one change at a time, and the list knows the answer before the next click (a quick second click used to grant again)
      if (b.getAttribute('aria-busy') === 'true') return; b.setAttribute('aria-busy', 'true'); (b as HTMLButtonElement).disabled = true;
      const id = b.dataset.adminToggle; const on = !admins.has(id); const r = await setAdmin(id, on);
      if (!r.error) { on ? admins.add(id) : admins.delete(id); }
      fb(r.error ? r.error.message : on ? 'Made admin. They see the Admin pages next time they load the portal.' : 'Admin access removed.', !r.error); await load(); }
    else if (b.dataset.remove) { if (b.dataset.remove === myId) return; const r = rows.find((x) => x.id === b.dataset.remove); if (r && confirm(`Remove ${r.full_name || 'this member'} from the network? They lose access right away and can be approved again later.`)) { const res = await setDeclined(r.id); fb(res.error ? res.error.message : 'Access removed.', !res.error); await load(); } }
    else if (b.dataset.rolesFor) openRoles(b);
    else if (b.dataset.action === 'export') { e.preventDefault(); await exportCsv(); }
  });
}
init();
document.addEventListener('astro:page-load', init);
