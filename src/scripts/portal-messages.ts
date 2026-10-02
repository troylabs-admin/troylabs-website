/**
 * Admin › Messages: channels with live member counts, PREVIEW RECIPIENTS, SAVE DRAFT, SEND A TEST TO ME,
 * SEND NOW and SCHEDULE, EDIT / CANCEL / DELETE, and for sent messages exactly who it went to. Sending is the
 * `send-message` edge function (Resend email; it holds the key and decides recipients itself). Scheduled
 * messages are sent by the database's five-minute job. Texts (SendBlue) are not connected.
 */
import { me } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { cohortOf, type ProfileRow } from '../lib/portal/data';

type Channel = { id: number; name: string; rule: Record<string, string>; system: boolean };
type Msg = { id: number; title: string; body: string; send_by: string; channel_id: number | null; filters: Record<string, string[]>; event: any; state: string; scheduled_for: string | null; sent_at: string | null; updated_at: string; sent_count: number; failed_count: number; last_error: string | null };
type Rcpt = { message_id: number; profile_id: string; email: string | null; delivered_at: string | null; error: string | null };
type Delivery = { configured: boolean; testMode: boolean; testTo: string; from?: string };
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
  const el = $('#msg-delivery'); if (!el || !delivery) return;
  el.classList.toggle('is-warn', !delivery.configured || delivery.testMode);
  el.textContent = !delivery.configured ? 'Email isn’t connected yet: the Resend key hasn’t been added. Drafts and scheduling still save.'
    : delivery.testMode ? `Email is in test mode: until usctroylabs.com is verified in Resend, messages can only go to you (${delivery.testTo}). SEND A TEST TO ME works now.`
    : `Email is connected. Messages come from ${delivery.from ?? 'TroyLabs'}; replies go to troylabs@usc.edu.`;
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
  const who = people.filter((p) => p.approved && matches(p, rule)).filter((p) => sendBy === 'email' ? Boolean((p.personal_email || p.usc_email) && p.email_opt_in !== false) : sendBy === 'text' ? Boolean(p.phone && p.phone_opt_in) : true);
  return { channel, filters, rule, sendBy, who };
};

