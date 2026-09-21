/**
 * Admin › Messages, for real: channels from the database with live member counts, PREVIEW RECIPIENTS
 * computed from the profiles, SAVE DRAFT / SCHEDULE / SEND writing to `messages`, EDIT loading a message
 * back into the composer, CANCEL and DELETE. Delivery itself (email via Resend, texts via SendBlue) is
 * not connected yet: SEND NOW queues the message as `scheduled` for now and says so.
 */
import { me } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { cohortOf, type ProfileRow } from '../lib/portal/data';

type Channel = { id: number; name: string; rule: Record<string, string>; system: boolean };
type Msg = { id: number; title: string; body: string; send_by: string; channel_id: number | null; filters: Record<string, string[]>; event: any; state: string; scheduled_for: string | null; sent_at: string | null; updated_at: string };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const fb = (text: string, ok = true) => { const el = $('#msg-fb'); if (el) { el.textContent = text; el.style.color = ok ? '' : 'var(--color-orange)'; } };
let people: ProfileRow[] = [], channels: Channel[] = [], messages: Msg[] = [], editing: number | null = null;

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
  const who = people.filter((p) => p.approved && matches(p, rule)).filter((p) => sendBy === 'email' ? Boolean(p.personal_email || p.usc_email) : sendBy === 'text' ? Boolean(p.phone && p.phone_opt_in) : true);
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
  list.innerHTML = rows.length ? rows.map((m) => { const ch = channels.find((c) => c.id === m.channel_id); const rule = ch ? ch.rule : m.filters; const who = people.filter((p) => p.approved && matches(p, rule));
    const when = m.state === 'sent' && m.sent_at ? `Sent ${new Date(m.sent_at).toLocaleString()}` : m.state === 'scheduled' && m.scheduled_for ? `Sends ${new Date(m.scheduled_for).toLocaleString()}` : `Edited ${new Date(m.updated_at).toLocaleDateString()}`;
    return `<li data-state="${m.state}" data-id="${m.id}" style="flex-direction:column;align-items:stretch;gap:calc(8 * var(--u))"${tab !== 'all' && tab !== m.state ? ' hidden' : ''}>
      <div class="flex items-center" style="gap:calc(12 * var(--u))"><span class="t-fine portal-tag" style="${m.state === 'sent' ? 'color:var(--color-ink)' : m.state === 'scheduled' ? 'color:var(--color-orange)' : ''}">${m.state.toUpperCase()}</span><span class="text-ink" style="flex:1">${esc(m.title || '(untitled)')}</span><span class="t-fine text-muted">${when}</span><span class="t-fine text-muted">${m.send_by === 'both' ? 'EMAIL + TEXT' : m.send_by.toUpperCase()}</span></div>
      <p class="m-0 t-fine text-muted" style="max-width:calc(620 * var(--u))">${esc(m.body.slice(0, 140))}${m.body.length > 140 ? '…' : ''}</p>
      <div class="flex items-center" style="gap:calc(16 * var(--u))"><span class="t-fine text-muted">To: ${esc(ch ? ch.name : Object.values(m.filters).flat().join(', ') || 'everyone')} · ${who.length} ${m.state === 'sent' ? 'received' : 'will receive'}</span><span style="flex:1"></span>
        ${m.state !== 'sent' ? `<button type="button" class="t-label portal-linklike" style="color:var(--color-orange)" data-edit="${m.id}">EDIT</button>` : ''}
        ${m.state === 'scheduled' ? `<button type="button" class="t-label portal-linklike" data-cancel="${m.id}">CANCEL</button>` : ''}
        <button type="button" class="t-label portal-linklike" data-who="${m.id}">${m.state === 'sent' ? 'WHO GOT IT' : 'WHO WILL GET IT'}</button>
        ${m.state === 'draft' ? `<button type="button" class="t-label portal-linklike" data-del="${m.id}">DELETE</button>` : ''}</div>
      <ul class="portal-row-list t-fine portal-recipients" hidden>${who.map((p) => `<li><span>${esc(p.full_name || '(no name)')} · ${esc(p.personal_email || p.usc_email || '')}</span></li>`).join('') || '<li class="text-muted">Nobody matches right now.</li>'}</ul>
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
async function save(state: 'draft' | 'scheduled', btn: HTMLElement) {
  const c = compose(); if (!c.body) { fb('Write the message first.', false); return; }
  const a = audience(); const later = $('[data-when] .portal-chip[aria-pressed="true"]')?.dataset.value === 'later'; const at = ($('#mc-when') as HTMLInputElement).value;
  if (state === 'scheduled' && later && !at) { fb('Pick a date and time to schedule it.', false); return; }
  const row = { ...c, send_by: a.sendBy, channel_id: a.channel?.id ?? null, filters: a.channel ? {} : a.filters, state, scheduled_for: state === 'scheduled' ? (later && at ? new Date(at).toISOString() : new Date().toISOString()) : null };
  const sb = supabase(); const res = editing ? await sb.from('messages').update(row).eq('id', editing).select().single() : await sb.from('messages').insert(row).select().single();
  if (res.error) { fb(res.error.message, false); return; }
  const o = btn.textContent; btn.classList.add('is-done'); btn.textContent = state === 'draft' ? 'SAVED' : 'QUEUED'; setTimeout(() => { btn.classList.remove('is-done'); btn.textContent = o; }, 1600);
  fb(state === 'draft' ? 'Saved as a draft. It is in the list below.' : later && at ? `Scheduled for ${new Date(at).toLocaleString()} to ${a.who.length} ${a.who.length === 1 ? 'person' : 'people'}. Delivery goes live when the email provider is connected.` : `Queued for ${a.who.length} ${a.who.length === 1 ? 'person' : 'people'}. Nothing was sent yet: delivery goes live when the email provider (Resend) is connected — the message is saved and will go out then.`);
  editing = null; await load();
}
async function load() {
  const sb = supabase();
  const [{ data: p }, { data: c }, { data: m }] = await Promise.all([sb.from('profiles').select('*, city:cities(*)'), sb.from('channels').select('*').order('id'), sb.from('messages').select('*').order('updated_at', { ascending: false })]);
  people = (p ?? []) as ProfileRow[]; channels = (c ?? []) as Channel[]; messages = (m ?? []) as Msg[];
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
  const who = await me(); if (!who?.admin) return; await load();
  document.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!b) return;
    if (b.dataset.action === 'preview') { e.preventDefault(); const a = audience(); fb(`${a.who.length} ${a.who.length === 1 ? 'person' : 'people'} would get this by ${a.sendBy === 'both' ? 'email and text' : a.sendBy}${a.channel ? ` (channel ${a.channel.name})` : Object.keys(a.filters).length ? ` (${Object.values(a.filters).flat().join(', ')})` : ' (everyone)'}.${a.sendBy !== 'email' ? ' Texts go only to people who opted in.' : ''}`); }
    else if (b.dataset.action === 'draft') { e.preventDefault(); await save('draft', b); }
    else if (b.dataset.action === 'send') { e.preventDefault(); await save('scheduled', b); }
    else if (b.dataset.edit) { const m = messages.find((x) => x.id === Number(b.dataset.edit)); if (m) loadIntoComposer(m); }
    else if (b.dataset.cancel) { await supabase().from('messages').update({ state: 'draft', scheduled_for: null }).eq('id', Number(b.dataset.cancel)); fb('Cancelled. It is back in drafts.'); await load(); }
    else if (b.dataset.del) { if (confirm('Delete this draft?')) { await supabase().from('messages').delete().eq('id', Number(b.dataset.del)); await load(); } }
    else if (b.dataset.who) { const ul = b.closest('li')!.querySelector<HTMLElement>('.portal-recipients')!; ul.hidden = !ul.hidden; b.textContent = ul.hidden ? (b.closest('li')!.dataset.state === 'sent' ? 'WHO GOT IT' : 'WHO WILL GET IT') : 'HIDE'; }
    else if (b.closest('[data-msg-tabs]')) setTimeout(renderMessages, 0);
    else if (b.closest('[data-channels]')) { const on = b.getAttribute('aria-pressed') !== 'true'; document.querySelectorAll('[data-channels] .portal-chip').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', String(on)); }   // these chips are rendered after the shared script bound its per-chip toggle, so flip here
  }, { capture: true });
}
init();
document.addEventListener('astro:page-load', init);
