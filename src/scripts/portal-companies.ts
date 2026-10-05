/** Alumni portal › Companies: the list (search by name) and one company's people. See pages/alumni-portal/companies. */
import { companyDirectory, getCompany, setClub, type CompanyPerson, type CompanyRole } from '../lib/portal/companies';
import { me } from '../lib/auth';
import { logoHtml, span } from '../lib/portal/work-render';
import { escapeHtml as esc } from '../lib/portal/safe-html';

const MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = (y: number | null, m: number | null) => (y ? `${m ? `${MON[m]} ` : ''}${y}` : '');
const months = (r: CompanyRole) => { const d = new Date(); const end = r.end_year ? r.end_year * 12 + (r.end_month ?? 12) : d.getFullYear() * 12 + d.getMonth() + 1; return Math.max(1, end - ((r.start_year ?? 0) * 12 + (r.start_month ?? 1)) + 1); };
const roleLine = (r: CompanyRole) => [r.title, r.start_year ? `${when(r.start_year, r.start_month)} – ${r.end_year ? when(r.end_year, r.end_month) : 'Present'} · ${span(months(r))}` : ''].filter(Boolean).join(' · ');
const people = (n: number) => `${n} ${n === 1 ? 'member' : 'members'}`;

function personCard(p: CompanyPerson, co: string): string {
  return `<li><a class="portal-card co-person" href="/alumni-portal/members/?id=${encodeURIComponent(p.id)}&from=company&co=${encodeURIComponent(co)}">
    <span class="portal-avatar t-sub" aria-hidden="true">${p.avatar ? `<img src="${esc(p.avatar)}" alt="" loading="lazy">` : esc(p.initials)}</span>
    <span class="portal-card-body"><span class="t-name portal-card-name">${esc(p.full_name)}</span>
      <span class="portal-card-status"><span class="t-fine portal-role">${p.status === 'student' ? 'STUDENT' : 'ALUM'}</span></span>
      ${p.roles.map((r) => `<span class="t-fine text-muted co-role">${esc(roleLine(r))}</span>`).join('')}
    </span></a></li>`;
}

async function init() {
  const root = document.querySelector<HTMLElement>('[data-co-list]'); if (!root || root.dataset.wired) return; root.dataset.wired = '1';
  const one = document.querySelector<HTMLElement>('[data-co-one]')!, empty = document.querySelector<HTMLElement>('[data-co-empty]')!;
  const id = new URLSearchParams(location.search).get('id');

  if (id) {   // one company
    const [got, who] = await Promise.all([getCompany(id).catch(() => null), me().catch(() => null)]);
    if (!root.isConnected) return;   // left while it loaded
    if (!got || (got.company.is_club && !who?.admin)) { empty.textContent = 'This company isn’t in the network.'; return; }   // a student club has no company page
    const { company: c, people: ps } = got; const now = ps.filter((p) => p.now), before = ps.filter((p) => !p.now);
    document.querySelector<HTMLElement>('[data-co-logo]')!.innerHTML = logoHtml(c.logo_path, c.name, 'is-large');
    document.querySelector<HTMLElement>('[data-co-name]')!.textContent = c.name;
    document.querySelector<HTMLElement>('[data-co-meta]')!.textContent = ps.length ? `${people(ps.length)} of TroyLabs ${ps.length === 1 ? 'has' : 'have'} worked here${now.length ? ` · ${now.length} there now` : ''}` : 'No approved members list this company yet.';
    const li = document.querySelector<HTMLAnchorElement>('[data-co-linkedin]')!; if (c.linkedin_url) { li.href = c.linkedin_url; li.hidden = false; }
    const section = (title: string, list: CompanyPerson[]) => (list.length ? `<h2 class="t-sub portal-section-h">${title}</h2><ul class="m-0 p-0 list-none portal-grid co-people">${list.map((p) => personCard(p, c.linkedin_id)).join('')}</ul>` : '');
    document.querySelector<HTMLElement>('[data-co-people]')!.innerHTML = section('There now', now) + section('Worked here before', before);
    // admins: student clubs (LavaLab, Quant SC…) stay off Companies; mark them here as they show up
    const adminBox = document.querySelector<HTMLElement>('[data-co-admin]')!;
    if (who?.admin) {
      const draw = (club: boolean) => { adminBox.innerHTML = `<p class="m-0 t-fine text-muted">${club ? 'Hidden from Companies: marked as a student club.' : 'A student club, not a company?'} <button type="button" class="t-fine portal-linklike co-club-btn" data-co-club>${club ? 'SHOW IN COMPANIES' : 'THIS IS A STUDENT CLUB'}</button></p><p class="m-0 t-fine portal-feedback" data-co-club-fb></p>`; adminBox.hidden = false;
        adminBox.querySelector<HTMLButtonElement>('[data-co-club]')!.onclick = async (e) => { const b = e.currentTarget as HTMLButtonElement; b.disabled = true; const err = await setClub(c.linkedin_id, !club); if (err) { adminBox.querySelector<HTMLElement>('[data-co-club-fb]')!.textContent = err; b.disabled = false; } else draw(!club); }; };
      draw(c.is_club);
    }
    document.title = `${c.name} — TL Alumni Network Portal`;
    empty.hidden = true; one.hidden = false; return;
  }

  // the list
  const all = await companyDirectory().catch(() => null);
  if (!root.isConnected) return;
  if (!all) { empty.textContent = 'Couldn’t load companies. Check your connection and reload.'; return; }
  empty.hidden = true; root.hidden = false;
  const grid = root.querySelector<HTMLElement>('[data-co-grid]')!, count = root.querySelector<HTMLElement>('[data-co-count]')!, q = root.querySelector<HTMLInputElement>('#co-q')!;
  q.value = new URLSearchParams(location.search).get('q') ?? '';
  const draw = () => {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const shown = all.filter((c) => words.every((w) => c.name.toLowerCase().includes(w)));
    count.textContent = !all.length ? '' : shown.length === all.length ? `${all.length} ${all.length === 1 ? 'company' : 'companies'}` : `${shown.length} of ${all.length}`;
    grid.innerHTML = !all.length
      ? '<li class="t-caption text-muted">No companies yet. They show up here as members import their work history from LinkedIn.</li>'
      : shown.length ? shown.map((c) => `<li><a class="portal-card co-tile" href="/alumni-portal/companies/?id=${encodeURIComponent(c.linkedin_id)}">${logoHtml(c.logo_path, c.name)}<span class="portal-card-body"><span class="t-name portal-card-name">${esc(c.name)}</span><span class="t-fine text-muted">${people(c.people)}${c.current_people ? ` · ${c.current_people} there now` : ''}</span></span></a></li>`).join('')
      : `<li class="t-caption text-muted">No company matches “${esc(q.value.trim())}”.</li>`;
    const u = new URL(location.href); if (q.value.trim()) u.searchParams.set('q', q.value.trim()); else u.searchParams.delete('q'); history.replaceState(history.state, '', u);
  };
  q.addEventListener('input', draw); draw();
}
init();
document.addEventListener('astro:page-load', init);
