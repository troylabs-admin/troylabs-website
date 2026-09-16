/**
 * Your profile, for real: fills every field from your row, saves the whole form on SAVE, saves each
 * contact row on its own SAVE, uploads the photo (resized in the browser) on choose, and turns
 * "City, ST" into a pin (a shared cities row with coordinates) on UPDATE.
 */
import { me } from '../lib/auth';
import { avatarUrl, cityLabel, findOrCreateCity, initialsOf, myProfile, roleLabel, saveMyProfile, uploadAvatar, getProfile, type ProfileRow } from '../lib/portal/data';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const term = (v: string | null) => (v === 'FA' ? 'Fall' : v === 'SP' ? 'Spring' : '');
const termCode = (v: string) => (v === 'Fall' ? 'FA' : 'SP') as 'FA' | 'SP';
const flash = (btn: HTMLElement | null, text: string, feedback = '', ok = true) => {
  if (!btn) return; const orig = btn.textContent; btn.classList.add('is-done'); btn.textContent = text;
  setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = orig; }, 1800);
  const fb = btn.parentElement?.querySelector<HTMLElement>('.portal-feedback') ?? btn.closest<HTMLElement>('.portal-field, .portal-contact-row, .portal-save, .portal-panel')?.querySelector<HTMLElement>('.portal-feedback') ?? null;
  if (fb) { fb.textContent = feedback; fb.style.color = ok ? '' : 'var(--color-orange)'; }
};
const chipsOn = (sel: string) => [...document.querySelectorAll<HTMLElement>(`${sel} .portal-chip[aria-pressed="true"]`)].map((c) => c.textContent!.replace(/^✓\s*/, '').trim());
const setChips = (sel: string, on: string[]) => document.querySelectorAll<HTMLElement>(`${sel} .portal-chip`).forEach((c) => c.setAttribute('aria-pressed', String(on.includes(c.textContent!.replace(/^✓\s*/, '').trim()))));
const tags = (sel: string) => [...document.querySelectorAll<HTMLElement>(`${sel} .portal-tagx`)].map((t) => t.firstChild?.textContent?.trim() ?? '').filter(Boolean);
const setTags = (sel: string, items: string[]) => { const box = $(sel); if (!box) return; box.innerHTML = items.map((t) => `<span class="t-fine portal-tagx">${t} <button type="button" aria-label="Remove ${t}">×</button></span>`).join(''); };
const num = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const recount = () => document.querySelector('.portal-profile input')?.dispatchEvent(new Event('input', { bubbles: true }));

let row: ProfileRow | null = null;

