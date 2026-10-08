/**
 * Admin › Messages: SMS composer, group filters or explicit people, live eligible counts, drafts and self-tests.
 * SEND NOW and SCHEDULE, EDIT / CANCEL / DELETE, and for sent messages exactly who it went to. Sending is the
 * `send-message` edge function (Resend email, Twilio texts; it holds the keys and decides recipients itself).
 * Scheduled messages are sent by the database's five-minute job.
 */
import { me } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { cohortOf, type ProfileRow } from '../lib/portal/data';
import { prettyPhone } from '../lib/portal/phone';
import { currentTerm } from '../lib/portal/options';
import { SMS_MAX, placeholderLeft, segments, smsBody } from '../../supabase/functions/_shared/sms';
import { cleanAudience, describeAudience, inAudience, inCell, type Audience, type Cell, type EboardSets, type Group } from '../../supabase/functions/_shared/audience';

type Msg = { id: number; title: string; body: string; send_by: string; audience: Audience; event: any; state: string; scheduled_for: string | null; sent_at: string | null; updated_at: string; sent_count: number; failed_count: number; last_error: string | null };
type Rcpt = { message_id: number; profile_id: string; channel: 'email' | 'text'; email: string | null; phone: string | null; delivered_at: string | null; status: string | null; error: string | null };
type Delivery = { email: { configured: boolean; testMode: boolean; testTo: string | null; from?: string }; text: { configured: boolean; from: string | null; trial: boolean; error: string | null; testTo: string | null; hoursOpen: boolean } };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const fb = (text: string, ok = true) => { const el = $('#msg-fb'); if (el) { el.textContent = text; el.style.color = ok ? 'var(--color-muted)' : 'var(--color-orange)'; if (!ok) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); } } };
let people: ProfileRow[] = [], messages: Msg[] = [], rcpts: Rcpt[] = [], editing: number | null = null;
let delivery: Delivery | null = null;
let viewer: { id: string; email: string } | null = null;
let deliveryUnknown = false;
let dataReady = false;
let actionBusy = false;
let pageGeneration = 0;
let imTest = false;   // a test admin's page counts and sends only within test accounts (send-message does the same)
let nudged = false;   // the 'tick a box' hint turns orange only after someone tries to send without one
let eb: EboardSets = { now: new Set(), ever: new Set() };   // e-board this semester / in any semester (the E-BOARD row)

