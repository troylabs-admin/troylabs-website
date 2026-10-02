/**
 * Admin › Messages: channels with live member counts, PREVIEW RECIPIENTS, SAVE DRAFT, SEND A TEST TO ME,
 * SEND NOW and SCHEDULE, EDIT / CANCEL / DELETE, and for sent messages exactly who it went to. Sending is the
 * `send-message` edge function (Resend email, Twilio texts; it holds the keys and decides recipients itself).
 * Scheduled messages are sent by the database's five-minute job.
 */
import { me } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { cohortOf, type ProfileRow } from '../lib/portal/data';
import { prettyPhone } from '../lib/portal/phone';
import { SMS_MAX, segments, smsBody } from '../../supabase/functions/_shared/sms';

type Channel = { id: number; name: string; rule: Record<string, string>; system: boolean };
type Msg = { id: number; title: string; body: string; send_by: string; channel_id: number | null; filters: Record<string, string[]>; event: any; state: string; scheduled_for: string | null; sent_at: string | null; updated_at: string; sent_count: number; failed_count: number; last_error: string | null };
type Rcpt = { message_id: number; profile_id: string; channel: 'email' | 'text'; email: string | null; phone: string | null; delivered_at: string | null; status: string | null; error: string | null };
type Delivery = { email: { configured: boolean; testMode: boolean; testTo: string | null; from?: string }; text: { configured: boolean; from: string | null; trial: boolean; error: string | null; testTo: string | null; hoursOpen: boolean } };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const fb = (text: string, ok = true) => { const el = $('#msg-fb'); if (el) { el.textContent = text; el.style.color = ok ? '' : 'var(--color-orange)'; } };
let people: ProfileRow[] = [], channels: Channel[] = [], messages: Msg[] = [], rcpts: Rcpt[] = [], editing: number | null = null;
let delivery: Delivery | null = null;

/** call the send-message function as the signed-in admin */
async function fn(mode: string, messageId?: number): Promise<{ ok: boolean; status: number; body: any }> {
  const { data: { session } } = await supabase().auth.getSession();
  const url = ((import.meta.env.PUBLIC_SUPABASE_URL as string | undefined) || 'https://ackmhqxyxnceoarbhcrp.supabase.co') + '/functions/v1/send-message';
  try {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, messageId }) });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
  } catch { return { ok: false, status: 0, body: { error: 'Couldn’t reach the sending service. Check your connection.' } }; }
}
function showDelivery() {
  const el = $('#msg-delivery'); if (!el || !delivery) return; const { email: e, text: t } = delivery;
  el.classList.toggle('is-warn', !e.configured || e.testMode || !t.configured || t.trial);
  const mail = !e.configured ? 'Email isn’t connected yet: the Resend key hasn’t been added.'
    : e.testMode ? `Email is in test mode: until usctroylabs.com is verified in Resend, it can only go to you (${e.testTo}).`
    : `Email is connected: from ${e.from ?? 'TroyLabs'}, replies go to troylabs@usc.edu.`;
  const text = t.error ? `Texts aren’t working: ${t.error}.`
    : !t.configured ? 'Texts aren’t connected yet: the Twilio keys haven’t been added.'
    : t.trial ? 'Texts are on a Twilio trial: Twilio only sends its own sample templates, so these messages can’t go out until the Twilio account is upgraded.'
    : `Texts are connected: from ${prettyPhone(t.from)}. Group texts go out 8 AM–9 PM Pacific.`;
  el.textContent = `${mail} ${text} Drafts and scheduling always save.`;
}