function renderChannels() {
  const chips = $('[data-channels]')!; chips.innerHTML = channels.map((c) => `<button type="button" class="t-fine portal-chip" aria-pressed="false" data-value="${esc(c.name)}" title="${esc(Object.entries(c.rule).map(([k, v]) => `${k} = ${v}`).join(', ') || 'every member')}">${esc(c.name)} · ${people.filter((p) => p.approved && matches(p, c.rule)).length}</button>`).join('');
  const list = $('[data-channel-list]')!; const auto = list.querySelector('li:last-child')!.outerHTML;
  list.innerHTML = channels.map((c) => `<li><span><span class="text-ink">${esc(c.name)}</span> <span class="text-muted">· ${esc(Object.entries(c.rule).map(([k, v]) => `${k} = ${v}`).join(', ') || 'every member')} · ${people.filter((p) => p.approved && matches(p, c.rule)).length} members</span></span></li>`).join('') + auto;
}
function renderMessages() {
  const list = $('[data-msg-list]')!; const tab = $('[data-msg-tabs] .portal-chip[aria-pressed="true"]')?.dataset.value ?? 'all';
  const rows = messages.filter((m) => m.state !== 'cancelled');
  list.innerHTML = rows.length ? rows.map((m) => { const ch = channels.find((c) => c.id === m.channel_id); const rule = ch ? ch.rule : m.filters; const who = people.filter((p) => p.approved && matches(p, rule) && (p.personal_email || p.usc_email) && p.email_opt_in !== false);
    const sentTo = rcpts.filter((r) => r.message_id === m.id); const named = (r: Rcpt) => people.find((p) => p.id === r.profile_id)?.full_name || '(no name)';
    const reach = m.state === 'sent' ? `${m.sent_count} sent${m.failed_count ? ` · ${m.failed_count} failed` : ''}` : `${who.length} will receive`;
    const when = m.state === 'sent' && m.sent_at ? `Sent ${new Date(m.sent_at).toLocaleString()}` : m.state === 'scheduled' && m.scheduled_for ? `Sends ${new Date(m.scheduled_for).toLocaleString()}` : `Edited ${new Date(m.updated_at).toLocaleDateString()}`;
    return `<li data-state="${m.state}" data-id="${m.id}" style="flex-direction:column;align-items:stretch;gap:calc(8 * var(--u))"${tab !== 'all' && tab !== m.state ? ' hidden' : ''}>
      <div class="flex items-center" style="gap:calc(12 * var(--u))"><span class="t-fine portal-tag" style="${m.state === 'sent' ? 'color:var(--color-ink)' : m.state === 'scheduled' || m.state === 'sending' ? 'color:var(--color-orange)' : ''}">${m.state.toUpperCase()}</span><span class="text-ink" style="flex:1">${esc(m.title || '(untitled)')}</span><span class="t-fine text-muted">${when}</span><span class="t-fine text-muted">${m.send_by === 'both' ? 'EMAIL + TEXT' : m.send_by.toUpperCase()}</span></div>
      <p class="m-0 t-fine text-muted" style="max-width:calc(620 * var(--u))">${esc(m.body.slice(0, 140))}${m.body.length > 140 ? '…' : ''}</p>
      <div class="flex items-center" style="gap:calc(16 * var(--u))"><span class="t-fine text-muted">To: ${esc(ch ? ch.name : Object.values(m.filters).flat().join(', ') || 'everyone')} · ${reach}</span><span style="flex:1"></span>
        ${m.state !== 'sent' ? `<button type="button" class="t-label portal-linklike" style="color:var(--color-orange)" data-edit="${m.id}">EDIT</button>` : ''}
        ${m.state === 'scheduled' ? `<button type="button" class="t-label portal-linklike" data-cancel="${m.id}">CANCEL</button>` : ''}
        <button type="button" class="t-label portal-linklike" data-who="${m.id}">${m.state === 'sent' ? 'WHO GOT IT' : 'WHO WILL GET IT'}</button>
        ${m.state === 'draft' ? `<button type="button" class="t-label portal-linklike" data-del="${m.id}">DELETE</button>` : ''}</div>
      ${m.last_error && m.state !== 'sent' ? `<p class="m-0 t-fine portal-msg-error">Not sent: ${esc(m.last_error)}</p>` : m.last_error ? `<p class="m-0 t-fine portal-msg-error">${esc(m.last_error)}</p>` : ''}
      <ul class="portal-row-list t-fine portal-recipients" hidden>${m.state === 'sent'
        ? sentTo.map((r) => `<li><span>${esc(named(r))} · ${esc(r.email ?? '')}</span><span class="${r.error ? 'portal-msg-error' : 'text-muted'}">${r.error ? 'FAILED' : r.delivered_at ? 'SENT' : '—'}</span></li>`).join('') || '<li class="text-muted">No recipients recorded.</li>'
        : who.map((p) => `<li><span>${esc(p.full_name || '(no name)')} · ${esc(p.personal_email || p.usc_email || '')}</span></li>`).join('') || '<li class="text-muted">Nobody matches right now.</li>'}</ul>
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
  document.querySelector('.portal-panels')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); fb(`Editing “${m.title || '(untitled)'}”. Save as a draft, schedule, or send.`);
}
/** write the composer to the database (new or the one being edited) and return its id */
async function persist(state: 'draft' | 'scheduled'): Promise<{ id: number; who: number } | { error: string }> {
  const c = compose(); if (!c.body) return { error: 'Write the message first.' };
  const a = audience(); const later = $('[data-when] .portal-chip[aria-pressed="true"]')?.dataset.value === 'later'; const at = ($('#mc-when') as HTMLInputElement).value;
  if (state === 'scheduled' && later && !at) return { error: 'Pick a date and time to schedule it.' };
  if (state === 'scheduled' && at && new Date(at).getTime() < Date.now() - 60_000) return { error: 'That time has already passed. Pick a time in the future, or choose SEND NOW.' };
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
    fb(state === 'draft' ? 'Saved as a draft. It’s in the list below.' : `Scheduled for ${new Date(at).toLocaleString()} to ${r.who} ${r.who === 1 ? 'person' : 'people'}. It sends by itself within five minutes of that time${delivery?.configured ? '' : ', once email is connected'}.`);
    await load();
  });
}
async function testSend(btn: HTMLElement) {
  await busy(btn, async () => {
    if (!($('#mc-title') as HTMLInputElement).value.trim()) { fb('Add a subject first.', false); return; }
    const r = await persist('draft'); if ('error' in r) { fb(r.error, false); return; }
    fb('Sending you a test…');
    const res = await fn('test', r.id);
    if (res.ok) { done(btn, 'SENT'); fb(`Test sent to ${res.body.to}. Check your inbox (and spam). It's saved as a draft.`); } else fb(res.body.error ?? 'The test didn’t send.', false);
    await load();
  });
}
async function sendNow(btn: HTMLElement) {
  const later = $('[data-when] .portal-chip[aria-pressed="true"]')?.dataset.value === 'later';
  if (later) { await save('scheduled', btn); return; }
  await busy(btn, async () => {
    const title = ($('#mc-title') as HTMLInputElement).value.trim(); if (!title) { fb('Add a subject first.', false); return; }
    const a = audience();
    if (a.sendBy === 'text') { fb('Texts aren’t connected yet. Choose EMAIL to send now.', false); return; }
    if (!a.who.length) { fb('Nobody matches this audience (or everyone in it has turned announcements off).', false); return; }
    if (!confirm(`Send “${title}” by email to ${a.who.length} ${a.who.length === 1 ? 'person' : 'people'} now?${a.sendBy === 'both' ? ' Texts aren’t connected, so only the email goes out.' : ''} This can’t be unsent.`)) return;
    const r = await persist('draft'); if ('error' in r) { fb(r.error, false); return; }
    fb('Sending…');
    const res = await fn('send', r.id);
    if (res.ok) { done(btn, 'SENT'); editing = null; fb(`Sent to ${res.body.sent} ${res.body.sent === 1 ? 'person' : 'people'}.${res.body.failed ? ` ${res.body.failed} failed: ${res.body.error}` : ''} It’s in the list below with who got it.`); }
    else fb(res.body.error ?? 'It didn’t send.', false);
    await load();
  });
}
async function load() {
  const sb = supabase();
  const [{ data: p }, { data: c }, { data: m }, { data: r }] = await Promise.all([sb.from('profiles').select('*, city:cities(*)'), sb.from('channels').select('*').order('id'), sb.from('messages').select('*').order('updated_at', { ascending: false }), sb.from('message_recipients').select('message_id, profile_id, email, delivered_at, error')]);
  people = (p ?? []) as ProfileRow[]; channels = (c ?? []) as Channel[]; messages = (m ?? []) as Msg[]; rcpts = (r ?? []) as Rcpt[];
  renderChannels(); renderMessages();
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
  void fn('status').then((res) => { delivery = res.ok ? res.body : { configured: false, testMode: false, testTo: '' }; showDelivery(); });
  document.querySelector('.portal-section')!.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!b) return;
    if (b.dataset.action === 'preview') { e.preventDefault(); const a = audience(); fb(`${a.who.length} ${a.who.length === 1 ? 'person' : 'people'} would get this by ${a.sendBy === 'both' ? 'email and text' : a.sendBy}${a.channel ? ` (channel ${a.channel.name})` : Object.keys(a.filters).length ? ` (${Object.values(a.filters).flat().join(', ')})` : ' (everyone)'}.${a.sendBy !== 'email' ? ' Texts go only to people who opted in.' : ''}`); }
    else if (b.dataset.action === 'new-draft') { editing = null; for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('#mc-title, #mc-body, #mc-ev-name, #mc-ev-when, #mc-ev-where, #mc-ev-rsvp')) el.value = ''; fb('New draft.'); $('#mc-title')?.focus(); }
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
