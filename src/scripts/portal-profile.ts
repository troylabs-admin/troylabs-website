/**
 * Your profile, for real: fills every field from your row, saves the whole form on SAVE, saves each
 * contact row on its own SAVE, uploads the photo (resized in the browser) on choose, and turns
 * "City, ST" into a pin (a shared cities row with coordinates) on UPDATE.
 */
import { escapeHtml } from '../lib/portal/safe-html';
import { HOME, me, type Me } from '../lib/auth';
import { applicationMissing, listInWords } from '../lib/portal/application';
import { prettyPhone, toE164 } from '../lib/portal/phone';
import { avatarUrl, cityLabel, findOrCreateCity, initialsOf, myProfile, roleLabel, saveMyProfile, submitApplication, uploadAvatar, getProfile, type ClaimedRole, type ProfileRow } from '../lib/portal/data';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const term = (v: string | null) => (v === 'FA' ? 'Fall' : v === 'SP' ? 'Spring' : '');
const termCode = (v: string) => (v === 'Fall' ? 'FA' : 'SP') as 'FA' | 'SP';
const flash = (btn: HTMLElement | null, text: string, feedback = '', ok = true) => {
  if (!btn) return; const orig = btn.textContent;
  // a problem never renames the button ("NOT SENT" in its place read as if the site broke): the message under it says what to do
  if (ok) { btn.classList.add('is-done'); btn.textContent = text; setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = btn.dataset.label ?? orig; }, 1800); }   // data-label: the button's current name (SUBMIT FOR APPROVAL becomes SAVE CHANGES)
  const after = btn.parentElement?.nextElementSibling as HTMLElement | null;   // the line right under the button's row (the location row's; it never showed: audit 2026-10-02)
  const fb = btn.parentElement?.querySelector<HTMLElement>('.portal-feedback') ?? (after?.classList.contains('portal-feedback') ? after : null) ?? btn.closest<HTMLElement>('.portal-field, .portal-contact-row, .portal-save, .portal-panel')?.querySelector<HTMLElement>('.portal-feedback') ?? null;
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
  // a profile nobody has filled in yet shows neither STUDENT nor ALUM: the person has to say which (audit 2026-10-02:
  // a preselected status let alumni save as students without noticing)
  const unanswered = !r.full_name?.trim() && !r.grad_year;
  document.querySelectorAll<HTMLElement>('[data-field="status"] .portal-chip').forEach((c) => c.setAttribute('aria-pressed', String(!unanswered && c.dataset.value === r.status)));
  const student = r.status === 'student';
  ($('#pf-grad') as HTMLElement).hidden = unanswered || !student; ($('#pf-classof') as HTMLElement).hidden = unanswered || student;
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

