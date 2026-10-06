/**
 * Your profile, for real: fills every field from your row, saves the whole form on SAVE, saves each
 * contact row on its own SAVE, uploads the photo (resized in the browser) on choose, and turns
 * "City, ST" into a pin (a shared cities row with coordinates) on UPDATE.
 */
import { escapeHtml } from '../lib/portal/safe-html';
import { HOME, accountEmail, me, type Me } from '../lib/auth';
import { applicationMissing, listInWords } from '../lib/portal/application';
import { prettyPhone, toE164 } from '../lib/portal/phone';
import { getHistory, historyHtml, myLinkedInStatus, requestSync } from '../lib/portal/work-render';
import { canonicalLinkedIn } from '../../supabase/functions/_shared/work-history';
import { avatarUrl, cityLabel, findOrCreateCity, initialsOf, myProfile, roleLabel, saveMyProfile, submitApplication, uploadAvatar, getProfile, type ClaimedRole, type ProfileRow } from '../lib/portal/data';
import { parseYear, yearProblems } from '../lib/portal/years';

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
const yr = (sel: string) => parseYear(($(sel) as HTMLInputElement).value) ?? null;   // "26" is 2026; a non-year is caught before saving (badYears)
const recount = () => document.querySelector('.portal-profile input')?.dispatchEvent(new Event('input', { bubbles: true }));

let row: ProfileRow | null = null;
/** an admin editing someone else's profile (?id=, 2026-10-06): whose row this page loads and saves; null = your own */
let other: string | null = null;
const save = (patch: Partial<ProfileRow>) => saveMyProfile(patch, other ?? undefined);
const reload = () => (other ? getProfile(other).then((g) => g?.row ?? null) : myProfile());
/** year boxes holding something that isn't a year ("6", "20266", "Spring"): outlined, and the save stops */
function badYears(): boolean {
  const boxes = ['#pf-year', '#pf-grad-year', '#pf-classof-year'].map((s) => $<HTMLInputElement>(s)!).filter((i) => i && i.offsetParent !== null && parseYear(i.value) === undefined);
  boxes.forEach((i) => { i.classList.add('portal-needs'); i.setAttribute('aria-invalid', 'true'); });
  if (boxes[0]) { boxes[0].focus(); flash($('[data-action="save"]'), 'NOT SAVED', 'Enter years as four digits, like 2026. They’re outlined in orange.', false); }
  return boxes.length > 0;
}

