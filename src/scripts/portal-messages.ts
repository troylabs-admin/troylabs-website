/**
 * Admin › Messages: SMS composer, group filters or explicit people, live eligible counts, drafts and self-tests.
 * SEND NOW and SCHEDULE, EDIT / CANCEL / DELETE, and for sent messages exactly who it went to. Sending is the
 * `send-message` edge function (Resend email, Twilio texts; it holds the keys and decides recipients itself).
 * Scheduled messages are sent by the database's five-minute job.
 */
import { me } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { avatarUrl, cohortOf, initialsOf, type ProfileRow } from '../lib/portal/data';
import { prettyPhone } from '../lib/portal/phone';
import { currentTerm } from '../lib/portal/options';
import { cleanRecurrence, recurrenceStart, type Recurrence } from '../../supabase/functions/_shared/recurrence';
import { describeRepeat, fillSchedule, formatScheduleDate, localDateTime, readSchedule, wireSchedule } from './portal-message-schedule';
import { SMS_MAX, placeholderLeft, segments, smsBody } from '../../supabase/functions/_shared/sms';
import { cleanAudience, describeAudience, inAudience, inCell, type Audience, type Cell, type EboardSets, type Group } from '../../supabase/functions/_shared/audience';

type Msg = { id: number; title: string; body: string; send_by: string; audience: Audience; event: any; state: string; scheduled_for: string | null; sent_at: string | null; updated_at: string; sent_count: number; failed_count: number; last_error: string | null; recurrence?: Recurrence | null; parent_series_id?: number | null; occurrence_at?: string | null; recurrence_index?: number; recurrence_skipped?: number };
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
let peopleLimit = 6, reviewLimit = 6;
const matchesPerson = (p: ProfileRow, q: string) => !q || `${p.full_name ?? ''} ${p.phone ?? ''} ${prettyPhone(p.phone)}`.toLowerCase().includes(q);
const hasSelection = (a: Audience) => a.mode === 'people' ? Boolean(a.profile_ids?.length) : Boolean(a.cells.length);
function setAudienceMode(mode: 'groups' | 'people') {
  audienceMode = mode; peopleLimit = 6; reviewLimit = 6;
  const search = $<HTMLInputElement>('#mc-review-search'); if (search) search.value = '';
  document.querySelectorAll<HTMLElement>('[data-audience-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.audienceMode === mode)));
  $('[data-groups-panel]')!.hidden = mode !== 'groups'; $('[data-people-panel]')!.hidden = mode !== 'people';
  renderPeople(); summary();
}
function matchingPeople() {
  const q = ($<HTMLInputElement>('#mc-person-search')?.value ?? '').trim().toLowerCase();
  return people.filter(p => p.approved && matchesPerson(p, q)).sort((a,b) => (a.full_name || '').localeCompare(b.full_name || ''));
}
/** their profile photo (or initials) beside the name, so the right person is easy to pick (Bryan, 2026-10-08) */
const personPhoto = (p: ProfileRow) => { const url = p.avatar_path ? avatarUrl(p) : null; return `<span class="portal-avatar t-fine msg-person-photo" aria-hidden="true">${url ? `<img src="${esc(url)}" alt="" loading="lazy">` : esc(initialsOf(p.full_name || '?'))}</span>`; };
function renderPeople() {
  const list = $('[data-people-list]'); if (!list) return;
  const rows = matchingPeople(); $('[data-people-count]')!.textContent = `${howMany(rows.length, 'member')} · ${selectedPeople.size} selected`;
  const shown = rows.slice(0, peopleLimit);
  const visible = $('[data-people-visible]'); if (visible) visible.textContent = `Showing ${shown.length} of ${rows.length} matching members`;
  const more = $('[data-action="more-people"]'); if (more) { more.hidden = shown.length >= rows.length; more.textContent = `SEE MORE (${Math.min(6, rows.length - shown.length)})`; }
  list.innerHTML = shown.map(p => `<label class="msg-person"><input type="checkbox" data-person-id="${esc(p.id)}" ${selectedPeople.has(p.id) ? 'checked' : ''}>${personPhoto(p)}<span><span class="text-ink">${esc(p.full_name || '(no name)')}</span><span class="t-fine text-muted">${p.phone ? esc(prettyPhone(p.phone)) : 'No phone number'}${p.phone && !p.phone_opt_in ? ' · Texts off' : ''}</span></span></label>`).join('') || '<p class="t-fine text-muted">No matching members.</p>';
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
  const desc = $('[data-aud-description]'); if (desc) desc.textContent = hasSelection(a.aud) ? `${describeAudience(a.aud)}. ${base.length - a.texts.length ? `${base.length - a.texts.length} excluded or sharing a phone number; reasons below.` : 'Each phone receives one text.'}` : 'Choose a group or select people to review their phone numbers before sending.';
  const sendSummary = $('[data-send-summary]'); if (sendSummary) sendSummary.textContent = hasSelection(a.aud) ? `${howMany(a.texts.length, 'text')} to ${describeAudience(a.aud)}. Review the recipient list above before sending.` : 'Choose recipients above.';
  renderWho(a);
}
/** the people the ticked boxes add up to, by name, with how each is reached; and who in the group won't get it, and why */
function renderWho(a: ReturnType<typeof audience>) {
  const box = $('[data-who-list]'), list = $('[data-who-items]'), head = $('[data-who-head]'); if (!box || !list || !head) return;
  box.hidden = !hasSelection(a.aud); if (box.hidden) return;
  const q = ($<HTMLInputElement>('#mc-review-search')?.value ?? '').trim().toLowerCase();
  const byName = (x: ProfileRow, y: ProfileRow) => (x.full_name || '').localeCompare(y.full_name || '');
  const rows = [...a.who].filter(p => matchesPerson(p,q)).sort(byName), shown = rows.slice(0, reviewLimit);
  head.textContent = `Review recipients (${a.who.length})`;
  list.innerHTML = shown.map(p => `<li class="msg-recipient-card">${personPhoto(p)}<span class="msg-recipient-identity"><span class="text-ink">${esc(p.full_name || '(no name yet)')}</span><span class="t-fine text-muted">${esc(prettyPhone(p.phone))}</span></span><span class="msg-recipient-check" aria-label="Included">✓</span></li>`).join('') || '<li class="text-muted">No selected recipients match your search.</li>';
  const visible = $('[data-review-visible]'); if (visible) visible.textContent = `Showing ${shown.length} of ${rows.length} matching recipients`;
  const more = $('[data-action="more-recipients"]'); if (more) { more.hidden = shown.length >= rows.length; more.textContent = `SEE MORE (${Math.min(6, rows.length - shown.length)})`; }
  const missed = people.filter(p => p.approved && inAudience(p,a.aud,eb) && !a.who.includes(p)).sort(byName);
  const why = (p: ProfileRow) => !p.phone ? 'No phone number' : !p.phone_opt_in ? 'Opted out of SMS' : 'Shares a phone number; one text per number';
  const excluded = $('[data-who-excluded]'); if (excluded) excluded.innerHTML = missed.length ? `<details class="msg-exclusions portal-fold"><summary class="t-fine text-muted">Not receiving a separate text (${missed.length})</summary><ul class="portal-row-list">${missed.map(p => `<li class="msg-recipient-card">${personPhoto(p)}<span class="msg-recipient-identity"><span>${esc(p.full_name || '(no name yet)')}</span><span class="t-fine text-muted">${why(p)}</span></span></li>`).join('')}</ul></details>` : '';
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
/** tapping the picked template again unpicks it (Bryan, 2026-10-08: a template is a starting point, not a required choice
 *  like the recipients). The text it filled in goes too, unless they've already started editing it. */
function dropTemplate(t: Template) {
  document.querySelectorAll<HTMLElement>('[data-template]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  const body = $('#mc-body') as HTMLTextAreaElement, evName = $('#mc-ev-name') as HTMLInputElement, evWhere = $('#mc-ev-where') as HTMLInputElement;
  const untouched = body.value === t.body && (!t.event || (evName.value === '[Event name]' && evWhere.value === '[Location]' && !($('#mc-ev-when') as HTMLInputElement).value && !($('#mc-ev-rsvp') as HTMLInputElement).value));
  if (untouched) { body.value = ''; if (t.event) { evName.value = ''; evWhere.value = ''; } }
  smsCount(); summary(); fb(untouched ? 'Template removed.' : 'Template unpicked. Your edits are still in the text.');
}
/** a [placeholder] left from a template: nothing sends (or schedules) until it's filled in */
const leftover = () => { const c = compose(); return placeholderLeft(c.title, c.body, c.event?.name, c.event?.where, c.event?.rsvp); };
const recordLimits = new Map<number, number>();
const recordQueries = new Map<number, string>();
function recordRecipientRows(m: Msg) {
  const actual = rcpts.filter(r => r.message_id === m.id);
  if (m.state === 'sent' || m.state === 'sending') return actual.map(r => {
    const p = people.find(p => p.id === r.profile_id);
    return { p, name: p?.full_name || '(no name)', contact: r.channel === 'text' ? prettyPhone(r.phone) : r.email || '', status: r.error ? `Failed: ${r.error}` : r.status === 'delivered' ? 'Delivered' : r.status || (r.delivered_at ? 'Sent' : 'Pending') };
  });
  return reach(cleanAudience(m.audience), m.send_by).who.map(p => ({ p, name: p.full_name || '(no name)', contact: m.send_by === 'email' ? emailOf(p) : prettyPhone(p.phone), status: '' }));
}
function renderRecordRecipients(m: Msg) {
  const root = document.querySelector<HTMLElement>(`[data-record-recipients="${m.id}"]`); if (!root) return;
  const all = recordRecipientRows(m), query = (recordQueries.get(m.id) || '').toLowerCase();
  const matches = all.filter(r => `${r.name} ${r.contact} ${r.p?.phone || ''} ${r.contact.replace(/\D/g, '')} ${r.status}`.toLowerCase().includes(query));
  const limit = recordLimits.get(m.id) || 6;
  const list = root.querySelector<HTMLElement>('[data-record-recipient-list]')!;
  list.innerHTML = matches.slice(0, limit).map(r => `<li class="msg-person msg-recipient-card">${m.state !== 'sent' && m.state !== 'sending' ? '<span class="msg-recipient-check" aria-hidden="true">✓</span>' : ''}${r.p ? personPhoto(r.p) : '<span class="portal-avatar msg-person-photo" aria-hidden="true">?</span>'}<span class="msg-recipient-identity"><span class="text-ink">${esc(r.name)}</span><span class="t-fine text-muted">${esc(r.contact)}${r.status ? ` · ${esc(r.status)}` : ''}</span></span></li>`).join('') || '<li class="t-fine text-muted">No matching recipients.</li>';
  const more = root.querySelector<HTMLButtonElement>('[data-record-more]')!;
  more.hidden = matches.length <= limit;
  more.textContent = `See more (${Math.max(0, matches.length - limit)} remaining)`;
  root.querySelector<HTMLElement>('[data-record-recipient-count]')!.textContent = `Showing ${Math.min(limit, matches.length)} of ${matches.length}${query ? ` matching · ${all.length} total` : ' recipients'}`;
}
function renderMessages() {
  const date = (iso: string) => formatScheduleDate(iso);
  const eventDetails = (m: Msg) => m.event ? `<div class="msg-record-event"><span class="t-label text-ink">${esc(m.event.name || 'Event')}</span>${m.event.when ? `<span class="t-fine text-muted">${esc(Number.isFinite(Date.parse(m.event.when)) ? date(m.event.when) : m.event.when)}</span>` : ''}${m.event.where ? `<span class="t-fine text-muted">${esc(m.event.where)}</span>` : ''}${m.event.rsvp ? `<span class="t-fine text-muted">RSVP: ${esc(m.event.rsvp)}</span>` : ''}</div>` : '';
  const card = (m: Msg) => {
    const rule = m.recurrence ? cleanRecurrence(m.recurrence) : null;
    const sentTo = rcpts.filter(r => r.message_id === m.id);
    const accepted = sentTo.filter(r => r.delivered_at && !['failed', 'undelivered'].includes(r.status || '')).length;
    const delivered = sentTo.filter(r => r.status === 'delivered').length;
    const failed = sentTo.filter(r => r.error || ['failed', 'undelivered'].includes(r.status || '')).length;
    const rows = recordRecipientRows(m);
    const when = m.state === 'draft' && m.parent_series_id && m.occurrence_at ? `Occurrence ${date(m.occurrence_at)}` : m.state === 'sent' && m.sent_at ? `Sent ${date(m.sent_at)}` : m.state === 'scheduled' && m.scheduled_for ? `Next send ${formatScheduleDate(m.scheduled_for, rule?.timezone)}` : m.state === 'sending' ? 'Sending in progress' : `Saved ${date(m.updated_at)}`;
    const stats = m.state === 'sent' ? `${accepted} sent · ${delivered} confirmed delivered${failed ? ` · ${failed} failed` : ''}` : `${rows.length} text recipients`;
    return `<li class="msg-record" data-state="${m.state}" data-id="${m.id}">
      <div class="msg-record-header"><span class="t-fine portal-tag">${m.parent_series_id ? `${m.state === 'draft' ? 'FAILED' : m.state.toUpperCase()} OCCURRENCE` : m.state === 'scheduled' && rule ? 'REPEATING' : m.state.toUpperCase()}</span><span class="t-label text-muted">${esc(when)}</span></div>
      ${rule ? `<p class="msg-record-schedule t-caption text-ink">${esc(describeRepeat(rule))}</p><p class="t-fine text-muted">${m.recurrence_index || 0} scheduled dates have passed${m.recurrence_skipped ? ` · ${m.recurrence_skipped} missed during downtime` : ''}. ${m.recurrence_index ? 'Editing replaces this repeating schedule with a new one.' : ''}</p>` : ''}
      <p class="msg-record-body text-ink">${esc(m.send_by === 'text' ? smsBody(m.body, m.event) : m.body)}</p>
      ${eventDetails(m)}
      <p class="msg-record-audience t-fine text-muted">${esc(describeAudience(cleanAudience(m.audience)))} · ${esc(stats)}${m.send_by !== 'text' ? ' · Older email record' : ''}</p>
      <div class="msg-record-actions">${['draft', 'scheduled'].includes(m.state) && m.send_by === 'text' ? `<button type="button" class="t-label portal-linklike" data-edit="${m.id}">${m.parent_series_id && m.state === 'draft' ? 'EDIT / RETRY' : `EDIT ${m.state === 'draft' ? 'DRAFT' : 'SCHEDULE'}`}</button>` : ''}${m.state === 'scheduled' || (m.state === 'draft' && rule && m.recurrence_index) ? `<button type="button" class="t-label portal-linklike" data-cancel="${m.id}">${rule ? 'STOP REPEATING' : 'CANCEL SCHEDULE'}</button>` : ''}<button type="button" class="t-label portal-linklike" data-recipients-for="${m.id}">${m.state === 'sent' ? 'RECIPIENTS & STATUS' : 'REVIEW RECIPIENTS'}</button>${m.state === 'draft' && !m.recurrence_index && !m.parent_series_id ? `<button type="button" class="t-label portal-linklike" data-del="${m.id}">DELETE DRAFT</button>` : ''}</div>
      ${m.last_error ? `<p class="t-fine portal-msg-error">${esc(m.last_error)}</p>` : ''}
      <div class="portal-recipients msg-record-recipients" data-record-recipients="${m.id}" hidden><label class="t-fine text-muted" for="record-recipient-search-${m.id}">Find a recipient</label><input class="portal-input t-caption is-wide" id="record-recipient-search-${m.id}" type="search" data-record-search="${m.id}" placeholder="Search by name or phone" value="${esc(recordQueries.get(m.id) || '')}"><p class="t-fine text-muted" data-record-recipient-count></p><ul class="msg-person-list" data-record-recipient-list></ul><button type="button" class="t-label portal-linklike" data-record-more="${m.id}">SEE MORE</button></div>
    </li>`;
  };
  const collections = [
    { selector: '[data-draft-list]', rows: messages.filter(m => m.state === 'draft'), empty: 'No saved drafts. Save a message here when you want to finish it later.' },
    { selector: '[data-scheduled-list]', rows: messages.filter(m => ['scheduled', 'sending'].includes(m.state)), empty: 'No scheduled messages. Choose Schedule to set a one-time or repeating send.' },
    { selector: '[data-msg-list]', rows: messages.filter(m => m.state === 'sent' && (!m.recurrence || m.parent_series_id)), empty: 'No sent messages yet. Delivered messages and recipient status will appear here.' },
  ];
  for (const group of collections) {
    const list = $(group.selector); if (!list) continue;
    list.innerHTML = group.rows.map(card).join('') || `<li class="msg-empty t-caption text-muted" data-msg-empty>${group.empty}</li>`;
    const counter = document.querySelector<HTMLElement>(`${group.selector.replace('-list]', '-count]')}`); if (counter) counter.textContent = String(group.rows.length);
    group.rows.forEach(renderRecordRecipients);
  }
}
/** texts have no subject (Bryan, 2026-10-08): a TEXT-only message is named in the history by the start of its body */
const nameFromBody = (body: string) => { const b = body.replace(/\s+/g, ' ').trim(); if (b.length <= 60) return b; const cut = b.slice(0, 60); return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 60)}…`; };
const subjectOf = () => nameFromBody(($('#mc-body') as HTMLTextAreaElement).value);
const needsFirst = () => ($('#mc-body') as HTMLTextAreaElement).value.trim() ? null : 'Write the message first.';

const compose = () => ({ title: subjectOf(), body: ($('#mc-body') as HTMLTextAreaElement).value.trim(), event: ($('#mc-ev-name') as HTMLInputElement).value.trim() ? { name: ($('#mc-ev-name') as HTMLInputElement).value.trim(), when: ($('#mc-ev-when') as HTMLInputElement).value ? new Date(($('#mc-ev-when') as HTMLInputElement).value).toISOString() : null, where: ($('#mc-ev-where') as HTMLInputElement).value.trim() || null, rsvp: ($('#mc-ev-rsvp') as HTMLInputElement).value.trim() || null } : null });
function setWhen(iso: string | null, recurrence: Recurrence | null = null) {
  fillSchedule(iso, recurrence);
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
  ($('#mc-ev-name') as HTMLInputElement).value = m.event?.name ?? ''; ($('#mc-ev-when') as HTMLInputElement).value = m.event?.when ? localDateTime(m.event.when, Intl.DateTimeFormat().resolvedOptions().timeZone) : ''; ($('#mc-ev-where') as HTMLInputElement).value = m.event?.where ?? ''; ($('#mc-ev-rsvp') as HTMLInputElement).value = m.event?.rsvp ?? '';

  setPicked(cleanAudience(m.audience));
  setWhen(m.scheduled_for || (m.recurrence ? recurrenceStart(m.recurrence) : null), m.recurrence || null); composerState();
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
  const later = $('[data-when] .portal-chip[aria-pressed="true"]')?.dataset.value === 'later';
  let plan: { recurrence: Recurrence | null; scheduled_for: string } | null = null;
  if (later && ($('#mc-when') as HTMLInputElement).value) { try { plan = readSchedule(); } catch (error) { return { error: error instanceof Error ? error.message : 'Check your repeat schedule.' }; } }
  if (state === 'scheduled' && !plan) return { error: 'Choose the first send date and time.' };
  if (state === 'scheduled' && plan && Date.parse(plan.scheduled_for) <= Date.now()) return { error: 'That time has already passed. Pick a first send in the future.' };
  if (state === 'scheduled' && plan) { const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(new Date(plan.scheduled_for))); if (h < 8 || h >= 21) return { error: 'Texts only go out between 8 AM and 9 PM Pacific. Pick a first send in that window.' }; }
  if (c.event?.rsvp) { try { const url = new URL(c.event.rsvp); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { return { error: 'Use a complete RSVP link starting with https:// or http://.' }; } }
  const row = { ...c, send_by: a.sendBy, audience: a.aud, channel_id: null, filters: {}, state, scheduled_for: state === 'scheduled' ? plan!.scheduled_for : null, recurrence: plan?.recurrence || null, last_error: null };
  const sb = supabase();
  const saved = messages.find(m => m.id === editing);
  if (saved?.parent_series_id && row.recurrence) return { error: 'This is one occurrence of a repeating message. Choose Does not repeat to retry it, or New draft to create a new repeating schedule.' };
  const started = Boolean(saved?.recurrence && saved.recurrence_index);
  const res = started ? await sb.rpc('replace_message_series', { p_series_id: editing, p_expected_updated_at: saved!.updated_at, p_message: row }) : editing ? await sb.from('messages').update(row).eq('id', editing).in('state', ['draft', 'scheduled']).eq('updated_at', saved!.updated_at).select().single() : await sb.from('messages').insert(row).select().single();
  if (res.error) return { error: editing && res.error.code === 'PGRST116' ? 'This message is no longer editable. Reload to see its current status, or press NEW DRAFT.' : res.error.message };
  if (form?.isConnected) { editing = (Array.isArray(res.data) ? res.data[0] : res.data).id; composerState(); } return { id: (Array.isArray(res.data) ? res.data[0] : res.data).id, who: a.who.length };
}
const busy = async (btn: HTMLElement, work: () => Promise<void>) => {
  if (actionBusy || !dataReady) return;
  const generation = pageGeneration;
  actionBusy = true; btn.setAttribute('aria-busy', 'true');
  const buttons = [...document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('.portal-messaging button, .portal-messaging input, .portal-messaging textarea, .portal-messaging select')];
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
    const plan = state === 'scheduled' ? readSchedule() : null;
    fb(state === 'draft' ? 'Draft saved. Open Saved drafts above the composer to finish or send it.' : `Scheduled: ${describeRepeat(plan!.recurrence)}. First send ${formatScheduleDate(plan!.scheduled_for, plan!.recurrence?.timezone)} to ${howMany(r.who)}. See Scheduled messages below.`);
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
    sb.from('profiles').select('id, full_name, approved, is_test, status, divisions, join_term, join_year, industries, personal_email, usc_email, phone, phone_opt_in, email_opt_in, avatar_path, updated_at'),
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
  renderCohorts(); renderPeople(); renderGrid(); renderMessages(); smsCount(); textsOff();
  return true;
}
/** members who turned texts on before texts were connected never got the welcome: list them, and send it once */
/** approved members who won't get texts: they turned them off (on their profile or by replying STOP) or have no number
 *  (Bryan, 2026-10-08: in place of the one-time welcome send). Read-only; the people list is already this admin's world. */
function textsOff() {
  const row = $('[data-texts-off]'); if (!row) return;
  const off = people.filter((p) => p.approved && (!p.phone || !p.phone_opt_in)).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  row.hidden = !off.length;
  const noNumber = off.filter((p) => !p.phone).length, turnedOff = off.length - noNumber;
  $('[data-texts-off-note]')!.textContent = `${howMany(off.length)} won’t get texts: ${[turnedOff && `${turnedOff.toLocaleString()} turned them off`, noNumber && `${noNumber.toLocaleString()} ${noNumber === 1 ? 'has' : 'have'} no phone number`].filter(Boolean).join(', ')}.`;
  $('[data-texts-off-list]')!.innerHTML = off.map((p) => `<li><span class="text-ink">${esc(p.full_name || '(no name yet)')}</span><span class="text-muted">${p.phone ? `${esc(prettyPhone(p.phone))} · texts off` : 'no phone number'}</span></li>`).join('');
}
async function init() {
  const list = $('[data-msg-list]'); if (!list || list.dataset.wired) return; list.dataset.wired = '1';
  pageGeneration++;
  document.querySelectorAll<HTMLElement>('[data-action]').forEach((b) => { b.dataset.wired = '1'; });
  // Keep optional details available without burying the sending controls.
  document.querySelectorAll<HTMLDetailsElement>('details[data-fold]').forEach((d) => { d.open = false; });
  audienceMode = 'groups'; selectedPeople.clear(); recordLimits.clear(); recordQueries.clear();
  editing = null; delivery = null; deliveryUnknown = false; dataReady = false; actionBusy = false; nudged = false;
  // the action buttons wake up once the page has its data (a click during loading used to do nothing)
  const actions = [...document.querySelectorAll<HTMLButtonElement>('[data-action="preview"], [data-action="draft"], [data-action="test-send"], [data-action="send"]')];
  actions.forEach((b) => { b.disabled = true; });
  const who = await me(); if (!who?.admin || !list.isConnected) return; viewer = { id: who.id, email: who.email }; await load(); if (!list.isConnected) return;
  wireSchedule();
  document.querySelector('.msg-compose')?.addEventListener('submit', e => e.preventDefault());
  setDataActions(dataReady);
  void fn('status').then((res) => { if (!list.isConnected) return; deliveryUnknown = !res.ok; delivery = res.ok ? res.body : null; showDelivery(); showTestTarget(); });
  const tpl = $('[data-templates]'); if (tpl) tpl.innerHTML = TEMPLATES.map((t, i) => `<button type="button" class="t-fine portal-chip" aria-pressed="false" data-template="${i}">${esc(t.label)}</button>`).join('');
  document.querySelector('.portal-panels form')?.addEventListener('input', () => { smsCount(); const note = $('#msg-fb'); if (note?.textContent?.startsWith('Loaded the ')) note.textContent = ''; });
  $('#mc-person-search')?.addEventListener('input', () => { peopleLimit = 6; renderPeople(); });
  $('#mc-review-search')?.addEventListener('input', () => { reviewLimit = 6; renderWho(audience()); });
  document.querySelector('.portal-messaging')?.addEventListener('input', e => { const el = e.target as HTMLInputElement; if (!el.dataset.recordSearch) return; const id = Number(el.dataset.recordSearch), m = messages.find(x => x.id === id); recordQueries.set(id, el.value); recordLimits.set(id, 6); if (m) renderRecordRecipients(m); });
  $('[data-people-list]')?.addEventListener('change', e => { const input = e.target as HTMLInputElement; const id = input.dataset.personId; if (!id || actionBusy) return; input.checked ? selectedPeople.add(id) : selectedPeople.delete(id); $('[data-people-count]')!.textContent = `${howMany(matchingPeople().length, 'member')} · ${selectedPeople.size} selected`; summary(); });
  document.querySelector('.portal-section')!.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!b) return;
    if (b.dataset.action === 'more-people') { peopleLimit += 6; renderPeople(); return; }
    if (b.dataset.action === 'more-recipients') { reviewLimit += 6; renderWho(audience()); return; }
    if (b.dataset.audienceMode) { setAudienceMode(b.dataset.audienceMode as 'groups' | 'people'); return; }
    if (b.dataset.action === 'clear-audience') { setPicked({cells:[], ...(audienceMode === 'people' ? {mode:'people' as const,profile_ids:[]} : {})}); return; }
    if (b.dataset.action === 'select-people') { matchingPeople().forEach(p => selectedPeople.add(p.id)); renderPeople(); summary(); return; }
    if (b.closest('[data-aud-grid], [data-aud-industries]')) setTimeout(summary, 0);   // the shared script flips these chips; read them after
    if (b.dataset.action === 'new-draft') { resetComposer(); fb('New draft.'); $('#mc-body')?.focus(); }
    else if (b.dataset.action === 'draft') { e.preventDefault(); await save('draft', b); }
    else if (b.dataset.action === 'send') { e.preventDefault(); await sendNow(b); }
    else if (b.dataset.action === 'test-send') { e.preventDefault(); await testSend(b); }
    else if (b.dataset.template) { e.preventDefault(); e.stopPropagation(); const t = TEMPLATES[Number(b.dataset.template)]; if (b.getAttribute('aria-pressed') === 'true') dropTemplate(t); else useTemplate(t); }
    else if (b.hasAttribute('data-texts-off-who')) { const ul = $('[data-texts-off-list]')!; ul.hidden = !ul.hidden; b.textContent = ul.hidden ? 'SEE WHO' : 'HIDE'; }
    else if (b.dataset.edit) { const m = messages.find((x) => x.id === Number(b.dataset.edit)); if (m) loadIntoComposer(m); }
    else if (b.dataset.cancel) { await busy(b, async () => { const m = messages.find(x => x.id === Number(b.dataset.cancel)); if (!m) return; const repeating = Boolean(m.recurrence); const patch = repeating ? { state: 'cancelled' } : { state: 'draft', scheduled_for: null }; const r = await supabase().from('messages').update(patch).eq('id', m.id).eq('state', m.state).eq('updated_at', m.updated_at).select().single(); if (r.error) { fb('This schedule changed. Reload and check its current state before cancelling.', false); return; } if (editing === m.id) resetComposer(); fb(repeating ? 'Repeating schedule stopped. Previously sent messages remain in Sent history.' : 'Schedule cancelled. The message is now in Saved drafts.'); await load(); }); }
    else if (b.dataset.del) { if (confirm('Delete this draft?')) { const r = await supabase().from('messages').delete().eq('id', Number(b.dataset.del)); if (r.error) { fb(r.error.message, false); return; } if (editing === Number(b.dataset.del)) editing = null; await load(); } }
    else if (b.dataset.recordMore) { const id = Number(b.dataset.recordMore), m = messages.find(x => x.id === id); recordLimits.set(id, (recordLimits.get(id) || 6) + 6); if (m) renderRecordRecipients(m); }
    else if (b.dataset.recipientsFor) { const ul = b.closest('li')!.querySelector<HTMLElement>('.portal-recipients')!; ul.hidden = !ul.hidden; b.textContent = ul.hidden ? (b.closest('li')!.dataset.state === 'sent' ? 'RECIPIENTS & STATUS' : 'REVIEW RECIPIENTS') : 'HIDE'; }

    else if (b.closest('[data-cohorts]') && b.classList.contains('portal-chip')) { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); summary(); }   // filled in after load, so not bound by the shared script
  }, { capture: true });
}
init();
document.addEventListener('astro:page-load', init);