/** the e-board roles an applicant lists while they wait: every role needs at least one semester with a real year */
function claimsFromForm(): { roles: ClaimedRole[]; problem: string | null } {
  const roles: ClaimedRole[] = []; let problem: string | null = null;
  for (const r of document.querySelectorAll<HTMLElement>('#pf-claim .portal-role-year')) {
    let ok = 0;
    for (const t of r.querySelectorAll<HTMLElement>('.portal-term-pair')) {
      const raw = t.querySelector('input')!.value.trim(); if (!raw) continue; const y = Number(raw);
      if (!/^\d{4}$/.test(raw) || y < 1990 || y > new Date().getFullYear() + 1) { problem = `Check the year for ${r.dataset.role}: "${raw}" isn't a year.`; continue; }
      roles.push({ role: r.dataset.role!, term: t.querySelector('select')!.value === 'Fall' ? 'FA' : 'SP', year: y }); ok++;
    }
    if (!ok && !problem) problem = `Add the semester and year you were ${r.dataset.role}, or untick it.`;
  }
  return { roles, problem };
}
/** put saved claims back into the picker (the shared script builds a role's semester row when its chip is pressed) */
function loadClaims(claims: ClaimedRole[]) {
  const box = $('#pf-claim'); if (!box) return; box.hidden = false; const help = $('#pf-eboard-help'); if (help) help.hidden = true;
  const by = new Map<string, ClaimedRole[]>(); for (const c of claims ?? []) by.set(c.role, [...(by.get(c.role) ?? []), c]);
  for (const chip of box.querySelectorAll<HTMLElement>('[data-field="eboard"] .portal-chip')) {
    const role = chip.textContent!.replace(/^✓\s*/, '').trim(); const mine = by.get(role); if (!mine || chip.getAttribute('aria-pressed') === 'true') continue;
    chip.click(); const row = box.querySelector<HTMLElement>(`.portal-role-year[data-role="${CSS.escape(role)}"]`); if (!row) continue;
    mine.forEach((c, i) => { if (i) row.querySelector<HTMLElement>('[data-more]')!.click(); const pair = row.querySelectorAll<HTMLElement>('.portal-term-pair')[i]; pair.querySelector('select')!.value = c.term === 'FA' ? 'Fall' : 'Spring'; pair.querySelector('input')!.value = String(c.year); });
  }
  (document.activeElement as HTMLElement | null)?.blur();
}
/** where each required answer lives on the page, so a missing one can be shown, not just named */
const FIELD_FOR: Record<string, string> = { 'whether you’re a student or an alum': '[data-field="status"]', 'your name': '#pf-name', 'your graduation year': '#pf-classof-year, #pf-grad-year', 'the semester you joined TroyLabs': '#pf-year', 'your division': '[data-field="divisions"]', 'your city': '#pf-loc' };
/** say what's missing under the button, outline every missing answer, and take them to the first one */
function showMissing(missing: string[], lead: string) {
  const fb = $('.portal-save .portal-feedback'); if (fb) { fb.textContent = `${lead} ${listInWords(missing)}. They're outlined in orange.`; fb.style.color = 'var(--color-orange)'; }
  document.querySelectorAll('.portal-needs').forEach((e) => e.classList.remove('portal-needs'));
  let first: HTMLElement | null = null;
  for (const m of missing) {
    const el = [...document.querySelectorAll<HTMLElement>(FIELD_FOR[m] ?? '')].find((x) => x.offsetParent !== null) ?? null; if (!el) continue;
    (el.matches('input, select') ? el : el).classList.add('portal-needs'); first ??= el;
  }
  if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (first.matches('input')) setTimeout(() => (first as HTMLInputElement).focus({ preventScroll: true }), 350); }
}
const statusPicked = () => Boolean(document.querySelector('[data-field="status"] .portal-chip[aria-pressed="true"]'));
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
    ...(who && !who.approved ? { request_note: ($('#pf-note') as HTMLTextAreaElement).value.trim() || null, claimed_roles: claimsFromForm().roles } : {}),
    industries: [...new Set([...chipsOn('[data-field="industries"]'), ...tags('#pf-industries-extra').map((t) => t.toUpperCase())])].filter((i) => known.includes(i) || true),
  };
}

let who: Me | null = null;
/** the main button says what it does: SUBMIT FOR APPROVAL before someone has applied, SAVE CHANGES while they wait, SAVE once they're in */
function label(btn: HTMLElement) { const t = who?.approved ? 'SAVE' : row?.submitted_at ? 'SAVE CHANGES' : 'SUBMIT FOR APPROVAL'; btn.dataset.label = t; if (!btn.classList.contains('is-done')) btn.textContent = t; }