function fill(r: ProfileRow, admin: boolean) {
  row = r;
  ($('#pf-head-name') as HTMLElement).textContent = r.full_name || r.personal_email || r.usc_email || '';
  ($('#pf-head-role') as HTMLElement).hidden = !admin || Boolean(other);
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
  // current job title and company aren't on the form: LinkedIn's work history sets them (2026-10-05)
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
const FIELD_FOR: Record<string, string> = { 'whether you’re a student or an alum': '[data-field="status"]', 'your name': '#pf-name', 'your LinkedIn profile link': '#pf-li', 'your phone number': '#pf-phone', 'a personal email (not your USC one)': '#pf-personal', 'your graduation year': '#pf-classof-year, #pf-grad-year', 'the semester you joined TroyLabs': '#pf-year', 'your division': '[data-field="divisions"]', 'your city': '#pf-loc' };
/** say what's missing under the button, outline every missing answer, and take them to the first one */
function showMissing(missing: string[], lead: string) {
  const fb = $('.portal-save .portal-feedback'); if (fb) { fb.textContent = `${lead} ${listInWords(missing)}. They're outlined in orange.`; fb.style.color = 'var(--color-orange)'; }
  document.querySelectorAll('.portal-needs').forEach((e) => { e.classList.remove('portal-needs'); e.removeAttribute('aria-invalid'); });
  let first: HTMLElement | null = null;
  for (const m of missing) {
    const el = [...document.querySelectorAll<HTMLElement>(FIELD_FOR[m] ?? '')].find((x) => x.offsetParent !== null) ?? null; if (!el) continue;
    el.classList.add('portal-needs'); el.setAttribute('aria-invalid', 'true'); first ??= el;
  }
  if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (first.matches('input')) setTimeout(() => (first as HTMLInputElement).focus({ preventScroll: true }), 350); }
}
/** the phone typed in its box, if it's a real number (E.164), whether or not its row was saved */
const typedPhone = () => { const v = ($('#pf-phone') as HTMLInputElement | null)?.value.trim(); return v ? toE164(v) : null; };
const statusPicked = () => Boolean(document.querySelector('[data-field="status"] .portal-chip[aria-pressed="true"]'));
function collect(): Partial<ProfileRow> {
  const status = (document.querySelector<HTMLElement>('[data-field="status"] .portal-chip[aria-pressed="true"]')?.dataset.value ?? 'alum') as 'student' | 'alum';
  const student = status === 'student';
  const known = [...document.querySelectorAll<HTMLElement>('[data-field="industries"] .portal-chip')].map((c) => c.textContent!.replace(/^✓\s*/, '').trim());
  return {
    full_name: ($('#pf-name') as HTMLInputElement).value.trim(), status,
    grad_term: student ? termCode(($('#pf-grad-term') as HTMLSelectElement).value) : row?.grad_term ?? null,
    grad_year: student ? yr('#pf-grad-year') : yr('#pf-classof-year'),
    join_term: ($('#pf-year') as HTMLInputElement).value.trim() ? termCode(($('#pf-term') as HTMLSelectElement).value) : null, join_year: yr('#pf-year'),
    linkedin_url: ($('#pf-li') as HTMLInputElement).value.trim() || null, bio: ($('#pf-bio') as HTMLTextAreaElement).value.trim() || null,
    divisions: chipsOn('[data-field="divisions"]'), startups: tags('#pf-startups'),
    ...(who && !who.approved ? { request_note: ($('#pf-note') as HTMLTextAreaElement).value.trim() || null, claimed_roles: claimsFromForm().roles } : {}),
    industries: [...new Set([...chipsOn('[data-field="industries"]'), ...tags('#pf-industries-extra').map((t) => t.toUpperCase())])].filter((i) => known.includes(i) || true),
  };
}

let who: Me | null = null;
/** the main button says what it does: SUBMIT FOR APPROVAL before someone has applied, SAVE CHANGES while they wait, SAVE once they're in */
function label(btn: HTMLElement) { const t = who?.approved || other ? 'SAVE' : row?.submitted_at ? 'SAVE CHANGES' : 'SUBMIT FOR APPROVAL'; btn.dataset.label = t; if (!btn.classList.contains('is-done')) btn.textContent = t; }