/** call the send-message function as the signed-in admin */
async function fn(mode: string, messageId?: number, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; status: number; body: any }> {
  const { data: { session } } = await supabase().auth.getSession();
  const url = ((import.meta.env.PUBLIC_SUPABASE_URL as string | undefined) || 'https://ackmhqxyxnceoarbhcrp.supabase.co') + '/functions/v1/send-message';
  try {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, messageId, ...extra }) });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
  } catch { return { ok: false, status: 0, body: { error: 'Couldn’t reach the sending service. Check your connection.' } }; }
}
/** Delivery readiness comes from the sending service; never infer carrier approval from credentials. */
function showDelivery() {
  const el = $('#msg-delivery'); if (!el) return;
  if (deliveryUnknown) { el.textContent = 'Text delivery status could not be checked. You can still prepare and save drafts.'; el.classList.add('is-warn'); return; }
  if (!delivery) return;
  const t = delivery.text, ready = t.configured && !t.trial && !t.error;
  el.classList.toggle('is-warn', !ready);
  el.textContent = ready ? `Texts use ${prettyPhone(t.from)}. Audience sends go out 8 AM–9 PM Pacific.` : 'Text delivery is not ready yet. Prepare your message and save a draft while setup is pending.';
}
let audienceMode: 'groups' | 'people' = 'groups';
let selectedPeople = new Set<string>();
const hasSelection = (a: Audience) => a.mode === 'people' ? Boolean(a.profile_ids?.length) : Boolean(a.cells.length);
function setAudienceMode(mode: 'groups' | 'people') {
  audienceMode = mode;
  document.querySelectorAll<HTMLElement>('[data-audience-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.audienceMode === mode)));
  $('[data-groups-panel]')!.hidden = mode !== 'groups'; $('[data-people-panel]')!.hidden = mode !== 'people';
  renderPeople(); summary();
}
function matchingPeople() {
  const q = ($<HTMLInputElement>('#mc-person-search')?.value ?? '').trim().toLowerCase();
  return people.filter(p => p.approved && (!q || `${p.full_name} ${p.phone ?? ''} ${prettyPhone(p.phone)}`.toLowerCase().includes(q))).sort((a,b) => (a.full_name || '').localeCompare(b.full_name || ''));
}
function renderPeople() {
  const list = $('[data-people-list]'); if (!list) return;
  const rows = matchingPeople(); $('[data-people-count]')!.textContent = `${howMany(rows.length, 'member')} · ${selectedPeople.size} selected`;
  list.innerHTML = rows.map(p => `<label class="msg-person"><input type="checkbox" data-person-id="${esc(p.id)}" ${selectedPeople.has(p.id) ? 'checked' : ''}><span><span class="text-ink">${esc(p.full_name || '(no name)')}</span><span class="t-fine text-muted">${p.phone ? esc(prettyPhone(p.phone)) : 'No phone number'}${p.phone && !p.phone_opt_in ? ' · Texts off' : ''}</span></span></label>`).join('') || '<p class="t-fine text-muted">No matching members.</p>';
}

/** what the grid and the narrowing chips say right now */
function picked(): Audience {
  if (audienceMode === 'people') return cleanAudience({ mode: 'people', profile_ids: [...selectedPeople], cells: [] });
  const cells = [...document.querySelectorAll<HTMLElement>('[data-aud-grid] .portal-chip[aria-pressed="true"]')].map((c) => ({ group: c.dataset.group as Group, who: c.dataset.who as Cell['who'] }));
  const chips = (sel: string) => [...document.querySelectorAll<HTMLElement>(`${sel} .portal-chip[aria-pressed="true"]`)].map((c) => c.dataset.value ?? c.textContent!.replace(/^✓\s*/, '').trim());
  return cleanAudience({ cells, cohort: chips('[data-cohorts]'), industries: chips('[data-aud-industries]') });
}
const sendByNow = () => 'text';
const audience = () => { const aud = picked(), sendBy = sendByNow(); return { aud, sendBy, ...reach(aud, sendBy) }; };
const emailOf = (p: ProfileRow) => (p.personal_email || p.usc_email || '').trim().toLowerCase();
const byEmail = (p: ProfileRow) => Boolean(emailOf(p) && p.email_opt_in !== false);
const byText = (p: ProfileRow) => Boolean(p.phone && p.phone_opt_in);
/** who an audience reaches by each channel: the shared rules (_shared/audience.ts), then approval and opt-ins, as the sender does */
function reach(aud: Audience, sendBy: string) {
  const base = people.filter((p) => p.approved && inAudience(p, aud, eb));
  const once = (rows: ProfileRow[], key: (p: ProfileRow) => string) => { const seen = new Set<string>(); return rows.filter(p => { const value = key(p); if (seen.has(value)) return false; seen.add(value); return true; }); };
  const emails = sendBy === 'text' ? [] : once(base.filter(byEmail), emailOf), texts = sendBy === 'email' ? [] : once(base.filter(byText), p => p.phone!);
  const who = base.filter((p) => emails.includes(p) || texts.includes(p));
  return { emails, texts, who };
}
const howMany = (n: number, what = 'person') => `${n.toLocaleString()} ${n === 1 ? what : what === 'person' ? 'people' : `${what}s`}`;
const reachText = (a: { sendBy: string; emails: unknown[]; texts: unknown[] }) => a.sendBy === 'email' ? `by email to ${howMany(a.emails.length)}` : a.sendBy === 'text' ? `by text to ${howMany(a.texts.length)}` : `by email to ${howMany(a.emails.length)} and by text to ${howMany(a.texts.length)}`;
/** the live text counter under the body: what the text will look like in length and cost */
function smsCount() {
  showDelivery(); showTestTarget();
  const out = $('#mc-sms'); if (!out) return;
  const sendBy = sendByNow();
  const body = ($('#mc-body') as HTMLTextAreaElement).value;
  out.hidden = sendBy === 'email' || !body.trim();
  const prev = $('[data-sms-preview]'); if (prev) prev.hidden = out.hidden;
  if (out.hidden) return;
  const c = compose(); const sms = smsBody(c.body, c.event); const size = segments(sms);
  const bubble = $('[data-sms-bubble]'); if (bubble) bubble.textContent = sms;   // exactly what each phone gets: "TroyLabs:", the event line, the STOP line
  out.style.color = sms.length > SMS_MAX ? 'var(--color-orange)' : '';
  out.textContent = sms.length > SMS_MAX ? `Too long for a text: ${sms.length} of ${SMS_MAX} characters.`
    : `As a text: ${size.chars} characters with “TroyLabs:” and the STOP line, ${size.segments === 1 ? 'one text' : `${size.segments} texts joined into one`} per person${size.unicode ? ' (an emoji or special character makes texts shorter)' : ''}.`;
}

/** every cohort an approved member joined in, newest first (FA26, SP26, FA25 …), keeping what was ticked */
function renderCohorts() {
  const box = $('[data-cohorts]'); if (!box) return;
  const on = new Set([...box.querySelectorAll<HTMLElement>('.portal-chip[aria-pressed="true"]')].map((c) => c.textContent!.replace(/^✓\s*/, '').trim()));
  const key = (c: string) => Number(c.slice(2)) * 2 + (c.startsWith('FA') ? 1 : 0);
  const list = [...new Set(people.filter((p) => p.approved).map((p) => cohortOf(p.join_term, p.join_year)).filter(Boolean))].sort((a, b) => key(b) - key(a));
  box.innerHTML = list.map((c) => `<button type="button" class="t-fine portal-chip" aria-pressed="${on.has(c)}">${esc(c)}</button>`).join('') || '<span class="t-fine text-muted">No cohorts yet: members add the semester they joined on their profile.</span>';
}
/** each box shows how many approved members are in it; the summary line says who it adds up to */
function renderGrid() {
  for (const c of document.querySelectorAll<HTMLElement>('[data-aud-grid] .portal-chip')) {
    const n = people.filter((p) => p.approved && inCell(p, { group: c.dataset.group as Group, who: c.dataset.who as Cell['who'] }, eb)).length;
    const label = c.querySelector<HTMLElement>('[data-n]'); if (label) label.textContent = n.toLocaleString();
  }
  summary();
}
function summary() {
  const out = $('[data-aud-summary]'); if (!out) return; const a = audience();
  const base = people.filter(p => p.approved && inAudience(p, a.aud, eb));
  out.textContent = hasSelection(a.aud) ? `${howMany(base.length, 'member')} selected · ${howMany(a.texts.length, 'text recipient')}` : 'Choose groups or specific people.';
  const desc = $('[data-aud-description]'); if (desc) desc.textContent = hasSelection(a.aud) ? `${describeAudience(a.aud)}. ${base.length - a.texts.length ? `${base.length - a.texts.length} without a separate text; see the list below.` : 'Each phone receives one text.'}` : 'Only members with texts turned on will receive.';
  const sendSummary = $('[data-send-summary]'); if (sendSummary) sendSummary.textContent = hasSelection(a.aud) ? `${howMany(a.texts.length, 'text')} to ${describeAudience(a.aud)}. Review the recipient list above before sending.` : 'Choose recipients above.';
  renderWho(a);
}
/** the people the ticked boxes add up to, by name, with how each is reached; and who in the group won't get it, and why */
function renderWho(a: ReturnType<typeof audience>) {
  const box = $('[data-who-list]'), list = $('[data-who-items]'), head = $('[data-who-head]'); if (!box || !list || !head) return;
  box.hidden = !hasSelection(a.aud); if (box.hidden) return;
  const name = (p: ProfileRow) => p.full_name || '(no name yet)'; const byName = (x: ProfileRow, y: ProfileRow) => name(x).localeCompare(name(y));
  const inGroup = people.filter((p) => p.approved && inAudience(p, a.aud, eb)); const missed = inGroup.filter((p) => !a.who.includes(p)).sort(byName);
  const noText = (p: ProfileRow) => byText(p) ? 'shared phone; text sent once' : p.phone ? 'texts off' : 'no number';
  const noMail = (p: ProfileRow) => byEmail(p) ? 'shared email; email sent once' : emailOf(p) ? 'announcements off' : 'no email';
  const why = (p: ProfileRow) => a.sendBy === 'text' ? noText(p) : a.sendBy === 'email' ? noMail(p) : `${noText(p)}, ${noMail(p)}`;
  head.textContent = `REVIEW RECIPIENTS · ${howMany(a.who.length, 'text')}`;
  list.innerHTML = [...a.who].sort(byName).map((p) => `<li><span class="text-ink">${esc(name(p))}</span><span class="text-muted">${esc(prettyPhone(p.phone))}</span></li>`).join('')
    + (missed.length ? `<li class="portal-who-missed"><span class="text-muted">Excluded or shared numbers (${missed.length}): ${missed.map((p) => `${esc(name(p))} (${why(p)})`).join(', ')}</span></li>` : '')
    + (!a.who.length && !missed.length ? '<li class="text-muted">Nobody is in these groups yet.</li>' : '');
}
/* Templates (Bryan, 2026-10-06: "a formatting already for the text messages"): fill the composer; anything in [brackets]
   is for the admin to replace, and nothing sends while a [placeholder] is left. Each text goes out as "TroyLabs: …",
   then the event line and RSVP link when event details are filled in, then "Reply STOP to opt out." */
type Template = { label: string; body: string; event?: boolean };
const TEMPLATES: Template[] = [
  { label: 'EVENT INVITE', body: "You're invited to [Event name]! [One line on why to come]. RSVP below.", event: true },
  { label: 'EVENT REMINDER', body: 'Reminder: [Event name] is tomorrow at [Time], [Location]. See you there!' },
  { label: 'ANNOUNCEMENT', body: '[Your news in one or two sentences]. More at usctroylabs.com' },

];
function useTemplate(t: Template) {
  editing = null; setWhen(null); composerState();
  document.querySelectorAll<HTMLElement>('[data-template]').forEach(b => b.setAttribute('aria-pressed', String(TEMPLATES[Number(b.dataset.template)] === t)));
  ($('#mc-body') as HTMLTextAreaElement).value = t.body;
  for (const id of ['#mc-ev-name', '#mc-ev-when', '#mc-ev-where', '#mc-ev-rsvp']) ($(id) as HTMLInputElement).value = '';
  if (t.event) { ($('#mc-ev-name') as HTMLInputElement).value = '[Event name]'; ($('#mc-ev-where') as HTMLInputElement).value = '[Location]'; const d = document.querySelector<HTMLDetailsElement>('details[data-fold]'); if (d) d.open = true; }
  smsCount(); summary(); fb(`Loaded the ${t.label.toLowerCase()} template. Replace everything in [brackets], pick who gets it, then send yourself a test.`);
}
/** a [placeholder] left from a template: nothing sends (or schedules) until it's filled in */
const leftover = () => { const c = compose(); return placeholderLeft(c.title, c.body, c.event?.name, c.event?.where, c.event?.rsvp); };
function renderMessages() {
  const list = $('[data-msg-list]')!; const tab = $('[data-msg-tabs] .portal-chip[aria-pressed="true"]')?.dataset.value ?? 'all';
  const rows = messages.filter((m) => m.state !== 'cancelled' && (tab === 'all' || tab === m.state));
  list.innerHTML = rows.length ? rows.map((m) => { const r0 = reach(cleanAudience(m.audience), m.send_by); const who = r0.who;
    const sentTo = rcpts.filter((r) => r.message_id === m.id); const named = (r: Rcpt) => people.find((p) => p.id === r.profile_id)?.full_name || '(no name)';
    const ok = (c: string) => sentTo.filter((r) => r.channel === c && r.delivered_at && r.status !== 'undelivered' && r.status !== 'failed').length;
    const lost = sentTo.filter((r) => r.error).length;
    const reached = m.state === 'sent' ? `${ok('email') + ok('text')} sent · ${sentTo.filter(r => r.status === 'delivered').length} confirmed delivered${lost ? ` · ${lost} failed` : ''}` : `${who.length.toLocaleString()} eligible now`;
    const when = m.state === 'sent' && m.sent_at ? `Sent ${new Date(m.sent_at).toLocaleString()}` : m.state === 'scheduled' && m.scheduled_for ? `Sends ${new Date(m.scheduled_for).toLocaleString()}` : `Edited ${new Date(m.updated_at).toLocaleDateString()}`;
    return `<li data-state="${m.state}" data-id="${m.id}" style="flex-direction:column;align-items:stretch;gap:calc(8 * var(--u))"${tab !== 'all' && tab !== m.state ? ' hidden' : ''}>
      <div class="flex items-center" style="gap:calc(12 * var(--u))"><span class="t-fine portal-tag" style="${m.state === 'sent' ? 'color:var(--color-ink)' : m.state === 'scheduled' || m.state === 'sending' ? 'color:var(--color-orange)' : ''}">${m.state.toUpperCase()}</span><span class="text-ink" style="flex:1">${esc(m.title || '(untitled)')}</span><span class="t-fine text-muted">${when}${m.send_by !== 'text' ? ' · Older email record' : ''}</span><span class="t-fine text-muted">${m.send_by === 'both' ? 'EMAIL + TEXT' : m.send_by.toUpperCase()}</span></div>
      <p class="m-0 t-fine text-muted" style="max-width:calc(620 * var(--u))">${esc(m.body.slice(0, 140))}${m.body.length > 140 ? '…' : ''}</p>
      <div class="flex items-center" style="gap:calc(16 * var(--u))"><span class="t-fine text-muted">To: ${esc(describeAudience(cleanAudience(m.audience)))} · ${reached}</span><span style="flex:1"></span>
        ${['draft', 'scheduled'].includes(m.state) && m.send_by === 'text' ? `<button type="button" class="t-label portal-linklike" style="color:var(--color-orange)" data-edit="${m.id}">EDIT</button>` : ''}
        ${m.state === 'scheduled' ? `<button type="button" class="t-label portal-linklike" data-cancel="${m.id}">CANCEL</button>` : ''}
        <button type="button" class="t-label portal-linklike" data-recipients-for="${m.id}">${m.state === 'sent' ? 'RECIPIENTS & STATUS' : 'REVIEW RECIPIENTS'}</button>
        ${m.state === 'draft' ? `<button type="button" class="t-label portal-linklike" data-del="${m.id}">DELETE</button>` : ''}</div>
      ${m.last_error && m.state !== 'sent' ? `<p class="m-0 t-fine portal-msg-error">Not sent: ${esc(m.last_error)}</p>` : m.last_error ? `<p class="m-0 t-fine portal-msg-error">${esc(m.last_error)}</p>` : ''}
      <ul class="portal-row-list t-fine portal-recipients" hidden>${m.state === 'sent'
        ? sentTo.map((r) => `<li><span>${esc(named(r))} · ${r.channel === 'text' ? `text ${esc(prettyPhone(r.phone))}` : esc(r.email ?? '')}</span><span class="${r.error ? 'portal-msg-error' : 'text-muted'}" title="${esc(r.error ?? '')}">${r.error ? `FAILED: ${esc(r.error)}` : r.status === 'delivered' ? 'DELIVERED' : (r.status || (r.delivered_at ? 'SENT' : 'PENDING')).toUpperCase()}</span></li>`).join('') || '<li class="text-muted">No recipients recorded.</li>'
        : who.map((p) => `<li><span>${esc(p.full_name || '(no name)')} · ${[r0.emails.includes(p) && esc(p.personal_email || p.usc_email || ''), r0.texts.includes(p) && `text ${esc(prettyPhone(p.phone))}`].filter(Boolean).join(' · ')}</span></li>`).join('') || `<li class="text-muted">Nobody matches right now${m.send_by !== 'email' ? ' (texts go only to people who opted in)' : ''}.</li>`}</ul>
    </li>`; }).join('') : messages.some(m => m.state !== 'cancelled') ? '<li class="t-fine text-muted">No messages in this view yet.</li>' : '<li class="msg-empty t-caption text-muted" data-msg-empty>No messages yet. Saved drafts, scheduled texts and sent messages will appear here.</li>';
}
/** texts have no subject (Bryan, 2026-10-08): a TEXT-only message is named in the history by the start of its body */
const nameFromBody = (body: string) => { const b = body.replace(/\s+/g, ' ').trim(); if (b.length <= 60) return b; const cut = b.slice(0, 60); return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 60)}…`; };
const subjectOf = () => nameFromBody(($('#mc-body') as HTMLTextAreaElement).value);
const needsFirst = () => ($('#mc-body') as HTMLTextAreaElement).value.trim() ? null : 'Write the message first.';

const compose = () => ({ title: subjectOf(), body: ($('#mc-body') as HTMLTextAreaElement).value.trim(), event: ($('#mc-ev-name') as HTMLInputElement).value.trim() ? { name: ($('#mc-ev-name') as HTMLInputElement).value.trim(), when: ($('#mc-ev-when') as HTMLInputElement).value || null, where: ($('#mc-ev-where') as HTMLInputElement).value.trim() || null, rsvp: ($('#mc-ev-rsvp') as HTMLInputElement).value.trim() || null } : null });
function setWhen(iso: string | null) {
  const input = $<HTMLInputElement>('#mc-when'); if (!input) return;
  const date = iso ? new Date(iso) : null;
  input.value = date ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '';
  document.querySelectorAll<HTMLElement>('[data-when] .portal-chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.value === (iso ? 'later' : 'now'))));
  const at = $('[data-when-at]'), button = $('[data-send-btn]'); if (at) at.hidden = !iso; if (button) button.textContent = iso ? 'SCHEDULE' : 'SEND NOW';
}
function resetComposer() {
  editing = null; setWhen(null); composerState();
  for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('#mc-body, #mc-ev-name, #mc-ev-when, #mc-ev-where, #mc-ev-rsvp, #mc-person-search')) el.value = '';
  document.querySelectorAll<HTMLElement>('[data-template]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  document.querySelectorAll<HTMLDetailsElement>('details[data-fold]').forEach(d => { d.open = false; });
  setPicked({cells:[]}); smsCount();
}
function composerState() {
  const state = $('[data-compose-state]'); if (state) state.textContent = editing ? 'Editing saved message' : 'New message';
}
function showTestTarget() {
  const target = $('[data-test-target]'); if (!target || !viewer) return;
  const own = people.find(p => p.id === viewer!.id);
  target.textContent = `Text: ${own?.phone ? prettyPhone(own.phone) : 'Add your phone on your profile'}`;
}
function loadIntoComposer(m: Msg) {
  if (m.send_by !== 'text') { fb('This is an older email record. New messages are text-only.', false); return; }
  editing = m.id; ($('#mc-body') as HTMLTextAreaElement).value = m.body;
  ($('#mc-ev-name') as HTMLInputElement).value = m.event?.name ?? ''; ($('#mc-ev-when') as HTMLInputElement).value = m.event?.when ?? ''; ($('#mc-ev-where') as HTMLInputElement).value = m.event?.where ?? ''; ($('#mc-ev-rsvp') as HTMLInputElement).value = m.event?.rsvp ?? '';

  setPicked(cleanAudience(m.audience));
  setWhen(m.scheduled_for); composerState();
  const a = cleanAudience(m.audience); document.querySelectorAll<HTMLDetailsElement>('details[data-fold]').forEach((d) => { if ((d.querySelector('#mc-ev-name') && m.event) || (d.classList.contains('portal-or') && (a.cohort?.length || a.industries?.length))) d.open = true; });
  document.querySelector('.portal-panels')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); fb(`Editing “${m.title || '(untitled)'}”. Save as a draft, schedule, or send.`); smsCount();
}
/** put an audience back on the grid (EDIT, NEW DRAFT) */
function setPicked(a: Audience) {
  selectedPeople = new Set(a.profile_ids ?? []);
  setAudienceMode(a.mode === 'people' ? 'people' : 'groups');
  for (const c of document.querySelectorAll<HTMLElement>('[data-aud-grid] .portal-chip')) c.setAttribute('aria-pressed', String(a.cells.some((x) => x.group === c.dataset.group && x.who === c.dataset.who)));
  for (const c of document.querySelectorAll<HTMLElement>('[data-cohorts] .portal-chip')) c.setAttribute('aria-pressed', String((a.cohort ?? []).includes(c.textContent!.replace(/^✓\s*/, '').trim())));
  for (const c of document.querySelectorAll<HTMLElement>('[data-aud-industries] .portal-chip')) c.setAttribute('aria-pressed', String((a.industries ?? []).includes(c.textContent!.replace(/^✓\s*/, '').trim())));
  summary();
}
/** write the composer to the database (new or the one being edited) and return its id */
async function persist(state: 'draft' | 'scheduled'): Promise<{ id: number; who: number } | { error: string }> {
  const form = document.querySelector('.msg-compose');
  const c = compose(); if (!c.body) return { error: 'Write the message first.' };
  if (state === 'scheduled') { if (!c.title) return { error: 'Add a subject first.' }; const ph = leftover(); if (ph) return { error: `Fill in ${ph} first. It's still the template's placeholder.` }; }
  const a = audience(); if (state === 'scheduled' && !hasSelection(a.aud)) { nudged = true; summary(); return { error: 'Choose at least one group or specific person first.' }; }   // a draft can wait for its audience
  if (state === 'scheduled' && !a.who.length) return { error: 'Nobody in this audience can be reached that way. Check your groups and filters.' };
  if (state === 'scheduled' && a.sendBy !== 'email' && smsBody(c.body, c.event).length > SMS_MAX) return { error: `Too long for a text. Shorten the message to ${SMS_MAX} characters and try again.` };
  const later = $('[data-when] .portal-chip[aria-pressed="true"]')?.dataset.value === 'later'; const at = ($('#mc-when') as HTMLInputElement).value;
  if (state === 'scheduled' && later && !at) return { error: 'Pick a date and time to schedule it.' };
  if (state === 'scheduled' && at && (!Number.isFinite(new Date(at).getTime()) || new Date(at).getTime() <= Date.now())) return { error: 'That time has already passed. Pick a time in the future, or choose SEND NOW.' };
  if (state === 'scheduled' && later && at && a.sendBy !== 'email') { const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(new Date(at))); if (h < 8 || h >= 21) return { error: 'Texts only go out between 8 AM and 9 PM Pacific. Pick a time in that window, and try again.' }; }
  const row = { ...c, send_by: a.sendBy, audience: a.aud, channel_id: null, filters: {}, state, scheduled_for: state === 'scheduled' ? (later && at ? new Date(at).toISOString() : new Date().toISOString()) : null, last_error: null };
  const sb = supabase(); const res = editing ? await sb.from('messages').update(row).eq('id', editing).in('state', ['draft', 'scheduled']).select().single() : await sb.from('messages').insert(row).select().single();
  if (res.error) return { error: editing && res.error.code === 'PGRST116' ? 'This message is no longer editable. Reload to see its current status, or press NEW DRAFT.' : res.error.message };
  if (form?.isConnected) { editing = res.data.id; composerState(); } return { id: res.data.id, who: a.who.length };
}
const busy = async (btn: HTMLElement, work: () => Promise<void>) => {
  if (actionBusy || !dataReady) return;
  const generation = pageGeneration;
  actionBusy = true; btn.setAttribute('aria-busy', 'true');
  const buttons = [...document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('.portal-messaging button, .portal-messaging input, .portal-messaging textarea')];
  const disabled = buttons.map(b => b.disabled); buttons.forEach(b => { b.disabled = true; });
  try { await work(); } finally {
    if (generation !== pageGeneration) return;
    actionBusy = false; btn.removeAttribute('aria-busy');
    buttons.forEach((b, i) => { if (b.isConnected) b.disabled = disabled[i]; });
    if (!dataReady) setDataActions(false);
  }
};
function setDataActions(ready: boolean) {
  document.querySelectorAll<HTMLButtonElement>('[data-action="preview"], [data-action="draft"], [data-action="test-send"], [data-action="send"]').forEach(b => { b.disabled = !ready || actionBusy; });
}
const done = (btn: HTMLElement, text: string) => { const o = btn.textContent; btn.classList.add('is-done'); btn.textContent = text; setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = o; }, 1600); };
async function save(state: 'draft' | 'scheduled', btn: HTMLElement) {
  await busy(btn, async () => {
    const r = await persist(state); if (!btn.isConnected) return; if ('error' in r) { fb(r.error, false); return; }
    const at = ($('#mc-when') as HTMLInputElement).value;
    fb(state === 'draft' ? 'Saved as a draft. It’s in the list below.' : `Scheduled for ${new Date(at).toLocaleString()} to ${howMany(r.who)}. It sends by itself within five minutes of that time.`);
    resetComposer();
    await load();
  });
}
async function testSend(btn: HTMLElement) {
  await busy(btn, async () => {
    { const need = needsFirst(); if (need) { fb(need, false); return; } }
    const ph = leftover(); if (ph) { fb(`Fill in ${ph} first. It's still the template's placeholder.`, false); return; }
    // Testing a saved schedule must not silently cancel it. Test an independent draft.
    const scheduled = messages.find(m => m.id === editing && m.state === 'scheduled');
    if (scheduled) editing = null;
    const r = await persist('draft'); if (!btn.isConnected) return; if ('error' in r) { if (scheduled) editing = scheduled.id; composerState(); fb(r.error, false); return; }
    fb('Sending you a test…');
    const res = await fn('test', r.id); if (!btn.isConnected) return; const got = [res.body.email && `an email to ${res.body.email} (check spam too)`, res.body.text && `a text to ${prettyPhone(res.body.text)}`].filter(Boolean).join(' and ');
    if (res.ok) { done(btn, 'SENT'); fb(`Test sent: ${got}. ${scheduled ? 'Test copy saved as a draft; the original schedule is unchanged.' : "It's saved as a draft."}`); } else fb(`${got ? `Sent ${got}. ` : ''}${res.body.error ?? 'The test didn’t send.'}`, false);
    await load();
  });
}
async function sendNow(btn: HTMLElement) {
  const later = $('[data-when] .portal-chip[aria-pressed="true"]')?.dataset.value === 'later';
  if (later) { await save('scheduled', btn); return; }
  await busy(btn, async () => {
    { const need = needsFirst(); if (need) { fb(need, false); return; } } const title = subjectOf();
    const ph = leftover(); if (ph) { fb(`Fill in ${ph} first. It's still the template's placeholder.`, false); return; }
    const a = audience();
    if (!hasSelection(a.aud)) { nudged = true; summary(); fb('Choose at least one group or specific person first.', false); return; }
    if (!a.who.length) { fb(a.sendBy === 'email' ? 'Nobody matches this audience (or everyone in it has turned announcements off).' : 'Nobody in this audience can be reached that way. Texts go only to people who added a number and opted in.', false); return; }
    if (a.sendBy !== 'email') { const sms = smsBody(compose().body, compose().event); if (sms.length > SMS_MAX) { fb(`Too long for a text: ${sms.length} of ${SMS_MAX} characters. Shorten it, and try again.`, false); return; } }
    if (!confirm(`Send “${title}” ${reachText(a)} now? This can’t be unsent.`)) return;
    const r = await persist('draft'); if (!btn.isConnected) return; if ('error' in r) { fb(r.error, false); return; }
    fb('Sending…');
    const res = await fn('send', r.id); if (!btn.isConnected) return;
    if (res.ok) { done(btn, 'SENT'); resetComposer(); fb(`Sent ${howMany(res.body.sent, 'message')}.${res.body.failed ? ` ${res.body.failed} failed: ${res.body.error}` : ''} It’s in the list below with who got it.`); }
    else fb(res.body.error ?? 'It didn’t send.', false);
    await load();
  });
}
async function load() {
  const list = $('[data-msg-list]');
  const sb = supabase(); const now = currentTerm();
  const results = await Promise.all([
    sb.from('profiles').select('id, full_name, approved, is_test, status, divisions, join_term, join_year, industries, personal_email, usc_email, phone, phone_opt_in, email_opt_in'),
    sb.from('messages').select('*').order('updated_at', { ascending: false }),
    sb.from('message_recipients').select('message_id, profile_id, channel, email, phone, delivered_at, status, error'),
    sb.from('eboard_roles').select('profile_id, term, year'),
    sb.rpc('viewer_is_test'),
  ]);
  if (!list?.isConnected) return false;
  dataReady = results.every(result => !result.error);
  setDataActions(dataReady);
  if (!dataReady) { fb('Couldn’t load the messages and recipients. Reload the page to try again before saving or sending.', false); return false; }
  const [p, m, r, e, test] = results.map(result => result.data);
  // Match the sender's isolated test/real audience, only after every required lookup succeeded.
  imTest = Boolean(test);
  people = ((p ?? []) as (ProfileRow & { is_test?: boolean })[]).filter(x => Boolean(x.is_test) === imTest);
  messages = (m ?? []) as Msg[]; rcpts = (r ?? []) as Rcpt[];
  const roles = (e ?? []) as { profile_id: string; term: string; year: number }[];
  eb = { now: new Set(roles.filter(x => x.term === now.term && x.year === now.year).map(x => x.profile_id)), ever: new Set(roles.map(x => x.profile_id)) };
  renderCohorts(); renderPeople(); renderGrid(); renderMessages(); smsCount(); void backlog();
  return true;
}
/** members who turned texts on before texts were connected never got the welcome: list them, and send it once */
let backlogPeople: { id: string; name: string; phone: string }[] = [];
async function backlog() {
  const row = $('[data-backlog]'); if (!row) return;
  const res = await fn('welcome-backlog', undefined, { dry: true }); if (!row.isConnected || !res.ok) return;
  backlogPeople = res.body.people ?? []; row.hidden = !backlogPeople.length;
  const t = delivery?.text; const ready = imTest || Boolean(t?.configured && !t.trial && !t.error);
  $('[data-backlog-note]')!.textContent = `${howMany(backlogPeople.length)} ${backlogPeople.length === 1 ? 'hasn’t' : 'haven’t'} had the welcome text yet.${ready ? '' : ' It can go out once texts are connected (the Twilio registration is approved).'}`;
  ($('[data-backlog-send]') as HTMLButtonElement).disabled = !ready;
  $('[data-backlog-list]')!.innerHTML = backlogPeople.map((p) => `<li><span class="text-ink">${esc(p.name || '(no name yet)')}</span><span class="text-muted">${esc(prettyPhone(p.phone))}</span></li>`).join('');
}
async function init() {
  const list = $('[data-msg-list]'); if (!list || list.dataset.wired) return; list.dataset.wired = '1';
  pageGeneration++;
  document.querySelectorAll<HTMLElement>('[data-action]').forEach((b) => { b.dataset.wired = '1'; });
  // Keep optional details available without burying the sending controls.
  document.querySelectorAll<HTMLDetailsElement>('details[data-fold]').forEach((d) => { d.open = false; });
  audienceMode = 'groups'; selectedPeople.clear();
  editing = null; delivery = null; deliveryUnknown = false; dataReady = false; actionBusy = false; nudged = false;
  // the action buttons wake up once the page has its data (a click during loading used to do nothing)
  const actions = [...document.querySelectorAll<HTMLButtonElement>('[data-action="preview"], [data-action="draft"], [data-action="test-send"], [data-action="send"]')];
  actions.forEach((b) => { b.disabled = true; });
  const who = await me(); if (!who?.admin || !list.isConnected) return; viewer = { id: who.id, email: who.email }; await load(); if (!list.isConnected) return;
  const zone = $('[data-timezone]'); if (zone) zone.textContent = `Send date and time (${Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ')})`;
  document.querySelector('.msg-compose')?.addEventListener('submit', e => e.preventDefault());
  setDataActions(dataReady);
  void fn('status').then((res) => { if (!list.isConnected) return; deliveryUnknown = !res.ok; delivery = res.ok ? res.body : null; showDelivery(); showTestTarget(); void backlog(); });
  const tpl = $('[data-templates]'); if (tpl) tpl.innerHTML = TEMPLATES.map((t, i) => `<button type="button" class="t-fine portal-chip" aria-pressed="false" data-template="${i}">${esc(t.label)}</button>`).join('');
  document.querySelector('.portal-panels form')?.addEventListener('input', () => { smsCount(); const note = $('#msg-fb'); if (note?.textContent?.startsWith('Loaded the ')) note.textContent = ''; });
  $('#mc-person-search')?.addEventListener('input', renderPeople);
  $('[data-people-list]')?.addEventListener('change', e => { const input = e.target as HTMLInputElement; const id = input.dataset.personId; if (!id || actionBusy) return; input.checked ? selectedPeople.add(id) : selectedPeople.delete(id); $('[data-people-count]')!.textContent = `${howMany(matchingPeople().length, 'member')} · ${selectedPeople.size} selected`; summary(); });
  document.querySelector('.portal-section')!.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!b) return;
    if (b.dataset.audienceMode) { setAudienceMode(b.dataset.audienceMode as 'groups' | 'people'); return; }
    if (b.dataset.action === 'clear-audience') { setPicked({cells:[], ...(audienceMode === 'people' ? {mode:'people' as const,profile_ids:[]} : {})}); return; }
    if (b.dataset.action === 'select-people') { matchingPeople().forEach(p => selectedPeople.add(p.id)); renderPeople(); summary(); return; }
    if (b.closest('[data-aud-grid], [data-aud-industries]')) setTimeout(summary, 0);   // the shared script flips these chips; read them after
    if (b.dataset.action === 'new-draft') { resetComposer(); fb('New draft.'); $('#mc-body')?.focus(); }
    else if (b.dataset.action === 'draft') { e.preventDefault(); await save('draft', b); }
    else if (b.dataset.action === 'send') { e.preventDefault(); await sendNow(b); }
    else if (b.dataset.action === 'test-send') { e.preventDefault(); await testSend(b); }
    else if (b.dataset.template) { e.preventDefault(); e.stopPropagation(); useTemplate(TEMPLATES[Number(b.dataset.template)]); }
    else if (b.hasAttribute('data-backlog-who')) { const ul = $('[data-backlog-list]')!; ul.hidden = !ul.hidden; b.textContent = ul.hidden ? 'SEE WHO' : 'HIDE'; }
    else if (b.hasAttribute('data-backlog-send')) {
      if (!confirm(`Text the welcome to ${howMany(backlogPeople.length)} who turned texts on before texts were connected? This can't be unsent.`)) return;
      (b as HTMLButtonElement).disabled = true; const res = await fn('welcome-backlog');
      fb(res.ok ? `Welcome sent to ${howMany(res.body.sent)}.${res.body.failed ? ` ${res.body.failed} failed: ${res.body.error}` : ''}` : res.body.error ?? 'It didn’t send.', res.ok && !res.body.failed); await backlog();
    }
    else if (b.dataset.edit) { const m = messages.find((x) => x.id === Number(b.dataset.edit)); if (m) loadIntoComposer(m); }
    else if (b.dataset.cancel) { const r = await supabase().from('messages').update({ state: 'draft', scheduled_for: null }).eq('id', Number(b.dataset.cancel)); if (r.error) { fb(r.error.message, false); return; } fb('Cancelled. It is back in drafts.'); await load(); }
    else if (b.dataset.del) { if (confirm('Delete this draft?')) { const r = await supabase().from('messages').delete().eq('id', Number(b.dataset.del)); if (r.error) { fb(r.error.message, false); return; } if (editing === Number(b.dataset.del)) editing = null; await load(); } }
    else if (b.dataset.recipientsFor) { const ul = b.closest('li')!.querySelector<HTMLElement>('.portal-recipients')!; ul.hidden = !ul.hidden; b.textContent = ul.hidden ? (b.closest('li')!.dataset.state === 'sent' ? 'RECIPIENTS & STATUS' : 'REVIEW RECIPIENTS') : 'HIDE'; }
    else if (b.closest('[data-msg-tabs]')) setTimeout(renderMessages, 0);
    else if (b.closest('[data-cohorts]') && b.classList.contains('portal-chip')) { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); summary(); }   // filled in after load, so not bound by the shared script
  }, { capture: true });
}
init();
document.addEventListener('astro:page-load', init);