/** the sign-up panel: what is still missing (live, from the form), or that they are on the list, or declined */
function onboard(justSaved = false) {
  const panel = $('#pf-onboard'); const completion = $('#pf-completion');
  if (!panel || !who || who.approved) { if (panel) panel.hidden = true; if (completion) completion.hidden = false; return; }
  panel.hidden = false; if (completion) completion.hidden = true;   // one list of what's needed while they wait, not two
  const c = collect();
  const typedCity = ($('#pf-loc') as HTMLInputElement | null)?.value.trim();
  const missing = [...(statusPicked() ? [] : ['whether you’re a student or an alum']), ...applicationMissing({ full_name: c.full_name ?? '', grad_year: c.grad_year ?? null, join_year: c.join_year ?? null, divisions: c.divisions ?? [], city_id: row?.city_id ?? (typedCity ? -1 : null) })];
  const submitted = Boolean(row?.submitted_at);
  const title = $('[data-onboard-title]')!, text = $('[data-onboard-text]')!, miss = $('[data-onboard-missing]')!, chip = $('[data-onboard-chip]')!;
  if (who.declined) {
    chip.textContent = 'NOT APPROVED'; title.textContent = 'Your request wasn’t approved';
    text.textContent = 'If you were part of TroyLabs and think this is a mistake, email troylabs@usc.edu and leadership will take another look.';
    miss.textContent = ''; return;
  }
  chip.textContent = 'WAITING FOR APPROVAL';
  if (!submitted) {
    title.textContent = 'Create your profile';
    const bounced = new URLSearchParams(location.search).get('from');
    text.textContent = `${bounced === 'search' ? 'Search opens once your profile is finished and leadership approves you. ' : bounced ? 'The rest of the portal opens once your profile is finished and leadership approves you. ' : ''}TroyLabs leadership approves every member by hand. Fill in everything below so they can recognise you, then press SUBMIT FOR APPROVAL at the bottom. You can edit your profile any time after.`;
    miss.textContent = missing.length ? `Still needed: ${listInWords(missing)}.` : 'That’s everything. Press SUBMIT FOR APPROVAL at the bottom.';
  } else {
    title.textContent = justSaved ? 'Submitted. Waiting for approval.' : 'Waiting for approval';
    text.innerHTML = '';
    text.append('Your profile is with TroyLabs leadership. We’ll email you the moment they approve you. You can keep editing your profile meanwhile. ');
    const a = document.createElement('a'); a.href = HOME; a.className = 'text-ink'; a.textContent = 'See where you stand'; text.append(a, '.');
    miss.textContent = missing.length ? `Your profile needs ${listInWords(missing)} before changes can be saved.` : '';
  }
}