/** the sign-up panel: what is still missing (live, from the form), or that they are on the list, or declined */
function onboard(justSaved = false) {
  const panel = $('#pf-onboard'); const completion = $('#pf-completion');
  if (!panel || !who || who.approved) { if (panel) panel.hidden = true; if (completion) completion.hidden = false; return; }
  panel.hidden = false; if (completion) completion.hidden = true;   // one list of what's needed while they wait, not two
  const c = collect();
  const typedCity = ($('#pf-loc') as HTMLInputElement | null)?.value.trim();
  const missing = [...(statusPicked() ? [] : ['whether you’re a student or an alum']), ...applicationMissing({ full_name: c.full_name ?? '', grad_year: c.grad_year ?? null, join_year: c.join_year ?? null, divisions: c.divisions ?? [], city_id: row?.city_id ?? (typedCity ? -1 : null), linkedin_url: c.linkedin_url ?? null, phone: typedPhone() ?? row?.phone ?? null, personal_email: row?.personal_email ?? null })];
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

/** the LinkedIn panel: where their import stands, SYNC NOW, and their history as members see it */
let liPoll = 0;
async function linkedInPanel() {
  const box = $('#pf-linkedin'); if (!box || !who || !row) return;
  const status = box.querySelector<HTMLElement>('[data-li-status]')!, btn = box.querySelector<HTMLButtonElement>('[data-li-sync]')!, fb = box.querySelector<HTMLElement>('[data-li-fb]')!;
  const say = (text: string, error = false) => { status.textContent = text; status.classList.toggle('is-error', error); };
  const [st, history] = await Promise.all([other ? Promise.resolve({ queued: false, synced_at: row.linkedin_synced_at ?? null, error: row.linkedin_sync_error ?? null }) : myLinkedInStatus().catch(() => null), getHistory(other ?? who.id).catch(() => null)]);
  if (!box.isConnected) return;
  const preview = $('[data-li-preview]'); if (preview) preview.innerHTML = history ? historyHtml(history) : '';

  btn.hidden = true; btn.textContent = 'SYNC NOW'; delete btn.dataset.checkStatus; fb.textContent = ''; window.clearTimeout(liPoll);
  const link = canonicalLinkedIn(row.linkedin_url ?? '');
  if (other && !row.approved) return say(link ? 'Their LinkedIn imports when they’re approved.' : 'No LinkedIn link yet. It imports when they’re approved.');
  if (!who.approved) return say(link ? 'Your LinkedIn imports when leadership approves you.' : 'Add your LinkedIn link above. It imports when leadership approves you.');
  if (!link) return say('Add your LinkedIn link above and press SAVE, then sync.');
  if (!st) { say('We couldn’t check your LinkedIn import. Check your connection and try again.', true); btn.hidden = false; btn.disabled = false; btn.textContent = 'CHECK AGAIN'; btn.dataset.checkStatus = '1'; return; }
  if (st.queued) { say(st.error ? 'The LinkedIn import is delayed. We’ll retry automatically; any saved history is kept.' : 'Importing from LinkedIn… this takes a minute or two.'); const was = st.synced_at; liPoll = window.setTimeout(async function check() { const s2 = await myLinkedInStatus().catch(() => null); if (!box.isConnected) return; if (!s2 || !s2.queued || s2.synced_at !== was || s2.error !== st.error) void linkedInPanel(); else liPoll = window.setTimeout(check, 10000); }, 10000); return; }
  btn.hidden = false; btn.disabled = false; fb.textContent = '';
  const day = st?.synced_at && Date.now() - Date.parse(st.synced_at) < 24 * 3600_000 && !who.admin;
  if (st?.error) say(`The last import didn’t work: ${st.error}`, true);
  else if (st?.synced_at) say(`Imported from LinkedIn on ${new Date(st.synced_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.`);
  else say('Not imported yet.');
  if (day) { btn.disabled = true; fb.textContent = 'You can sync again tomorrow.'; fb.style.color = 'var(--color-muted)'; }   // matches the server's daily limit, even after a failed attempt
}
document.addEventListener('click', async (e) => {
  const btn = (e.target as Element).closest<HTMLButtonElement>('#pf-linkedin [data-li-sync]'); if (!btn || btn.disabled) return;
  if (btn.dataset.checkStatus) { btn.disabled = true; void linkedInPanel(); return; }
  const fb = document.querySelector<HTMLElement>('#pf-linkedin [data-li-fb]')!; btn.disabled = true; fb.style.color = ''; fb.textContent = '';
  const r: Awaited<ReturnType<typeof requestSync>> = await requestSync(other ?? undefined).catch(() => ({ status: 0, error: 'Check your connection and try again.' }));
  if (r.queued && other) { const s = document.querySelector<HTMLElement>('#pf-linkedin [data-li-status]'); if (s) { s.textContent = 'Importing from LinkedIn… reload this page in a minute or two.'; s.classList.remove('is-error'); } return; }
  if (r.queued) { void linkedInPanel(); return; }
  btn.disabled = r.status === 429; fb.style.color = 'var(--color-orange)'; fb.textContent = r.error ?? 'Something went wrong. Try again.';
});

async function init() {
  const form = document.querySelector<HTMLFormElement>('.portal-profile'); if (!form || form.dataset.wired) return; form.dataset.wired = '1';
  document.querySelectorAll<HTMLElement>('.portal-profile [data-action], .portal-profile .portal-save-row').forEach((b) => { b.dataset.wired = '1'; });
  const saveBtn = form.querySelector<HTMLButtonElement>('[data-action="save"]')!;
  saveBtn.disabled = true; form.setAttribute('aria-busy', 'true');
  who = await me(); if (!who || !form.isConnected) return;
  const asked = new URLSearchParams(location.search).get('id');
  other = asked && who.admin && asked !== who.id ? asked : null;   // only admins; anyone else just gets their own profile
  const r = await reload();
  if (!form.isConnected) return;   // left the page while it loaded (client-side navigation keeps this script running)
  if (!r) { flash(saveBtn, 'NOT LOADED', other ? 'Could not load that profile. Go back and try again.' : 'Could not load your profile. Reload before editing.', false); form.removeAttribute('aria-busy'); return; }
  if (other) {
    const box = $('#pf-admin-edit')!; box.hidden = false; box.querySelector('[data-edit-name]')!.textContent = r.full_name || 'this member';
    box.querySelector<HTMLAnchorElement>('[data-edit-back]')!.href = `/alumni-portal/members/?id=${encodeURIComponent(other)}`;
    $('#pf-heading')!.textContent = 'EDIT PROFILE'; $('#pf-photo-note')!.textContent = 'Their photo shows on their card in search, on their member page and on the globe.';
    // admins can change anything (Bryan, 2026-10-06); an email an admin saves counts at once (no confirmation email) and is a sign-in address for them
    form.querySelectorAll<HTMLElement>('[data-contact="usc"] .portal-help, [data-contact="personal"] .portal-help').forEach((p) => { p.textContent = 'Saved straight away (no confirmation email), and they can sign in with it.'; });
  }
  form.inert = false;   // the data is here: unlock and fill in the same tick, so nothing typed can be overwritten
  if (r) { fill(r, who.admin); void linkedInPanel(); if (!who.approved && !other) loadClaims(r.claimed_roles); const full = await getProfile(r.id).catch(() => null); if (full?.roles.length && form.isConnected) { const box = $('#pf-eboard')!; box.innerHTML = roleLabel(full.roles).map((t) => `<span class="t-fine portal-chip" aria-pressed="true">${escapeHtml(t)}</span>`).join(''); } }

  // SAVE: the whole form
  // (the shared script preventDefaults every [data-action] click before it checks `wired`, so the form's
  // submit event never fires — listen on the button itself)
  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault(); const btn = saveBtn;
    if (badYears()) return;
    const patch = collect();
    // years that are real but don't fit together (joined in the future, graduated before joining, …): say which and stop
    const yp = yearProblems({ status: statusPicked() ? (patch.status ?? null) : null, grad_year: patch.grad_year ?? null, join_term: patch.join_term ?? null, join_year: patch.join_year ?? null });
    if (yp.length) {
      const boxes = yp.map((p) => (p.field === 'join' ? $<HTMLInputElement>('#pf-year') : [...document.querySelectorAll<HTMLInputElement>('#pf-grad-year, #pf-classof-year')].find((i) => i.offsetParent !== null) ?? null)).filter((b): b is HTMLInputElement => Boolean(b));
      boxes.forEach((b) => { b.classList.add('portal-needs'); b.setAttribute('aria-invalid', 'true'); }); boxes[0]?.focus();
      flash(btn, 'NOT SAVED', yp.map((p) => p.message).join(' '), false); return;
    } const applying = !who!.approved && !other; const typedCity = ($('#pf-loc') as HTMLInputElement).value.trim();
    const missing = [...(statusPicked() ? [] : ['whether you’re a student or an alum']), ...(applying
      ? applicationMissing({ full_name: patch.full_name ?? '', grad_year: patch.grad_year ?? null, join_year: patch.join_year ?? null, divisions: patch.divisions ?? [], city_id: row?.city_id ?? (typedCity ? -1 : null), linkedin_url: patch.linkedin_url ?? null, phone: typedPhone() ?? row?.phone ?? null, personal_email: row?.personal_email ?? null })
      : patch.full_name ? [] : ['your name'])];
    if (missing.length) { showMissing(missing, applying && !row?.submitted_at ? 'Before you can submit, add' : 'Your profile needs'); return; }
    if (applying) { const c = claimsFromForm(); if (c.problem) { flash(btn, 'NOT SAVED', c.problem, false); return; } }
    // a LinkedIn link must be a profile link; any spelling is stored in one form
    if (patch.linkedin_url) { const li = canonicalLinkedIn(patch.linkedin_url); if (!li) { const f = $('#pf-li') as HTMLInputElement; f.classList.add('portal-needs'); f.setAttribute('aria-invalid', 'true'); f.focus(); flash(btn, 'NOT SAVED', 'That isn’t a LinkedIn profile link. Copy it from your LinkedIn profile; it looks like linkedin.com/in/your-name.', false); return; } patch.linkedin_url = li; }
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    const waiting = !who!.approved && !other, wasSubmitted = Boolean(row?.submitted_at);
    try {
      // someone applying: a city typed but not yet placed is placed now, so SUBMIT doesn't say "your city" is missing
      if (waiting) {
        const ph = typedPhone(); if (ph && ph !== row?.phone) { const saved = await save({ phone: ph }); if (saved.ok) row = saved.row; }
        const typed = ($('#pf-loc') as HTMLInputElement).value.trim();
        if (typed && typed !== cityLabel(row?.city ?? null)) { const c = await findOrCreateCity(typed); if (!c.ok) { showMissing(['your city'], 'We couldn’t find that city, so check'); const f = $('.portal-save .portal-feedback'); if (f) f.textContent = `${c.message} It's outlined in orange under LOCATION.`; return; } patch.city_id = c.city.id; }
        const miss = applicationMissing({ full_name: patch.full_name ?? '', grad_year: patch.grad_year ?? null, join_year: patch.join_year ?? null, divisions: patch.divisions ?? [], city_id: patch.city_id ?? row?.city_id ?? null, linkedin_url: patch.linkedin_url ?? null, phone: row?.phone ?? null, personal_email: row?.personal_email ?? null });
        if (miss.length) { showMissing(miss, wasSubmitted ? 'Your profile still needs' : 'Before you can submit, add'); return; }
      }
      const res = await save(patch);
      if (!res.ok) { flash(btn, 'NOT SAVED', res.message, false); return; }
      if (waiting) {
        const sub = await submitApplication();   // marks them submitted (first time) and keeps a backup copy of what they sent
        if (sub.error) { fill(res.row, who!.admin); flash(btn, 'NOT SENT', `Saved, but it couldn't be sent to leadership: ${sub.error.message}`, false); return; }
        res.row.submitted_at = (sub.data as string | null) ?? new Date().toISOString(); who!.submitted = true;
      }
      fill(res.row, who!.admin); label(saveBtn); void linkedInPanel();
      if (waiting) { who!.missing = []; onboard(!wasSubmitted); flash(btn, wasSubmitted ? 'SAVED' : 'SUBMITTED', wasSubmitted ? 'Saved. Leadership sees your latest answers.' : 'Submitted. Your profile is with TroyLabs leadership.'); if (!wasSubmitted) $('#pf-onboard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      else flash(btn, 'SAVED', other ? 'Saved. Their card in search and their pin on the globe are up to date.' : 'Saved. Your card in search and your pin on the globe are up to date.');
    } catch { flash(btn, 'NOT SAVED', 'Check your connection and try again. Your changes are still in the form.', false); }
    finally { saveBtn.disabled = false; }
  });

  label(saveBtn); saveBtn.disabled = false; form.removeAttribute('aria-busy');
  // an error under the main button goes away as soon as they start fixing things (it read as if the finished profile were still wrong)
  const clearError = (e?: Event) => { const f = form.querySelector<HTMLElement>('.portal-save .portal-feedback'); if (f && f.style.color) { f.textContent = ''; f.style.color = ''; } for (const el of [(e?.target as Element | null)?.closest('.portal-needs, .portal-chips, input'), (e?.target as Element | null)?.closest('[data-field]')]) { el?.classList.remove('portal-needs'); el?.removeAttribute('aria-invalid'); } };
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
      // email rows go through the account-email function: a new address is confirmed by email before it counts (2026-10-05)
      if (kind === 'usc' || kind === 'personal') {
        const col = kind === 'usc' ? 'usc_email' : 'personal_email'; const was = (row?.[col] ?? '') as string;
        if ((v ?? '') === was.toLowerCase() || (v ?? '') === was) { flash(btn, 'SAVED', 'No change.'); return; }
        btn.disabled = true;
        const r = await accountEmail({ ...(v ? { mode: 'add', kind, email: v } : { mode: 'remove', kind }), ...(other ? { user_id: other } : {}) }).catch(() => ({ status: 0, error: 'Could not reach the server. Check your connection and try again.' } as Awaited<ReturnType<typeof accountEmail>>));
        if (r.saved || r.removed) { if (row) row = { ...row, [col]: v }; input.value = v ?? ''; rowEl.dispatchEvent(new Event('tl:saved')); flash(btn, 'SAVED', r.removed ? (other ? 'Removed. They can’t sign in with it anymore.' : 'Removed. You can’t sign in with it anymore.') : 'Saved.'); }
        else if (r.pending) { input.value = was; rowEl.dispatchEvent(new Event('tl:saved')); flash(btn, 'SENT', `We sent a confirmation link to ${v}. Click it and the address shows here; after that you can sign in with it too.`); }
        else { btn.disabled = false; flash(btn, 'NOT SAVED', r.error ?? 'Something went wrong. Try again.', false); }
        return;
      }
      const res = await save(patch);
      if (res.ok) { row = res.row; if (kind === 'phone') input.value = prettyPhone(res.row.phone); rowEl.dispatchEvent(new Event('tl:saved')); flash(btn, 'SAVED', kind === 'personal' ? 'Saved as your contact email. Your sign-in address has not changed.' : kind === 'phone' ? (other ? (textsOn ? 'Saved. They’ll get TroyLabs event texts.' : 'Saved. They won’t get texts.') : textsOn ? 'Saved. You’ll get TroyLabs event texts; reply STOP to any of them to stop.' : 'Saved. You won’t get texts.') : 'Saved.'); } else flash(btn, 'NOT SAVED', res.message, false);
    });
  }
  // announcements on/off saves the moment it's ticked
  $<HTMLInputElement>('#pf-email-opt')?.addEventListener('change', async (e) => {
    const box = e.currentTarget as HTMLInputElement; const out = $('#pf-email-opt-fb')!; const res = await save({ email_opt_in: box.checked });
    if (res.ok) { row = res.row; out.style.color = ''; out.textContent = box.checked ? (other ? 'Saved. They’ll get TroyLabs announcements by email.' : 'Saved. You’ll get TroyLabs announcements by email.') : (other ? 'Saved. They won’t get announcement emails.' : 'Saved. You won’t get announcement emails.'); } else { box.checked = !box.checked; out.style.color = 'var(--color-orange)'; out.textContent = res.message; }
  });
  $('#pf-phone-opt')?.addEventListener('change', () => { const b = document.querySelector<HTMLButtonElement>('[data-contact="phone"] .portal-save-row'); if (b) b.disabled = false; });

  // photo: resize, upload, show
  const photo = $<HTMLInputElement>('#pf-photo');
  photo?.addEventListener('change', async () => {
    const f = photo.files?.[0]; if (!f) return; const note = $('#pf-head-name')!; const was = note.textContent; note.textContent = 'Uploading photo…';
    const res = await uploadAvatar(f, other ?? undefined); note.textContent = was;
    if (res.ok) { const fresh = await reload(); if (fresh) { row = fresh; const img = $<HTMLImageElement>('#pf-photo-preview')!; img.src = avatarUrl(fresh)!; img.hidden = false; $('#pf-initials')!.dataset.hasPhoto = '1'; recount(); } } else alert(res.message);
  }, { capture: true });

  // location → pin
  $('[data-action="update"]')?.addEventListener('click', async (e) => {
    e.preventDefault(); const btn = e.currentTarget as HTMLElement; const text = ($('#pf-loc') as HTMLInputElement).value;
    if (!text.trim()) { flash(btn, 'NOT UPDATED', 'Type your city first, like "Los Angeles, CA".', false); return; }
    const c = await findOrCreateCity(text); if (!c.ok) { flash(btn, 'NOT FOUND', c.message, false); return; }
    const res = await save({ city_id: c.city.id });
    if (res.ok) { row = res.row; $<HTMLInputElement>('#pf-loc')!.value = cityLabel(res.row.city); $('#pf-loc-note')!.textContent = `${cityLabel(res.row.city)} · pin on the globe`; recount(); onboard(); flash(btn, 'UPDATED', `Pin placed: ${cityLabel(c.city)}.`); } else flash(btn, 'NOT SAVED', res.message, false);
  });
}
init();
document.addEventListener('astro:page-load', init);
