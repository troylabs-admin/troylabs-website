/**
 * Admin › Members, for real: the access queue (approve / decline), every profile as a row, admin on/off,
 * e-board roles saved per person, a CSV export of the current filter, and a cohort import into the
 * roster. All through the browser client under the admin policies.
 */
import { me } from '../lib/auth';
import { adminListProfiles, cityLabel, cohortOf, completeness, importRoster, listRoster, setAdmin, setApproved, setDeclined, setRoles, type ProfileRow, type RoleRow } from '../lib/portal/data';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fb = (text: string, ok = true) => { const el = document.getElementById('members-fb'); if (el) { el.textContent = text; el.style.color = ok ? '' : 'var(--color-orange)'; } };
const flash = (btn: HTMLElement, text: string) => { const o = btn.textContent; btn.classList.add('is-done'); btn.textContent = text; setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = o; }, 1600); };
let rows: ProfileRow[] = [], admins = new Set<string>(), roles: RoleRow[] = [], myId = '';

async function load() {
  const got = await adminListProfiles(); rows = got.rows; admins = got.admins; roles = got.roles;
  renderRequests(); renderTable();
}

function renderRequests() {
  const list = document.getElementById('requests-list')!; const n = document.getElementById('requests-n')!;
  const pending = rows.filter((r) => !r.approved && !r.declined_at);
  n.textContent = String(pending.length);
  list.innerHTML = pending.length ? pending.map((r) => `<li data-id="${r.id}"><span><span class="text-ink">${esc(r.full_name || '(no name yet)')}</span> <span class="text-muted">· ${esc(r.usc_email || r.personal_email || '')}${cohortOf(r.join_term, r.join_year) ? ` · says ${cohortOf(r.join_term, r.join_year)}` : ''}${r.request_note ? ` · “${esc(r.request_note)}”` : ''} · asked ${new Date(r.created_at).toLocaleDateString()}</span></span><span class="portal-inline" style="gap:calc(14 * var(--u))"><button type="button" class="t-label portal-linklike" style="color:var(--color-orange)" data-approve="${r.id}">APPROVE</button><button type="button" class="t-label portal-linklike" data-decline="${r.id}">DECLINE</button></span></li>`).join('') : '<li class="text-muted">Nobody waiting.</li>';
}