async function init() {
  const form = document.querySelector<HTMLFormElement>('.portal-profile'); if (!form || form.dataset.wired) return; form.dataset.wired = '1';
  document.querySelectorAll<HTMLElement>('.portal-profile [data-action], .portal-profile .portal-save-row').forEach((b) => { b.dataset.wired = '1'; });
  const saveBtn = form.querySelector<HTMLButtonElement>('[data-action="save"]')!;
  saveBtn.disabled = true; form.setAttribute('aria-busy', 'true');
  who = await me(); if (!who || !form.isConnected) return;
  const r = await myProfile();
  if (!form.isConnected) return;   // left the page while it loaded (client-side navigation keeps this script running)
  if (!r) { flash(saveBtn, 'NOT LOADED', 'Could not load your profile. Reload before editing.', false); form.removeAttribute('aria-busy'); return; }
  form.inert = false;   // the data is here: unlock and fill in the same tick, so nothing typed can be overwritten
  if (r) { fill(r, who.admin); if (!who.approved) loadClaims(r.claimed_roles); const full = await getProfile(r.id).catch(() => null); if (full?.roles.length && form.isConnected) { const box = $('#pf-eboard')!; box.innerHTML = roleLabel(full.roles).map((t) => `<span class="t-fine portal-chip" aria-pressed="true">${escapeHtml(t)}</span>`).join(''); } }

  // SAVE: the whole form
  // (the shared script preventDefaults every [data-action] click before it checks `wired`, so the form's
  // submit event never fires — listen on the button itself)
  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault(); const btn = saveBtn;
    const patch = collect(); const applying = !who!.approved; const typedCity = ($('#pf-loc') as HTMLInputElement).value.trim();
    const missing = [...(statusPicked() ? [] : ['whether you’re a student or an alum']), ...(applying
      ? applicationMissing({ full_name: patch.full_name ?? '', grad_year: patch.grad_year ?? null, join_year: patch.join_year ?? null, divisions: patch.divisions ?? [], city_id: row?.city_id ?? (typedCity ? -1 : null) })
      : patch.full_name ? [] : ['your name'])];
    if (missing.length) { showMissing(missing, applying && !row?.submitted_at ? 'Before you can submit, add' : 'Your profile needs'); return; }
    if (applying) { const c = claimsFromForm(); if (c.problem) { flash(btn, 'NOT SAVED', c.problem, false); return; } }
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    const waiting = !who!.approved, wasSubmitted = Boolean(row?.submitted_at);
    try {
      // someone applying: a city typed but not yet placed is placed now, so SUBMIT doesn't say "your city" is missing
      if (waiting) {
        const typed = ($('#pf-loc') as HTMLInputElement).value.trim();
        if (typed && typed !== cityLabel(row?.city ?? null)) { const c = await findOrCreateCity(typed); if (!c.ok) { showMissing(['your city'], 'We couldn’t find that city, so check'); const f = $('.portal-save .portal-feedback'); if (f) f.textContent = `${c.message} It's outlined in orange under LOCATION.`; return; } patch.city_id = c.city.id; }
        const miss = applicationMissing({ full_name: patch.full_name ?? '', grad_year: patch.grad_year ?? null, join_year: patch.join_year ?? null, divisions: patch.divisions ?? [], city_id: patch.city_id ?? row?.city_id ?? null });
        if (miss.length) { showMissing(miss, wasSubmitted ? 'Your profile still needs' : 'Before you can submit, add'); return; }
      }
      const res = await saveMyProfile(patch);
      if (!res.ok) { flash(btn, 'NOT SAVED', res.message, false); return; }
      if (waiting) {
        const sub = await submitApplication();   // marks them submitted (first time) and keeps a backup copy of what they sent
        if (sub.error) { fill(res.row, who!.admin); flash(btn, 'NOT SENT', `Saved, but it couldn't be sent to leadership: ${sub.error.message}`, false); return; }
        res.row.submitted_at = (sub.data as string | null) ?? new Date().toISOString(); who!.submitted = true;
      }
      fill(res.row, who!.admin); label(saveBtn);
      if (waiting) { who!.missing = []; onboard(!wasSubmitted); flash(btn, wasSubmitted ? 'SAVED' : 'SUBMITTED', wasSubmitted ? 'Saved. Leadership sees your latest answers.' : 'Submitted. Your profile is with TroyLabs leadership.'); if (!wasSubmitted) $('#pf-onboard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      else flash(btn, 'SAVED', 'Saved. Your card in search and your pin on the globe are up to date.');
    } catch { flash(btn, 'NOT SAVED', 'Check your connection and try again. Your changes are still in the form.', false); }
    finally { saveBtn.disabled = false; }
  });

  label(saveBtn); saveBtn.disabled = false; form.removeAttribute('aria-busy');
  // an error under the main button goes away as soon as they start fixing things (it read as if the finished profile were still wrong)
  const clearError = (e?: Event) => { const f = form.querySelector<HTMLElement>('.portal-save .portal-feedback'); if (f && f.style.color) { f.textContent = ''; f.style.color = ''; } (e?.target as Element | null)?.closest('.portal-needs, .portal-chips, input')?.classList.remove('portal-needs'); (e?.target as Element | null)?.closest('[data-field]')?.classList.remove('portal-needs'); };
  form.addEventListener('input', clearError); form.addEventListener('click', (e) => { if ((e.target as Element).closest('.portal-chip')) clearError(e); });

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
    if (!text.trim()) { flash(btn, 'NOT UPDATED', 'Type your city first, like "Los Angeles, CA".', false); return; }
    const c = await findOrCreateCity(text); if (!c.ok) { flash(btn, 'NOT FOUND', c.message, false); return; }
    const res = await saveMyProfile({ city_id: c.city.id });
    if (res.ok) { row = res.row; $<HTMLInputElement>('#pf-loc')!.value = cityLabel(res.row.city); $('#pf-loc-note')!.textContent = `${cityLabel(res.row.city)} · pin on the globe`; recount(); onboard(); flash(btn, 'UPDATED', `Pin placed: ${cityLabel(c.city)}.`); } else flash(btn, 'NOT SAVED', res.message, false);
  });
}
init();
document.addEventListener('astro:page-load', init);