const matches = (p: ProfileRow, rule: Record<string, string | string[]>) => Object.entries(rule).every(([k, v]) => {
  const vals = ([] as string[]).concat(v as any).map((x) => x.toUpperCase());
  if (k === 'status') return vals.some((x) => x.startsWith(p.status.toUpperCase().slice(0, 3)));   // STUDENT(S) / ALUM(NI)
  if (k === 'cohort') return vals.includes(cohortOf(p.join_term, p.join_year));
  if (k === 'division' || k === 'divisions') return (p.divisions ?? []).some((d) => vals.includes(d.toUpperCase()) || vals.includes(d.toUpperCase().replace(' MANAGEMENT', '')));
  if (k === 'industry' || k === 'industries') return (p.industries ?? []).some((d) => vals.includes(d.toUpperCase()));
  if (k === 'city') return (p.city?.name ?? '').toUpperCase() === vals[0];
  return true;
});
const audience = () => {
  const ch = $('[data-channels] .portal-chip[aria-pressed="true"]')?.dataset.value; const channel = channels.find((c) => c.name === ch) ?? null;
  const filters: Record<string, string[]> = {};
  for (const block of document.querySelectorAll<HTMLElement>('[data-audience] [data-aud]')) { const on = [...block.querySelectorAll<HTMLElement>('.portal-chip[aria-pressed="true"]')].map((c) => c.textContent!.replace(/^✓\s*/, '').trim()); if (on.length) filters[block.dataset.aud!] = on; }
  const rule = channel ? channel.rule : filters;
  const sendBy = $('[data-single]:not([data-when]) .portal-chip[aria-pressed="true"]')?.dataset.value ?? 'email';
  const { emails, texts, who } = reach(rule, sendBy);
  return { channel, filters, rule, sendBy, who, emails, texts };
};
const byEmail = (p: ProfileRow) => Boolean((p.personal_email || p.usc_email) && p.email_opt_in !== false);
const byText = (p: ProfileRow) => Boolean(p.phone && p.phone_opt_in);
/** who a rule reaches by each channel (the same rules as the send-message function) */
function reach(rule: Record<string, string | string[]>, sendBy: string) {
  const base = people.filter((p) => p.approved && matches(p, rule));
  const emails = sendBy === 'text' ? [] : base.filter(byEmail), texts = sendBy === 'email' ? [] : base.filter(byText);
  const who = base.filter((p) => emails.includes(p) || texts.includes(p));
  return { emails, texts, who };
}
const howMany = (n: number, what = 'person') => `${n} ${n === 1 ? what : what === 'person' ? 'people' : `${what}s`}`;
const reachText = (a: { sendBy: string; emails: unknown[]; texts: unknown[] }) => a.sendBy === 'email' ? `by email to ${howMany(a.emails.length)}` : a.sendBy === 'text' ? `by text to ${howMany(a.texts.length)}` : `by email to ${howMany(a.emails.length)} and by text to ${howMany(a.texts.length)}`;
/** the live text counter under the body: what the text will look like in length and cost */
function smsCount() {
  const out = $('#mc-sms'); if (!out) return;
  const sendBy = $('[data-single]:not([data-when]) .portal-chip[aria-pressed="true"]')?.dataset.value ?? 'email';
  const body = ($('#mc-body') as HTMLTextAreaElement).value;
  out.hidden = sendBy === 'email' || !body.trim(); if (out.hidden) return;
  const c = compose(); const sms = smsBody(c.body, c.event); const size = segments(sms);
  out.style.color = sms.length > SMS_MAX ? 'var(--color-orange)' : '';
  out.textContent = sms.length > SMS_MAX ? `Too long for a text: ${sms.length} of ${SMS_MAX} characters.`
    : `As a text: ${size.chars} characters with “TroyLabs:” and the STOP line, ${size.segments === 1 ? 'one text' : `${size.segments} texts joined into one`} per person${size.unicode ? ' (an emoji or special character makes texts shorter)' : ''}.`;
}