function renderTable() {
  const tbody = document.querySelector<HTMLElement>('[data-members] tbody')!;
  const members = rows.filter((r) => r.approved);
  tbody.innerHTML = members.map((r) => {
    const status = r.status === 'student' ? 'STUDENT' : 'ALUM'; const division = (r.divisions ?? []).join(', ').replace('PRODUCT MANAGEMENT', 'PRODUCT'); const city = cityLabel(r.city); const email = r.personal_email || r.usc_email || '';
    return `<tr data-id="${r.id}" data-status="${status}" data-cohort="${cohortOf(r.join_term, r.join_year)}" data-division="${esc((r.divisions?.[0] ?? '').replace('PRODUCT MANAGEMENT', 'PRODUCT'))}" data-text="${esc(`${r.full_name} ${r.usc_email ?? ''} ${r.personal_email ?? ''} ${r.current_company ?? ''} ${city} ${division}`.toLowerCase())}">
      <td class="m-name">${esc(r.full_name || '(no name yet)')}${admins.has(r.id) ? ' <span class="t-fine portal-role">ADMIN</span>' : ''}</td><td class="text-muted m-email">${esc(email)}</td><td class="m-status"><span class="t-fine portal-tag">${status}</span></td><td class="text-muted m-col">${cohortOf(r.join_term, r.join_year) || '—'}</td><td class="text-muted m-col">${esc(division) || '—'}</td><td class="text-muted m-col">${esc(city) || '—'}</td><td class="m-col">${completeness(r)}%</td>
      <td class="t-fine text-muted m-meta">${[cohortOf(r.join_term, r.join_year), esc(division), esc(city), `${completeness(r)}% complete`].filter(Boolean).join(' · ')}</td>
      <td class="m-actions" style="text-align:right;white-space:nowrap"><button type="button" class="t-label portal-linklike" data-roles-for="${r.id}" style="margin-right:calc(16 * var(--u))">ROLES</button><button type="button" class="t-label portal-linklike" data-admin-toggle="${r.id}" style="margin-right:calc(16 * var(--u))"${r.id === myId ? ' disabled title="You cannot change your own admin access"' : ''}>${admins.has(r.id) ? 'REMOVE ADMIN' : 'MAKE ADMIN'}</button><button type="button" class="t-label portal-linklike" data-remove="${r.id}">REMOVE ACCESS</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="text-muted">No approved members yet.</td></tr>';
  document.getElementById('members-q')?.dispatchEvent(new Event('input'));   // the shared filter recounts
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
    for (const r of list.querySelectorAll<HTMLElement>('.portal-role-year')) for (const t of r.querySelectorAll<HTMLElement>('.portal-term-pair')) { const y = parseInt(t.querySelector('input')!.value, 10); if (Number.isFinite(y)) out.push({ role: r.dataset.role!, term: t.querySelector('select')!.value === 'Fall' ? 'FA' : 'SP', year: y }); }
    const res = await setRoles(id, out); const f = td.querySelector<HTMLElement>('.portal-feedback')!;
    if (res.error) { f.textContent = res.error.message; f.style.color = 'var(--color-orange)'; } else { f.textContent = out.length ? `Saved: ${out.length} semester${out.length === 1 ? '' : 's'} of e-board history.` : 'Saved: no e-board roles.'; roles = roles.filter((r) => r.profile_id !== id).concat(out.map((o) => ({ ...o, profile_id: id }))); }
  });
}

function exportCsv() {
  const visible = [...document.querySelectorAll<HTMLTableRowElement>('[data-members] tbody tr:not(.portal-row-detail):not([hidden])')].map((tr) => tr.dataset.id).filter(Boolean);
  const pick = rows.filter((r) => visible.includes(r.id));
  const cols = ['full_name', 'status', 'usc_email', 'personal_email', 'phone', 'phone_opt_in', 'join', 'grad_year', 'divisions', 'current_title', 'current_company', 'city', 'industries', 'startups', 'linkedin_url', 'admin', 'last_seen_at'];
  const line = (vals: unknown[]) => vals.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  const csv = [line(cols), ...pick.map((r) => line([r.full_name, r.status, r.usc_email, r.personal_email, r.phone, r.phone_opt_in, cohortOf(r.join_term, r.join_year), r.grad_year, (r.divisions ?? []).join('; '), r.current_title, r.current_company, cityLabel(r.city), (r.industries ?? []).join('; '), (r.startups ?? []).join('; '), r.linkedin_url, admins.has(r.id), r.last_seen_at]))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `troylabs-members-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  fb(`Exported ${pick.length} member${pick.length === 1 ? '' : 's'}.`);
}

async function importCohort(btn: HTMLElement) {
  const panel = document.getElementById('cohort-panel')!; const f = panel.querySelector<HTMLElement>('.portal-feedback')!;
  const year = parseInt((document.getElementById('cohort-year') as HTMLInputElement).value, 10); const term = (document.getElementById('cohort-term') as HTMLSelectElement).value === 'Fall' ? 'FA' : 'SP';
  const lines = (document.getElementById('cohort-csv') as HTMLTextAreaElement).value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map((l) => l.split(/[,\t]/).map((c) => c.trim().replace(/^"|"$/g, ''))).filter((c) => !/^(name|full name)/i.test(c[0] ?? ''));
  const people = parsed.map((c) => { const email = c.find((x) => /@/.test(x)) ?? ''; const name = c.find((x) => x && !/@/.test(x)) ?? ''; const division = c.filter((x) => x && !/@/.test(x) && x !== name)[0] ?? null; return { full_name: name, usc_email: email.toLowerCase(), join_term: Number.isFinite(year) ? term as 'FA' | 'SP' : null, join_year: Number.isFinite(year) ? year : null, division: division ? division.toUpperCase() : null }; }).filter((p) => /@(?:[a-z0-9-]+\.)*usc\.edu$/i.test(p.usc_email));
  if (!people.length) { f.textContent = 'No rows with a usc.edu address found. One person per line: name, email, division.'; f.style.color = 'var(--color-orange)'; return; }
  const res = await importRoster(people);
  if (res.error) { f.textContent = res.error.message; f.style.color = 'var(--color-orange)'; return; }
  flash(btn, 'IMPORTED'); f.style.color = ''; f.textContent = `${people.length} added to the roster${Number.isFinite(year) ? ` as ${term}${String(year).slice(2)}` : ''}. ${parsed.length - people.length ? `${parsed.length - people.length} line${parsed.length - people.length === 1 ? '' : 's'} skipped (no usc.edu address).` : ''}`;
  (document.getElementById('cohort-csv') as HTMLTextAreaElement).value = ''; void rosterSummary();
}
async function rosterSummary() { const r = await listRoster(); const el = document.getElementById('roster-summary'); if (el) el.textContent = r.length ? `Roster: ${r.length} people on file across ${new Set(r.map((x) => cohortOf(x.join_term, x.join_year))).size} semesters.` : 'Roster: empty. Until it has people, everyone who signs in waits in the queue above.'; }

async function init() {
  const table = document.querySelector<HTMLElement>('[data-members]'); if (!table || table.dataset.wired) return; table.dataset.wired = '1';
  document.querySelectorAll<HTMLElement>('[data-action]').forEach((b) => { b.dataset.wired = '1'; });
  const who = await me(); if (!who?.admin) return; myId = who.id;
  await load(); void rosterSummary();
  document.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement; const b = t.closest<HTMLElement>('button'); if (!b) return;
    if (b.dataset.approve) { await setApproved(b.dataset.approve, true); fb('Approved. They are in the network now.'); await load(); }
    else if (b.dataset.decline) { await setDeclined(b.dataset.decline); fb('Declined. They stay outside; you can find them again with a search.'); await load(); }
    else if (b.dataset.adminToggle) { const on = !admins.has(b.dataset.adminToggle); const r = await setAdmin(b.dataset.adminToggle, on); fb(r.error ? r.error.message : on ? 'Made admin. They see the Admin pages next time they load the portal.' : 'Admin access removed.', !r.error); await load(); }
    else if (b.dataset.remove) { const r = rows.find((x) => x.id === b.dataset.remove); if (r && confirm(`Remove ${r.full_name || 'this member'} from the network? They lose access right away and can be approved again later.`)) { await setDeclined(r.id); fb('Access removed.'); await load(); } }
    else if (b.dataset.rolesFor) openRoles(b);
    else if (b.dataset.action === 'export') { e.preventDefault(); exportCsv(); flash(b, 'EXPORTED'); }
    else if (b.dataset.action === 'add-cohort') { e.preventDefault(); const p = document.getElementById('cohort-panel')!; p.hidden = !p.hidden; if (!p.hidden) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (b.dataset.action === 'close-cohort') { e.preventDefault(); document.getElementById('cohort-panel')!.hidden = true; }
    else if (b.dataset.action === 'import-cohort') { e.preventDefault(); await importCohort(b); }
  });
}
init();
document.addEventListener('astro:page-load', init);
