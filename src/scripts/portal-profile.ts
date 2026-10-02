/**
 * Your profile, for real: fills every field from your row, saves the whole form on SAVE, saves each
 * contact row on its own SAVE, uploads the photo (resized in the browser) on choose, and turns
 * "City, ST" into a pin (a shared cities row with coordinates) on UPDATE.
 */
import { escapeHtml } from '../lib/portal/safe-html';
import { HOME, me, type Me } from '../lib/auth';
import { applicationMissing, listInWords } from '../lib/portal/application';
import { prettyPhone, toE164 } from '../lib/portal/phone';
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
const setTags = (sel: string, items: string[]) => { const box = $(sel); if (!box) return; box.innerHTML = items.map((t) => `<span class="t-fine portal-tagx">${escapeHtml(t)} <button type="button" aria-label="Remove ${escapeHtml(t)}">×</button></span>`).join(''); };
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
  ($('#pf-phone') as HTMLInputElement).value = prettyPhone(r.phone); ($('#pf-phone-opt') as HTMLInputElement).checked = r.phone_opt_in;
  const eo = $<HTMLInputElement>('#pf-email-opt'); if (eo) eo.checked = r.email_opt_in !== false;
  document.querySelectorAll<HTMLElement>('[data-field="status"] .portal-chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.value === r.status)));
  const student = r.status === 'student';
  ($('#pf-grad') as HTMLElement).hidden = !student; ($('#pf-classof') as HTMLElement).hidden = student;
  ($('#pf-grad-term') as HTMLSelectElement).value = term(r.grad_term) || 'Spring'; ($('#pf-grad-year') as HTMLInputElement).value = student && r.grad_year ? String(r.grad_year) : '';
  ($('#pf-classof-year') as HTMLInputElement).value = !student && r.grad_year ? String(r.grad_year) : '';
  ($('#pf-name') as HTMLInputElement).value = r.full_name ?? '';
  ($('#pf-term') as HTMLSelectElement).value = term(r.join_term) || 'Fall'; ($('#pf-year') as HTMLInputElement).value = r.join_year ? String(r.join_year) : '';
  ($('#pf-title') as HTMLInputElement).value = r.current_title ?? ''; ($('#pf-co') as HTMLInputElement).value = r.current_company ?? '';
  ($('#pf-li') as HTMLInputElement).value = r.linkedin_url ?? ''; ($('#pf-bio') as HTMLTextAreaElement).value = r.bio ?? '';
  const note = $<HTMLTextAreaElement>('#pf-note'); if (note) note.value = r.request_note ?? '';
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
    ...(who && !who.approved ? { request_note: ($('#pf-note') as HTMLTextAreaElement).value.trim() || null } : {}),
    industries: [...new Set([...chipsOn('[data-field="industries"]'), ...tags('#pf-industries-extra').map((t) => t.toUpperCase())])].filter((i) => known.includes(i) || true),
  };
}

let who: Me | null = null;

/** the sign-up panel: what is still missing (live, from the form), or that they are on the list, or declined */
function onboard(justSaved = false) {
  const panel = $('#pf-onboard'); const completion = $('#pf-completion');
  if (!panel || !who || who.approved) { if (panel) panel.hidden = true; if (completion) completion.hidden = false; return; }
  panel.hidden = false; if (completion) completion.hidden = true;   // one list of what's needed while they wait, not two
  const c = collect();
  const missing = applicationMissing({ full_name: c.full_name ?? '', grad_year: c.grad_year ?? null, join_year: c.join_year ?? null, divisions: c.divisions ?? [] });
  const savedMissing = row ? applicationMissing(row) : missing;
  const title = $('[data-onboard-title]')!, text = $('[data-onboard-text]')!, miss = $('[data-onboard-missing]')!, chip = $('[data-onboard-chip]')!;
  if (who.declined) {
    chip.textContent = 'NOT APPROVED'; title.textContent = 'Your request wasn’t approved';
    text.textContent = 'If you were part of TroyLabs and think this is a mistake, email troylabs@usc.edu and leadership will take another look.';
    miss.textContent = ''; return;
  }
  chip.textContent = 'WAITING FOR APPROVAL';
  if (savedMissing.length) {
    title.textContent = 'Create your profile';
    text.textContent = 'TroyLabs leadership approves every member by hand. Fill in the basics so they can recognise you, then press SAVE at the bottom of the page.';
    miss.textContent = missing.length ? `Still needed: ${listInWords(missing)}.` : 'That’s everything needed. Press SAVE at the bottom to send it.';
  } else {
    title.textContent = justSaved ? 'Sent. You’re on the list.' : 'You’re on the list';
    text.innerHTML = '';
    text.append('Your profile is with TroyLabs leadership. You’ll get into the network as soon as an admin approves you, so check back on this site. You can keep editing your profile meanwhile. ');
    const a = document.createElement('a'); a.href = HOME; a.className = 'text-ink'; a.textContent = 'See where you stand'; text.append(a, '.');
    miss.textContent = missing.length ? `If you save now, your profile would be missing ${listInWords(missing)}.` : '';
  }
}