function fill(r: ProfileRow, admin: boolean) {
  row = r;
  ($('#pf-head-name') as HTMLElement).textContent = r.full_name || r.personal_email || r.usc_email || '';
  ($('#pf-head-role') as HTMLElement).hidden = !admin;
  const initials = $('#pf-initials')!; initials.textContent = initialsOf(r.full_name || '?');
  const img = $<HTMLImageElement>('#pf-photo-preview')!; const url = avatarUrl(r);
  if (url) { img.src = url; img.hidden = false; initials.dataset.hasPhoto = '1'; } else { img.hidden = true; delete initials.dataset.hasPhoto; }
  ($('#pf-usc') as HTMLInputElement).value = r.usc_email ?? ''; ($('#pf-personal') as HTMLInputElement).value = r.personal_email ?? '';
  ($('#pf-phone') as HTMLInputElement).value = r.phone ?? ''; ($('#pf-phone-opt') as HTMLInputElement).checked = r.phone_opt_in;
  document.querySelectorAll<HTMLElement>('[data-field="status"] .portal-chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.value === r.status)));
  const student = r.status === 'student';
  ($('#pf-grad') as HTMLElement).hidden = !student; ($('#pf-classof') as HTMLElement).hidden = student;
  ($('#pf-grad-term') as HTMLSelectElement).value = term(r.grad_term) || 'Spring'; ($('#pf-grad-year') as HTMLInputElement).value = student && r.grad_year ? String(r.grad_year) : '';
  ($('#pf-classof-year') as HTMLInputElement).value = !student && r.grad_year ? String(r.grad_year) : '';
  ($('#pf-name') as HTMLInputElement).value = r.full_name ?? '';
  ($('#pf-term') as HTMLSelectElement).value = term(r.join_term) || 'Fall'; ($('#pf-year') as HTMLInputElement).value = r.join_year ? String(r.join_year) : '';
  ($('#pf-title') as HTMLInputElement).value = r.current_title ?? ''; ($('#pf-co') as HTMLInputElement).value = r.current_company ?? '';
  ($('#pf-li') as HTMLInputElement).value = r.linkedin_url ?? ''; ($('#pf-bio') as HTMLTextAreaElement).value = r.bio ?? '';
  setChips('[data-field="divisions"]', r.divisions ?? []);
  setTags('#pf-startups', r.startups ?? []);
  const known = [...document.querySelectorAll<HTMLElement>('[data-field="industries"] .portal-chip')].map((c) => c.textContent!.replace(/^✓\s*/, '').trim());
  setChips('[data-field="industries"]', r.industries ?? []); setTags('#pf-industries-extra', (r.industries ?? []).filter((i) => !known.includes(i)));
  ($('#pf-loc') as HTMLInputElement).value = cityLabel(r.city); ($('#pf-loc-note') as HTMLElement).textContent = r.city ? `${cityLabel(r.city)} · pin on the globe` : 'No pin on the globe yet. Add your city so alumni can find you on the map.';
  document.querySelectorAll('.portal-contact-row').forEach((el) => el.dispatchEvent(new Event('tl:loaded')));
  recount();
}

function collect(): Partial<ProfileRow> {
  const status = (document.querySelector<HTMLElement>('[data-field="status"] .portal-chip[aria-pressed="true"]')?.dataset.value ?? 'alum') as 'student' | 'alum';
  const student = status === 'student';
  const known = [...document.querySelectorAll<HTMLElement>('[data-field="industries"] .portal-chip')].map((c) => c.textContent!.replace(/^✓\s*/, '').trim());
  return {
    full_name: ($('#pf-name') as HTMLInputElement).value.trim(), status,
    grad_term: student ? termCode(($('#pf-grad-term') as HTMLSelectElement).value) : row?.grad_term ?? null,
    grad_year: student ? num(($('#pf-grad-year') as HTMLInputElement).value) : num(($('#pf-classof-year') as HTMLInputElement).value),
    join_term: ($('#pf-year') as HTMLInputElement).value.trim() ? termCode(($('#pf-term') as HTMLSelectElement).value) : null, join_year: num(($('#pf-year') as HTMLInputElement).value),
    current_title: ($('#pf-title') as HTMLInputElement).value.trim() || null, current_company: ($('#pf-co') as HTMLInputElement).value.trim() || null,
    linkedin_url: ($('#pf-li') as HTMLInputElement).value.trim() || null, bio: ($('#pf-bio') as HTMLTextAreaElement).value.trim() || null,
    divisions: chipsOn('[data-field="divisions"]'), startups: tags('#pf-startups'),
    industries: [...new Set([...chipsOn('[data-field="industries"]'), ...tags('#pf-industries-extra').map((t) => t.toUpperCase())])].filter((i) => known.includes(i) || true),
  };
}

async function init() {
  const form = document.querySelector<HTMLFormElement>('.portal-profile'); if (!form || form.dataset.wired) return; form.dataset.wired = '1';
  document.querySelectorAll<HTMLElement>('.portal-profile [data-action], .portal-profile .portal-save-row').forEach((b) => { b.dataset.wired = '1'; });
  const who = await me(); if (!who) return;
  const r = await myProfile(); if (r) { fill(r, who.admin); const full = await getProfile(r.id); if (full?.roles.length) { const box = $('#pf-eboard')!; box.innerHTML = roleLabel(full.roles).map((t) => `<span class="t-fine portal-tagx">${t}</span>`).join(''); } }

  // SAVE: the whole form
  // (the shared script preventDefaults every [data-action] click before it checks `wired`, so the form's
  // submit event never fires — listen on the button itself)
  const saveBtn = form.querySelector<HTMLElement>('[data-action="save"]')!;
  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault(); const btn = saveBtn;
    const patch = collect(); if (!patch.full_name) { flash(btn, 'NOT SAVED', 'Your name is the one thing we need.', false); return; }
    const res = await saveMyProfile(patch);
    if (res.ok) { fill(res.row, who.admin); flash(btn, 'SAVED', 'Saved. Your card in search and your pin on the globe are up to date.'); } else flash(btn, 'NOT SAVED', res.message, false);
  });

  // each contact row saves on its own
  for (const rowEl of form.querySelectorAll<HTMLElement>('.portal-contact-row')) {
    const btn = rowEl.querySelector<HTMLButtonElement>('.portal-save-row'); const input = rowEl.querySelector<HTMLInputElement>('input:not([type="checkbox"])'); if (!btn || !input) continue;
    btn.addEventListener('click', async (e) => {
      e.preventDefault(); const kind = rowEl.dataset.contact; const v = input.value.trim() || null;
      const patch: Partial<ProfileRow> = kind === 'usc' ? { usc_email: v } : kind === 'personal' ? { personal_email: v } : { phone: v, phone_opt_in: ($('#pf-phone-opt') as HTMLInputElement).checked };
      if (kind === 'usc' && v && !/@(?:[a-z0-9-]+\.)*usc\.edu$/i.test(v)) { flash(btn, 'NOT SAVED', 'That is not a usc.edu address.', false); return; }
      if (kind === 'personal' && !v) { flash(btn, 'NOT SAVED', 'Your personal email is how you sign in for good — keep one on file.', false); return; }
      const res = await saveMyProfile(patch);
      if (res.ok) { row = res.row; rowEl.dispatchEvent(new Event('tl:saved')); flash(btn, 'SAVED', kind === 'personal' ? 'Saved. Sign-in links go to this address from now on.' : 'Saved.'); } else flash(btn, 'NOT SAVED', res.message, false);
    });
  }
  $('#pf-phone-opt')?.addEventListener('change', () => { const b = document.querySelector<HTMLButtonElement>('[data-contact="phone"] .portal-save-row'); if (b) b.disabled = false; });

  // photo: resize, upload, show
  const photo = $<HTMLInputElement>('#pf-photo');
  photo?.addEventListener('change', async () => {
    const f = photo.files?.[0]; if (!f) return; const note = $('#pf-head-name')!; const was = note.textContent; note.textContent = 'Uploading photo…';
    const res = await uploadAvatar(f); note.textContent = was;
    if (res.ok) { const fresh = await myProfile(); if (fresh) fill(fresh, who.admin); } else alert(res.message);
  }, { capture: true });

  // location → pin
  $('[data-action="update"]')?.addEventListener('click', async (e) => {
    e.preventDefault(); const btn = e.currentTarget as HTMLElement; const text = ($('#pf-loc') as HTMLInputElement).value;
    const c = await findOrCreateCity(text); if (!c.ok) { flash(btn, 'NOT FOUND', c.message, false); return; }
    const res = await saveMyProfile({ city_id: c.city.id });
    if (res.ok) { fill(res.row, who.admin); flash(btn, 'UPDATED', `Pin placed: ${cityLabel(c.city)}.`); } else flash(btn, 'NOT SAVED', res.message, false);
  });
}
init();
document.addEventListener('astro:page-load', init);