function renderChannels() {
  const chips = $('[data-channels]')!; chips.innerHTML = channels.map((c) => `<button type="button" class="t-fine portal-chip" aria-pressed="false" data-value="${esc(c.name)}" title="${esc(Object.entries(c.rule).map(([k, v]) => `${k} = ${v}`).join(', ') || 'every member')}">${esc(c.name)} · ${people.filter((p) => p.approved && matches(p, c.rule)).length}</button>`).join('');
  const list = $('[data-channel-list]')!; const auto = list.querySelector('li:last-child')!.outerHTML;
  list.innerHTML = channels.map((c) => `<li><span><span class="text-ink">${esc(c.name)}</span> <span class="text-muted">· ${esc(Object.entries(c.rule).map(([k, v]) => `${k} = ${v}`).join(', ') || 'every member')} · ${people.filter((p) => p.approved && matches(p, c.rule)).length} members</span></span></li>`).join('') + auto;
}
function renderMessages() {
  const list = $('[data-msg-list]')!; const tab = $('[data-msg-tabs] .portal-chip[aria-pressed="true"]')?.dataset.value ?? 'all';
  const rows = messages.filter((m) => m.state !== 'cancelled');
  list.innerHTML = rows.length ? rows.map((m) => { const ch = channels.find((c) => c.id === m.channel_id); const rule = ch ? ch.rule : m.filters; const r0 = reach(rule, m.send_by); const who = r0.who;
    const sentTo = rcpts.filter((r) => r.message_id === m.id); const named = (r: Rcpt) => people.find((p) => p.id === r.profile_id)?.full_name || '(no name)';
    const ok = (c: string) => sentTo.filter((r) => r.channel === c && r.delivered_at && r.status !== 'undelivered' && r.status !== 'failed').length;
    const lost = sentTo.filter((r) => r.error).length;
    const reached = m.state === 'sent' ? [ok('email') && howMany(ok('email'), 'email'), ok('text') && howMany(ok('text'), 'text')].filter(Boolean).join(' + ') + ` sent${lost ? ` · ${lost} failed` : ''}` : `${who.length} will receive`;
    const when = m.state === 'sent' && m.sent_at ? `Sent ${new Date(m.sent_at).toLocaleString()}` : m.state === 'scheduled' && m.scheduled_for ? `Sends ${new Date(m.scheduled_for).toLocaleString()}` : `Edited ${new Date(m.updated_at).toLocaleDateString()}`;
    return `<li data-state="${m.state}" data-id="${m.id}" style="flex-direction:column;align-items:stretch;gap:calc(8 * var(--u))"${tab !== 'all' && tab !== m.state ? ' hidden' : ''}>
      <div class="flex items-center" style="gap:calc(12 * var(--u))"><span class="t-fine portal-tag" style="${m.state === 'sent' ? 'color:var(--color-ink)' : m.state === 'scheduled' || m.state === 'sending' ? 'color:var(--color-orange)' : ''}">${m.state.toUpperCase()}</span><span class="text-ink" style="flex:1">${esc(m.title || '(untitled)')}</span><span class="t-fine text-muted">${when}</span><span class="t-fine text-muted">${m.send_by === 'both' ? 'EMAIL + TEXT' : m.send_by.toUpperCase()}</span></div>
      <p class="m-0 t-fine text-muted" style="max-width:calc(620 * var(--u))">${esc(m.body.slice(0, 140))}${m.body.length > 140 ? '…' : ''}</p>
      <div class="flex items-center" style="gap:calc(16 * var(--u))"><span class="t-fine text-muted">To: ${esc(ch ? ch.name : Object.values(m.filters).flat().join(', ') || 'everyone')} · ${reached}</span><span style="flex:1"></span>
        ${m.state !== 'sent' ? `<button type="button" class="t-label portal-linklike" style="color:var(--color-orange)" data-edit="${m.id}">EDIT</button>` : ''}
        ${m.state === 'scheduled' ? `<button type="button" class="t-label portal-linklike" data-cancel="${m.id}">CANCEL</button>` : ''}
        <button type="button" class="t-label portal-linklike" data-who="${m.id}">${m.state === 'sent' ? 'WHO GOT IT' : 'WHO WILL GET IT'}</button>
        ${m.state === 'draft' ? `<button type="button" class="t-label portal-linklike" data-del="${m.id}">DELETE</button>` : ''}</div>
      ${m.last_error && m.state !== 'sent' ? `<p class="m-0 t-fine portal-msg-error">Not sent: ${esc(m.last_error)}</p>` : m.last_error ? `<p class="m-0 t-fine portal-msg-error">${esc(m.last_error)}</p>` : ''}
      <ul class="portal-row-list t-fine portal-recipients" hidden>${m.state === 'sent'
        ? sentTo.map((r) => `<li><span>${esc(named(r))} · ${r.channel === 'text' ? `text ${esc(prettyPhone(r.phone))}` : esc(r.email ?? '')}</span><span class="${r.error ? 'portal-msg-error' : 'text-muted'}" title="${esc(r.error ?? '')}">${r.error ? `FAILED: ${esc(r.error)}` : r.status === 'delivered' ? 'DELIVERED' : r.delivered_at ? 'SENT' : '—'}</span></li>`).join('') || '<li class="text-muted">No recipients recorded.</li>'
        : who.map((p) => `<li><span>${esc(p.full_name || '(no name)')} · ${[r0.emails.includes(p) && esc(p.personal_email || p.usc_email || ''), r0.texts.includes(p) && `text ${esc(prettyPhone(p.phone))}`].filter(Boolean).join(' · ')}</span></li>`).join('') || `<li class="text-muted">Nobody matches right now${m.send_by !== 'email' ? ' (texts go only to people who opted in)' : ''}.</li>`}</ul>
    </li>`; }).join('') : '<li class="text-muted" data-msg-empty>No messages yet. Write one above and save it as a draft, schedule it, or send it.</li>';
}
const compose = () => ({ title: ($('#mc-title') as HTMLInputElement).value.trim(), body: ($('#mc-body') as HTMLTextAreaElement).value.trim(), event: ($('#mc-ev-name') as HTMLInputElement).value.trim() ? { name: ($('#mc-ev-name') as HTMLInputElement).value.trim(), when: ($('#mc-ev-when') as HTMLInputElement).value || null, where: ($('#mc-ev-where') as HTMLInputElement).value.trim() || null, rsvp: ($('#mc-ev-rsvp') as HTMLInputElement).value.trim() || null } : null });
function loadIntoComposer(m: Msg) {
  editing = m.id; ($('#mc-title') as HTMLInputElement).value = m.title; ($('#mc-body') as HTMLTextAreaElement).value = m.body;
  ($('#mc-ev-name') as HTMLInputElement).value = m.event?.name ?? ''; ($('#mc-ev-when') as HTMLInputElement).value = m.event?.when ?? ''; ($('#mc-ev-where') as HTMLInputElement).value = m.event?.where ?? ''; ($('#mc-ev-rsvp') as HTMLInputElement).value = m.event?.rsvp ?? '';
  document.querySelectorAll<HTMLElement>('[data-single]:not([data-when]) .portal-chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.value === m.send_by)));
  document.querySelectorAll<HTMLElement>('[data-channels] .portal-chip').forEach((c) => c.setAttribute('aria-pressed', String(channels.find((x) => x.id === m.channel_id)?.name === c.dataset.value)));
  for (const block of document.querySelectorAll<HTMLElement>('[data-audience] [data-aud]')) { const on = m.filters[block.dataset.aud!] ?? []; block.querySelectorAll<HTMLElement>('.portal-chip').forEach((c) => c.setAttribute('aria-pressed', String(on.includes(c.textContent!.replace(/^✓\s*/, '').trim())))); }
  if (m.scheduled_for) { ($('#mc-when') as HTMLInputElement).value = m.scheduled_for.slice(0, 16); $('[data-when] .portal-chip[data-value="later"]')?.click(); }
  document.querySelectorAll<HTMLDetailsElement>('details[data-fold]').forEach((d) => { if ((d.querySelector('#mc-ev-name') && m.event) || (d.classList.contains('portal-or') && Object.keys(m.filters ?? {}).length)) d.open = true; });
  document.querySelector('.portal-panels')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); fb(`Editing “${m.title || '(untitled)'}”. Save as a draft, schedule, or send.`); smsCount();
}
/** write the composer to the database (new or the one being edited) and return its id */
async function persist(state: 'draft' | 'scheduled'): Promise<{ id: number; who: number } | { error: string }> {
  const c = compose(); if (!c.body) return { error: 'Write the message first.' };
  const a = audience(); const later = $('[data-when] .portal-chip[aria-pressed="true"]')?.dataset.value === 'later'; const at = ($('#mc-when') as HTMLInputElement).value;
  if (state === 'scheduled' && later && !at) return { error: 'Pick a date and time to schedule it.' };
  if (state === 'scheduled' && at && new Date(at).getTime() < Date.now() - 60_000) return { error: 'That time has already passed. Pick a time in the future, or choose SEND NOW.' };
  if (state === 'scheduled' && later && at && a.sendBy !== 'email') { const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(new Date(at))); if (h < 8 || h >= 21) return { error: 'Texts only go out between 8 AM and 9 PM Pacific. Pick a time in that window, or send it by email.' }; }
  const row = { ...c, send_by: a.sendBy, channel_id: a.channel?.id ?? null, filters: a.channel ? {} : a.filters, state, scheduled_for: state === 'scheduled' ? (later && at ? new Date(at).toISOString() : new Date().toISOString()) : null, last_error: null };
  const sb = supabase(); const res = editing ? await sb.from('messages').update(row).eq('id', editing).in('state', ['draft', 'scheduled']).select().single() : await sb.from('messages').insert(row).select().single();
  if (res.error) return { error: editing ? 'This message was already sent, so it can’t be changed. Press NEW DRAFT to write another.' : res.error.message };
  editing = res.data.id; return { id: res.data.id, who: a.who.length };
}
const busy = async (btn: HTMLElement, work: () => Promise<void>) => { if (btn.getAttribute('aria-busy') === 'true') return; btn.setAttribute('aria-busy', 'true'); try { await work(); } finally { btn.removeAttribute('aria-busy'); } };
const done = (btn: HTMLElement, text: string) => { const o = btn.textContent; btn.classList.add('is-done'); btn.textContent = text; setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = o; }, 1600); };
async function save(state: 'draft' | 'scheduled', btn: HTMLElement) {
  await busy(btn, async () => {
    const r = await persist(state); if ('error' in r) { fb(r.error, false); return; }
    const at = ($('#mc-when') as HTMLInputElement).value;
    done(btn, state === 'draft' ? 'SAVED' : 'SCHEDULED');
    fb(state === 'draft' ? 'Saved as a draft. It’s in the list below.' : `Scheduled for ${new Date(at).toLocaleString()} to ${howMany(r.who)}. It sends by itself within five minutes of that time.`);
    await load();
  });
}
async function testSend(btn: HTMLElement) {
  await busy(btn, async () => {
    if (!($('#mc-title') as HTMLInputElement).value.trim()) { fb('Add a subject first.', false); return; }
    const r = await persist('draft'); if ('error' in r) { fb(r.error, false); return; }
    fb('Sending you a test…');
    const res = await fn('test', r.id); const got = [res.body.email && `an email to ${res.body.email} (check spam too)`, res.body.text && `a text to ${prettyPhone(res.body.text)}`].filter(Boolean).join(' and ');
    if (res.ok) { done(btn, 'SENT'); fb(`Test sent: ${got}. It's saved as a draft.`); } else fb(`${got ? `Sent ${got}. ` : ''}${res.body.error ?? 'The test didn’t send.'}`, false);
    await load();
  });
}
async function sendNow(btn: HTMLElement) {
  const later = $('[data-when] .portal-chip[aria-pressed="true"]')?.dataset.value === 'later';
  if (later) { await save('scheduled', btn); return; }
  await busy(btn, async () => {
    const title = ($('#mc-title') as HTMLInputElement).value.trim(); if (!title) { fb('Add a subject first.', false); return; }
    const a = audience();
    if (!a.who.length) { fb(a.sendBy === 'email' ? 'Nobody matches this audience (or everyone in it has turned announcements off).' : 'Nobody in this audience can be reached that way. Texts go only to people who added a number and opted in.', false); return; }
    if (a.sendBy !== 'email') { const sms = smsBody(compose().body, compose().event); if (sms.length > SMS_MAX) { fb(`Too long for a text: ${sms.length} of ${SMS_MAX} characters. Shorten it, or send it by email.`, false); return; } }
    if (!confirm(`Send “${title}” ${reachText(a)} now? This can’t be unsent.`)) return;
    const r = await persist('draft'); if ('error' in r) { fb(r.error, false); return; }
    fb('Sending…');
    const res = await fn('send', r.id);
    if (res.ok) { done(btn, 'SENT'); editing = null; fb(`Sent ${howMany(res.body.sent, 'message')}.${res.body.failed ? ` ${res.body.failed} failed: ${res.body.error}` : ''} It’s in the list below with who got it.`); }
    else fb(res.body.error ?? 'It didn’t send.', false);
    await load();
  });
}
async function load() {
  const sb = supabase();
  const [{ data: p }, { data: c }, { data: m }, { data: r }] = await Promise.all([sb.from('profiles').select('*, city:cities(*)'), sb.from('channels').select('*').order('id'), sb.from('messages').select('*').order('updated_at', { ascending: false }), sb.from('message_recipients').select('message_id, profile_id, channel, email, phone, delivered_at, status, error')]);
  people = (p ?? []) as ProfileRow[]; channels = (c ?? []) as Channel[]; messages = (m ?? []) as Msg[]; rcpts = (r ?? []) as Rcpt[];
  renderChannels(); renderMessages(); smsCount();
}
async function init() {
  const list = $('[data-msg-list]'); if (!list || list.dataset.wired) return; list.dataset.wired = '1';
  document.querySelectorAll<HTMLElement>('[data-action]').forEach((b) => { b.dataset.wired = '1'; });
  // label the filter blocks by key so the audience can be read back
  const keys: Record<string, string> = { STATUS: 'status', COHORT: 'cohort', DIVISIONS: 'divisions', INDUSTRIES: 'industries' };
  // on a phone the optional blocks start folded (the page was ~6,500 px of stacked panels); on desktop they are open
  document.querySelectorAll<HTMLDetailsElement>('details[data-fold]').forEach((d) => { d.open = innerWidth >= 768; });
  for (const label of document.querySelectorAll<HTMLElement>('[data-audience] span.t-label')) { const k = keys[label.textContent!.trim()]; const chips = label.nextElementSibling as HTMLElement | null; if (k && chips?.classList.contains('portal-chips')) chips.dataset.aud = k; }
  editing = null;
  // the action buttons wake up once the page has its data (a click during loading used to do nothing)
  const actions = [...document.querySelectorAll<HTMLButtonElement>('[data-action="preview"], [data-action="draft"], [data-action="test-send"], [data-action="send"]')];
  actions.forEach((b) => { b.disabled = true; });
  const who = await me(); if (!who?.admin) return; await load();
  actions.forEach((b) => { b.disabled = false; });
  void fn('status').then((res) => { delivery = res.ok ? res.body : { email: { configured: false, testMode: false, testTo: null }, text: { configured: false, from: null, trial: false, error: res.body?.error ?? 'couldn’t check', testTo: null, hoursOpen: true } }; showDelivery(); });
  document.querySelector('.portal-panels form')?.addEventListener('input', smsCount);
  document.querySelector('.portal-section')!.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!b) return;
    if (b.closest('[data-single]:not([data-when])')) setTimeout(smsCount, 0);   // EMAIL / TEXT / BOTH changed
    if (b.dataset.action === 'preview') { e.preventDefault(); const a = audience(); fb(`This would go ${reachText(a)}${a.channel ? ` (channel ${a.channel.name})` : Object.keys(a.filters).length ? ` (${Object.values(a.filters).flat().join(', ')})` : ' (everyone)'}.${a.sendBy !== 'email' ? ' Texts go only to people who added a number and opted in.' : ''}`); }
    else if (b.dataset.action === 'new-draft') { editing = null; for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('#mc-title, #mc-body, #mc-ev-name, #mc-ev-when, #mc-ev-where, #mc-ev-rsvp')) el.value = ''; smsCount(); fb('New draft.'); $('#mc-title')?.focus(); }
    else if (b.dataset.action === 'draft') { e.preventDefault(); await save('draft', b); }
    else if (b.dataset.action === 'send') { e.preventDefault(); await sendNow(b); }
    else if (b.dataset.action === 'test-send') { e.preventDefault(); await testSend(b); }
    else if (b.dataset.edit) { const m = messages.find((x) => x.id === Number(b.dataset.edit)); if (m) loadIntoComposer(m); }
    else if (b.dataset.cancel) { const r = await supabase().from('messages').update({ state: 'draft', scheduled_for: null }).eq('id', Number(b.dataset.cancel)); if (r.error) { fb(r.error.message, false); return; } fb('Cancelled. It is back in drafts.'); await load(); }
    else if (b.dataset.del) { if (confirm('Delete this draft?')) { const r = await supabase().from('messages').delete().eq('id', Number(b.dataset.del)); if (r.error) { fb(r.error.message, false); return; } if (editing === Number(b.dataset.del)) editing = null; await load(); } }
    else if (b.dataset.who) { const ul = b.closest('li')!.querySelector<HTMLElement>('.portal-recipients')!; ul.hidden = !ul.hidden; b.textContent = ul.hidden ? (b.closest('li')!.dataset.state === 'sent' ? 'WHO GOT IT' : 'WHO WILL GET IT') : 'HIDE'; }
    else if (b.closest('[data-msg-tabs]')) setTimeout(renderMessages, 0);
    else if (b.closest('[data-channels]')) { const on = b.getAttribute('aria-pressed') !== 'true'; document.querySelectorAll('[data-channels] .portal-chip').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', String(on)); }   // these chips are rendered after the shared script bound its per-chip toggle, so flip here
  }, { capture: true });
}
init();
document.addEventListener('astro:page-load', init);