async function init() {
  const form = document.querySelector<HTMLFormElement>('.portal-profile'); if (!form || form.dataset.wired) return; form.dataset.wired = '1';
  document.querySelectorAll<HTMLElement>('.portal-profile [data-action], .portal-profile .portal-save-row').forEach((b) => { b.dataset.wired = '1'; });
  const saveBtn = form.querySelector<HTMLButtonElement>('[data-action="save"]')!;
  saveBtn.disabled = true; form.setAttribute('aria-busy', 'true');
  who = await me(); if (!who) return;
  const r = await myProfile();
  if (!r) { flash(saveBtn, 'NOT LOADED', 'Could not load your profile. Reload before editing.', false); form.removeAttribute('aria-busy'); return; }
  if (r) { fill(r, who.admin); const full = await getProfile(r.id).catch(() => null); if (full?.roles.length) { const box = $('#pf-eboard')!; box.innerHTML = roleLabel(full.roles).map((t) => `<span class="t-fine portal-tagx">${escapeHtml(t)}</span>`).join(''); } }

  // SAVE: the whole form
  // (the shared script preventDefaults every [data-action] click before it checks `wired`, so the form's
  // submit event never fires — listen on the button itself)
  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault(); const btn = saveBtn;
    const patch = collect(); if (!patch.full_name) { flash(btn, 'NOT SAVED', 'Your name is the one thing we need.', false); return; }
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    try {
      const res = await saveMyProfile(patch);
      if (res.ok) {
        const wasMissing = applicationMissing(row ?? res.row).length > 0; fill(res.row, who!.admin);
        if (!who!.approved) { who!.missing = applicationMissing(res.row); onboard(wasMissing && !who!.missing.length); flash(btn, 'SAVED', who!.missing.length ? `Saved. Still needed before leadership can approve you: ${listInWords(who!.missing)}.` : 'Saved. Your profile is with TroyLabs leadership.'); if (!who!.missing.length) $('#pf-onboard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        else flash(btn, 'SAVED', 'Saved. Your card in search and your pin on the globe are up to date.');
      } else flash(btn, 'NOT SAVED', res.message, false);
    } catch { flash(btn, 'NOT SAVED', 'Check your connection and try again. Your changes are still in the form.', false); }
    finally { saveBtn.disabled = false; }
  });

  saveBtn.disabled = false; form.removeAttribute('aria-busy');

  // the sign-up panel follows the form as they fill it (chips are toggled by the shared script, hence the tick)
  onboard();
  if (!who.approved) {
    form.addEventListener('input', () => onboard());
    form.addEventListener('click', (e) => { if ((e.target as Element).closest('.portal-chip')) setTimeout(() => onboard(), 0); });
    $('#pf-onboard')?.addEventListener('input', () => onboard());
  }

  // each contact row saves on its own
  for (const rowEl of form.querySelectorAll<HTMLElement>('.portal-contact-row')) {
    const btn = rowEl.querySelector<HTMLButtonElement>('.portal-save-row'); const input = rowEl.querySelector<HTMLInputElement>('input:not([type="checkbox"])'); if (!btn || !input) continue;
    btn.addEventListener('click', async (e) => {
      e.preventDefault(); const kind = rowEl.dataset.contact; const v = input.value.trim() || null;
      const phone = kind === 'phone' && v ? toE164(v) : null;
      if (kind === 'phone' && v && !phone) { flash(btn, 'NOT SAVED', 'Enter a number that can get texts, like (310) 555-0101, or +44 20 7946 0958 outside the US.', false); return; }
      const textsOn = ($('#pf-phone-opt') as HTMLInputElement).checked;
      if (kind === 'phone' && textsOn && !phone) { flash(btn, 'NOT SAVED', 'Add your number to get texts.', false); return; }
      const patch: Partial<ProfileRow> = kind === 'usc' ? { usc_email: v } : kind === 'personal' ? { personal_email: v } : { phone, phone_opt_in: textsOn };
      if (kind === 'usc' && v && !/@(?:[a-z0-9-]+\.)*usc\.edu$/i.test(v)) { flash(btn, 'NOT SAVED', 'That is not a usc.edu address.', false); return; }
      if (kind === 'personal' && !v) { flash(btn, 'NOT SAVED', 'Keep a personal email on file so members can reach you.', false); return; }
      if (kind === 'personal' && v && !input.checkValidity()) { flash(btn, 'NOT SAVED', 'Enter a valid email address.', false); return; }
      const res = await saveMyProfile(patch);
      if (res.ok) { row = res.row; if (kind === 'phone') input.value = prettyPhone(res.row.phone); rowEl.dispatchEvent(new Event('tl:saved')); flash(btn, 'SAVED', kind === 'personal' ? 'Saved as your contact email. Your sign-in address has not changed.' : kind === 'phone' ? (textsOn ? 'Saved. You’ll get TroyLabs event texts; reply STOP to any of them to stop.' : 'Saved. You won’t get texts.') : 'Saved.'); } else flash(btn, 'NOT SAVED', res.message, false);
    });
  }
  // announcements on/off saves the moment it's ticked
  $<HTMLInputElement>('#pf-email-opt')?.addEventListener('change', async (e) => {
    const box = e.currentTarget as HTMLInputElement; const out = $('#pf-email-opt-fb')!; const res = await saveMyProfile({ email_opt_in: box.checked });
    if (res.ok) { row = res.row; out.style.color = ''; out.textContent = box.checked ? 'Saved. You’ll get TroyLabs announcements by email.' : 'Saved. You won’t get announcement emails.'; } else { box.checked = !box.checked; out.style.color = 'var(--color-orange)'; out.textContent = res.message; }
  });
  $('#pf-phone-opt')?.addEventListener('change', () => { const b = document.querySelector<HTMLButtonElement>('[data-contact="phone"] .portal-save-row'); if (b) b.disabled = false; });

  // photo: resize, upload, show
  const photo = $<HTMLInputElement>('#pf-photo');
  photo?.addEventListener('change', async () => {
    const f = photo.files?.[0]; if (!f) return; const note = $('#pf-head-name')!; const was = note.textContent; note.textContent = 'Uploading photo…';
    const res = await uploadAvatar(f); note.textContent = was;
    if (res.ok) { const fresh = await myProfile(); if (fresh) { row = fresh; const img = $<HTMLImageElement>('#pf-photo-preview')!; img.src = avatarUrl(fresh)!; img.hidden = false; $('#pf-initials')!.dataset.hasPhoto = '1'; recount(); } } else alert(res.message);
  }, { capture: true });

  // location → pin
  $('[data-action="update"]')?.addEventListener('click', async (e) => {
    e.preventDefault(); const btn = e.currentTarget as HTMLElement; const text = ($('#pf-loc') as HTMLInputElement).value;
    const c = await findOrCreateCity(text); if (!c.ok) { flash(btn, 'NOT FOUND', c.message, false); return; }
    const res = await saveMyProfile({ city_id: c.city.id });
    if (res.ok) { row = res.row; $<HTMLInputElement>('#pf-loc')!.value = cityLabel(res.row.city); $('#pf-loc-note')!.textContent = `${cityLabel(res.row.city)} · pin on the globe`; recount(); flash(btn, 'UPDATED', `Pin placed: ${cityLabel(c.city)}.`); } else flash(btn, 'NOT SAVED', res.message, false);
  });
}
init();
document.addEventListener('astro:page-load', init);
