/**
 * Delivery for Admin › Message: email through Resend (2026-10-02) and texts through Twilio (2026-10-02). Holds
 * the provider keys, so it runs here and never in the page.
 *
 * Modes (POST JSON):
 *   status                 → is each channel connected, from which address/number, test or trial mode
 *   preview { messageId }  → who would get it and the rendered email/text, nothing sent
 *   test    { messageId }  → sends it to the calling admin only (email, text or both, as the message says)
 *   send    { messageId }  → sends it to its audience now, records every recipient
 *   due                    → called by the database every five minutes (shared secret); sends scheduled messages
 * Every mode except `due` requires a signed-in admin (checked through the same row-level security as the site).
 * Twilio also calls in (form posts, signed with the auth token, checked here):
 *   ?twilio=status         → the delivery outcome of each text (carriers can still drop an accepted text)
 *   ?twilio=inbound        → replies to the TroyLabs number; STOP turns texts off on the profile, START back on
 *
 * Recipients: approved members in the message's audience (any ticked group × CURRENT/ALUMNI cell, narrowed by
 * cohort/industry when set; _shared/audience.ts, the same code the page counts with). Email: an address on file and
 * announcements not turned off. Text: a number on file and "Text me TroyLabs event invitations" ticked. One per
 * address/number. A send that fails half way can be sent again: people already reached are skipped.
 *
 * Resend test mode: until usctroylabs.com is verified, mail can only come from onboarding@resend.dev and only to
 * the Resend account's own address, so a group email is allowed only when every recipient is the sending admin.
 * Twilio: carriers block texts from unregistered numbers. A trial account can text Twilio's Virtual Phone (a
 * simulated phone in the Twilio console) with no registration, which is how the pipeline is tested first.
 * Group texts go out only 8 AM–9 PM Pacific (a test to yourself any time).
 *
 * Secrets: RESEND_API_KEY, RESEND_FROM (default "TroyLabs <onboarding@resend.dev>"), REPLY_TO (default
 * troylabs@usc.edu), TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (+1..., the Twilio number),
 * CRON_SECRET (set with the migration).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { APPROVED_TEXT, GOODBYE_TEXT, SMS_MAX, WELCOME_TEXT, segments, smsBody, straighten } from '../_shared/sms.ts';
import { cleanAudience, inAudience, type Audience, type Member } from '../_shared/audience.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SITE = 'https://usctroylabs.com';
/** the TroyLabs wordmark at the top of every email (a PNG on the site: Gmail and Outlook don't show SVG); the alt text is the fallback */
const LOGO = `<img src="${SITE}/email/troylabs-wordmark.png" width="200" height="38" alt="TROYLABS" style="display:block;border:0;outline:none;width:200px;height:auto;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:4px;color:#0a0a0a">`;

interface Msg { created_by?: string | null; id: number; title: string; body: string; send_by: 'email' | 'text' | 'both'; audience: Audience; event: { name?: string; when?: string | null; where?: string | null; rsvp?: string | null } | null; state: string; scheduled_for: string | null }
interface Person extends Member { full_name: string; personal_email: string | null; usc_email: string | null; email_opt_in: boolean; phone: string | null; phone_opt_in: boolean }

// ── who gets it: the shared audience rules (_shared/audience.ts), the same code the Message page counts with ──
/** the semester right now: spring January–June, fall July–December, in LA (same as lib/portal/options.ts) */
function currentTerm(d = new Date()): { term: 'FA' | 'SP'; year: number } {
  const la = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  return { term: la.getMonth() >= 6 ? 'FA' : 'SP', year: la.getFullYear() };
}
/** reserved test domains (RFC 2606) never get real mail: the automated tests use them, and bounces cost quota and reputation */
const deliverable = (to: string) => !/@(example\.(com|org|net)|[^@\s]+\.(test|invalid|example|localhost))$/i.test(to.trim());
const emailOf = (p: Person) => (p.personal_email || p.usc_email || '').trim().toLowerCase();
type EmailTo = { id: string; name: string; email: string }; type TextTo = { id: string; name: string; phone: string };
const channelsOf = (m: Msg) => (m.send_by === 'both' ? ['email', 'text'] : [m.send_by]) as ('email' | 'text')[];
async function recipientsFor(svc: SupabaseClient, m: Msg, actor: string | null): Promise<{ email: EmailTo[]; text: TextTo[] }> {
  const a = cleanAudience(m.audience);
  // temporary test accounts (profiles.is_test) and real people never mix (2026-10-06): whoever is acting (the admin
  // previewing or sending; for a scheduled send, whoever wrote it) decides — a test admin only ever reaches test
  // accounts, anyone else never does
  const who = actor ?? m.created_by ?? null;
  const { data: author } = who ? await svc.from('profiles').select('is_test').eq('id', who).maybeSingle() : { data: null };
  const { data, error } = await svc.from('profiles').select('id, full_name, status, join_term, join_year, divisions, industries, personal_email, usc_email, email_opt_in, phone, phone_opt_in').eq('approved', true).eq('is_test', Boolean(author?.is_test));
  if (error) throw error;
  const t = currentTerm(); const { data: roles, error: re } = await svc.from('eboard_roles').select('profile_id, term, year');
  if (re) throw re;
  const eb = { now: new Set((roles ?? []).filter((r) => r.term === t.term && r.year === t.year).map((r) => r.profile_id as string)), ever: new Set((roles ?? []).map((r) => r.profile_id as string)) };
  const audience = ((data ?? []) as unknown as Person[]).filter((p) => inAudience(p, a, eb)); const want = channelsOf(m);
  const once = <T,>(list: T[], key: (x: T) => string) => { const seen = new Set<string>(); return list.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
  return {
    email: want.includes('email') ? once(audience.filter((p) => p.email_opt_in !== false && emailOf(p)).map((p) => ({ id: p.id, name: p.full_name, email: emailOf(p) })), (x) => x.email) : [],
    text: want.includes('text') ? once(audience.filter((p) => p.phone_opt_in && p.phone).map((p) => ({ id: p.id, name: p.full_name, phone: p.phone! })), (x) => x.phone) : [],
  };
}

// ── the email itself ─────────────────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const webUrl = (v?: string | null) => { try { const u = new URL(v ?? ''); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
/** the event time as the admin typed it (a wall-clock time in LA, no timezone attached) */
function eventWhen(v?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v ?? ''); if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return d.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' (Pacific)';
}
function render(m: Msg, test: boolean) {
  const ev = m.event?.name ? m.event : null; const when = eventWhen(ev?.when); const rsvp = webUrl(ev?.rsvp);
  const para = esc(m.body).replace(/\r?\n/g, '<br>');
  const font = "font-family:Helvetica,Arial,sans-serif";
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f3f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f3"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:14px">
${test ? `<tr><td style="padding:14px 32px;background:#fff4ec;border-radius:14px 14px 0 0;${font};font-size:12px;color:#b4561a;letter-spacing:1px">TEST SEND · only you received this</td></tr>` : ''}
<tr><td style="padding:28px 32px 6px">${LOGO}</td></tr>
<tr><td style="padding:14px 32px 0;${font};font-size:15px;line-height:1.6;color:#1a1a1a">${para}</td></tr>
${ev ? `<tr><td style="padding:22px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ececec;border-radius:12px"><tr><td style="padding:18px 20px;${font};color:#1a1a1a">
<div style="font-size:16px;font-weight:700">${esc(ev.name!)}</div>
${when ? `<div style="font-size:14px;color:#555;margin-top:6px">${esc(when)}</div>` : ''}
${ev.where ? `<div style="font-size:14px;color:#555;margin-top:2px">${esc(ev.where)}</div>` : ''}
${rsvp ? `<div style="margin-top:16px"><a href="${esc(rsvp)}" style="display:inline-block;background:#ff7d2c;color:#0a0a0a;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:1.5px;padding:11px 20px;border-radius:999px">RSVP</a></div>` : ''}
</td></tr></table></td></tr>` : ''}
<tr><td style="padding:28px 32px 26px;${font};font-size:12px;line-height:1.5;color:#888">
<div style="border-top:1px solid #eeeeee;padding-top:16px">You're getting this because you're in the TL Alumni Network. Reply to reach TroyLabs leadership. To stop these emails, turn off "Email me TroyLabs announcements" on <a href="${SITE}/alumni-portal/profile" style="color:#888">your profile</a>.</div>
</td></tr></table></td></tr></table></body></html>`;
  const text = [test ? '[TEST SEND · only you received this]\n' : '', m.body, ev ? `\n\n${ev.name}${when ? `\n${when}` : ''}${ev.where ? `\n${ev.where}` : ''}${rsvp ? `\nRSVP: ${rsvp}` : ''}` : '',
    `\n\n—\nYou're getting this because you're in the TL Alumni Network. Reply to reach TroyLabs leadership. To stop these emails, turn off "Email me TroyLabs announcements" on your profile: ${SITE}/alumni-portal/profile`].join('');
  return { html, text };
}

// ── Resend ───────────────────────────────────────────────────────────────────────────────────────
const config = () => {
  const key = Deno.env.get('RESEND_API_KEY') ?? ''; const from = Deno.env.get('RESEND_FROM') || 'TroyLabs <onboarding@resend.dev>';
  return { key, from, replyTo: Deno.env.get('REPLY_TO') || 'troylabs@usc.edu', testMode: /@resend\.dev>?\s*$/i.test(from) };
};
async function resendBatch(emails: unknown[], idempotencyKey: string): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const { key } = config();
  for (let attempt = 0; attempt < 3; attempt++) {
    let r: Response;
    try { r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(emails) }); }
    catch { return { ok: false, error: 'Couldn’t confirm whether Resend accepted the email. Check your inbox or Resend’s delivery log before trying again.' }; }   // the provider may have accepted it; preserve the other channel's outcome without blindly resending
    if (r.status === 429 && attempt < 2) { await new Promise((ok) => setTimeout(ok, 1100 * (attempt + 1))); continue; }   // rate limit: back off and retry the same batch (same key, so never twice)
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: `Resend ${r.status}: ${body?.message ?? body?.error ?? 'request failed'}` };
    return { ok: true, ids: (body?.data ?? []).map((d: { id: string }) => d.id) };
  }
  return { ok: false, error: 'Resend kept rate-limiting the request' };
}
/** "You're in": sent when an admin approves someone (Bryan, 2026-10-05: approving told them nothing). Not an announcement, so it ignores the announcements opt-out. */
function approvedMail(to: string, name: string) {
  const { from, replyTo } = config(); const font = "font-family:Helvetica,Arial,sans-serif"; const first = esc((name || '').trim().split(/\s+/)[0] || 'there');
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f3f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f3"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#ffffff;border-radius:14px">
<tr><td style="padding:28px 32px 6px">${LOGO}</td></tr>
<tr><td style="padding:16px 32px 0;${font};font-size:20px;font-weight:700;color:#0a0a0a">You're in, ${first}.</td></tr>
<tr><td style="padding:10px 32px 0;${font};font-size:15px;line-height:1.6;color:#1a1a1a">TroyLabs leadership approved you for the TL Alumni Network. Search everyone from TroyLabs by name, company, city or division, see them on the globe, and keep your own profile up to date.</td></tr>
<tr><td style="padding:22px 32px 4px"><a href="${SITE}/alumni-portal/home" style="display:inline-block;background:#ff7d2c;color:#0a0a0a;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:1.5px;padding:13px 24px;border-radius:999px;${font}">OPEN THE NETWORK</a></td></tr>
<tr><td style="padding:16px 32px 0;${font};font-size:13px;line-height:1.5;color:#666">Sign in with this email address. There's no password: we email you a link each time you sign in on a new device.</td></tr>
<tr><td style="padding:24px 32px 26px;${font};font-size:12px;line-height:1.5;color:#888"><div style="border-top:1px solid #eeeeee;padding-top:16px">You're getting this because you signed up for the TL Alumni Network at usctroylabs.com. Questions? Reply to reach troylabs@usc.edu.</div></td></tr>
</table></td></tr></table></body></html>`;
  const text = `You're in, ${(name || '').trim().split(/\s+/)[0] || 'there'}.\n\nTroyLabs leadership approved you for the TL Alumni Network. Search everyone from TroyLabs by name, company, city or division, and keep your own profile up to date.\n\nOpen the network: ${SITE}/alumni-portal/home\n\nSign in with this email address. There's no password: we email you a link each time you sign in on a new device.\n\n—\nQuestions? Reply to reach troylabs@usc.edu.`;
  return { from, to: [to], reply_to: replyTo, subject: "You're in: the TL Alumni Network", html, text };
}
const mail = (to: string, m: Msg, test: boolean) => { const { from, replyTo } = config(); const { html, text } = render(m, test); return { from, to: [to], reply_to: replyTo, subject: test ? `[TEST] ${m.title}` : m.title, html, text }; };

// ── Twilio ───────────────────────────────────────────────────────────────────────────────────────
const twilio = () => {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '', token = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '', from = Deno.env.get('TWILIO_FROM') ?? '';
  return { sid, token, from, configured: Boolean(sid && token && from) };
};
const FN_URL = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-message`;
/** Twilio's error codes, in words an admin can act on (twilio.com/docs/api/errors) */
const TWILIO_ERRORS: Record<number, string> = {
  20003: 'Twilio rejected the account SID or auth token',
  21211: 'not a valid phone number',
  21408: 'texts to this country aren’t enabled in Twilio',
  21608: 'Twilio trial accounts can only text verified numbers and the Virtual Phone',
  21610: 'they replied STOP, so texts are off for them',
  21612: 'Twilio can’t reach this number from the TroyLabs number',
  21614: 'not a mobile number',
  30003: 'the phone is off or out of service',
  30004: 'the number blocks texts from us',
  30005: 'the number doesn’t exist',
  30006: 'a landline, which can’t get texts',
  30007: 'the carrier filtered it as spam',
  30032: 'the TroyLabs toll-free number isn’t verified yet',
  30034: 'the TroyLabs number isn’t registered for business texting (A2P 10DLC)',
  572006: 'a Twilio trial can only send Twilio’s sample templates, not our own wording; upgrade the Twilio account to send real messages',
};
const twilioError = (code: number | null | undefined, fallback = 'Twilio couldn’t send it') => (code && TWILIO_ERRORS[code]) || (code ? `${fallback} (Twilio error ${code})` : fallback);
const STATUS: Record<string, string> = { accepted: 'queued', scheduled: 'queued', queued: 'queued', sending: 'sent', sent: 'sent', delivered: 'delivered', read: 'delivered', undelivered: 'undelivered', failed: 'failed', canceled: 'failed' };
async function twilioSend(to: string, body: string): Promise<{ ok: true; sid: string; status: string } | { ok: false; code: number | null; error: string }> {
  const t = twilio();
  const form = new URLSearchParams({ To: to, From: t.from, Body: body, StatusCallback: `${FN_URL()}?twilio=status` });
  for (let attempt = 0; attempt < 3; attempt++) {
    let r: Response;
    try { r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.sid}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${t.sid}:${t.token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form }); }
    catch { return { ok: false, code: null, error: 'Couldn’t reach Twilio' }; }   // no retry: Twilio may have taken it, and a retry could text twice
    if (r.status === 429 && attempt < 2) { await new Promise((ok) => setTimeout(ok, 1000 * (attempt + 1))); continue; }   // refused, not taken: safe to retry
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, code: j?.code ?? null, error: twilioError(j?.code, j?.message ?? `Twilio ${r.status}`) };
    return { ok: true, sid: j.sid, status: STATUS[j.status] ?? 'queued' };
  }
  return { ok: false, code: 429, error: 'Twilio kept rate-limiting the request' };
}
let accountCache: { at: number; value: { trial: boolean; error?: string } } | null = null;
async function twilioAccount() {
  if (accountCache && Date.now() - accountCache.at < 600_000) return accountCache.value;
  const t = twilio();
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.sid}.json`, { headers: { Authorization: `Basic ${btoa(`${t.sid}:${t.token}`)}` } }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  const value = !r ? { trial: false, error: 'Couldn’t reach Twilio' } : !r.ok ? { trial: false, error: twilioError(j?.code, `Twilio ${r.status}`) } : { trial: j.type === 'Trial', error: j.status !== 'active' ? `The Twilio account is ${j.status}` : undefined };
  if (r?.ok) accountCache = { at: Date.now(), value };
  return value;
}
/** Twilio signs every request it makes: HMAC-SHA1 over the URL plus the POST fields sorted by name */
async function twilioSigned(req: Request, params: URLSearchParams) {
  const token = twilio().token; const given = req.headers.get('x-twilio-signature') ?? '';
  if (!token || !given) return false;
  const url = FN_URL() + new URL(req.url).search;   // the public URL Twilio called (the runtime's own req.url host is internal)
  const data = url + [...params.entries()].sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0)).map(([k, v]) => k + v).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const want = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))));
  if (want.length !== given.length) return false;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);   // constant time
  return diff === 0;
}
const OPT_OUT = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']);   // Twilio's opt-out keywords (incl. the FCC's 2025 additions)
const OPT_IN = new Set(['START', 'UNSTOP', 'YES']);
const pacificHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(d));
const textingHours = (d = new Date()) => { const h = pacificHour(d); return h >= 8 && h < 21; };
/** run `work` over `items`, `n` at a time */
async function pool<T>(items: T[], n: number, work: (x: T) => Promise<void>) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await work(items[i++]); })); }

/** send one message to its audience; the state change to `sending` is the lock against a double send */
async function deliver(svc: SupabaseClient, id: number, by: string | null, me: { email: string | null; phone: string | null }) {
  const { testMode } = config(); const tw = twilio();
  const { data: claimed } = await svc.from('messages').update({ state: 'sending', sent_by: by, last_error: null }).eq('id', id).in('state', ['draft', 'scheduled']).select().maybeSingle();
  if (!claimed) return { status: 409, body: { error: 'This message is already sent or being sent.' } };
  const m = claimed as Msg; const back = m.scheduled_for ? 'scheduled' : 'draft'; const want = channelsOf(m);
  const fail = async (error: string, status = 400) => { await svc.from('messages').update({ state: back === 'scheduled' && by === null ? 'draft' : back, last_error: error }).eq('id', id); return { status, body: { error } }; };
  if (!m.title?.trim()) return fail('Add a subject before sending.');
  if (!m.body?.trim()) return fail('The message is empty.');
  if (!cleanAudience(m.audience).cells.length) return fail('Pick who gets it first: tick at least one group.');
  if (want.includes('email') && !config().key) return fail('Email isn’t connected yet: the Resend key hasn’t been added.' + (want.includes('text') ? ' Choose TEXT to send only the text.' : ''), 503);
  if (want.includes('text') && !tw.configured) return fail('Texts aren’t connected yet: the Twilio keys haven’t been added.' + (want.includes('email') ? ' Choose EMAIL to send only the email.' : ''), 503);
  const sms = smsBody(m.body, m.event);
  if (want.includes('text') && sms.length > SMS_MAX) return fail(`Too long for a text: ${sms.length} characters with the TroyLabs name and STOP line, and the limit is ${SMS_MAX}. Shorten it, or send it by email.`);
  const to = await recipientsFor(svc, m, by);
  if (!to.email.length && !to.text.length) return fail(`Nobody matches this audience${want.includes('text') ? ' who has opted in to texts' : ''} (or everyone in it has turned announcements off).`);
  if (to.email.length && testMode && to.email.some((p) => p.email !== me.email)) return fail(`Email is still in Resend's test mode, so it can only go to you. ${to.email.length} ${to.email.length === 1 ? 'person' : 'people'} match this audience. Group sends start once usctroylabs.com is verified in Resend; until then use SEND A TEST TO ME.`);
  if (to.text.length && to.text.some((p) => p.phone !== me.phone) && !textingHours()) return fail('Group texts only go out between 8 AM and 9 PM Pacific. Schedule it for the morning, or send it by email.');

  // recipients: keep anyone already reached (a re-send after a partial failure skips them), refresh the rest
  const { data: prior } = await svc.from('message_recipients').select('profile_id, channel, delivered_at').eq('message_id', id);
  const reached = new Set((prior ?? []).filter((r) => r.delivered_at).map((r) => `${r.channel}:${r.profile_id}`));
  await svc.from('message_recipients').delete().eq('message_id', id).is('delivered_at', null);
  const emails = to.email.filter((p) => !reached.has(`email:${p.id}`) && deliverable(p.email)), texts = to.text.filter((p) => !reached.has(`text:${p.id}`));
  const rows = [...emails.map((p) => ({ message_id: id, profile_id: p.id, channel: 'email', email: p.email })), ...texts.map((p) => ({ message_id: id, profile_id: p.id, channel: 'text', phone: p.phone }))];
  if (rows.length) { const { error } = await svc.from('message_recipients').insert(rows); if (error) return fail(`Couldn’t record the recipients: ${error.message}`, 500); }
  let sentNow = 0, failed = 0; const errors: string[] = [];

  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    const res = await resendBatch(chunk.map((p) => mail(p.email, m, false)), `tl-message-${id}-batch-${i / 100}`);
    if (res.ok) {
      sentNow += chunk.length; const at = new Date().toISOString();
      await Promise.all(chunk.map((p, j) => svc.from('message_recipients').update({ delivered_at: at, provider_id: res.ids[j] ?? null, error: null }).eq('message_id', id).eq('profile_id', p.id).eq('channel', 'email')));
    } else {
      failed += chunk.length; errors.push(res.error);
      await svc.from('message_recipients').update({ error: res.error }).eq('message_id', id).in('profile_id', chunk.map((p) => p.id)).eq('channel', 'email');
    }
  }
  await pool(texts, 8, async (p) => {   // Twilio queues what it accepts and paces it out at the number's rate
    const res = await twilioSend(p.phone, sms);
    const row = svc.from('message_recipients');
    if (res.ok) { sentNow++; await row.update({ delivered_at: new Date().toISOString(), provider_id: res.sid, status: res.status, error: null }).eq('message_id', id).eq('profile_id', p.id).eq('channel', 'text'); }
    else {
      failed++; errors.push(res.error);
      await row.update({ error: res.error, status: 'failed' }).eq('message_id', id).eq('profile_id', p.id).eq('channel', 'text');
      if (res.code === 21610) await svc.from('profiles').update({ phone_opt_in: false }).eq('id', p.id);   // Twilio has them as STOPped: mirror it
    }
  });

  const { count: total } = await svc.from('message_recipients').select('*', { count: 'exact', head: true }).eq('message_id', id).not('delivered_at', 'is', null);
  if (!total) return fail(errors[0] ?? 'Nothing was sent.', 502);
  await svc.from('messages').update({ state: 'sent', sent_at: new Date().toISOString(), sent_count: total, failed_count: failed, last_error: errors[0] ?? null }).eq('id', id);
  return { status: 200, body: { sent: total, sentNow, failed, error: errors[0] ?? null, emails: to.email.length, texts: to.text.length } };
}

/** Twilio calling in: delivery reports and replies. Always answers 200 with empty TwiML once the signature checks out. */
async function fromTwilio(req: Request, kind: string, svc: SupabaseClient) {
  const params = new URLSearchParams(await req.text());
  if (!(await twilioSigned(req, params))) return new Response('forbidden', { status: 403 });
  const twiml = () => new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', { headers: { 'Content-Type': 'text/xml' } });
  if (kind === 'status') {
    const sid = params.get('MessageSid') ?? params.get('SmsSid'); const status = STATUS[params.get('MessageStatus') ?? params.get('SmsStatus') ?? ''];
    if (!sid || !status) return twiml();
    const code = Number(params.get('ErrorCode')) || null;
    let q = svc.from('message_recipients').update({ status, ...(status === 'undelivered' || status === 'failed' ? { error: twilioError(code, 'The carrier didn’t deliver it') } : {}) }).eq('provider_id', sid).eq('channel', 'text');
    if (status === 'queued' || status === 'sent') q = q.or('status.is.null,status.in.(queued,sent)');   // reports can arrive out of order: never step back from a final outcome
    const { data } = await q.select('profile_id');
    if (code === 21610) for (const r of data ?? []) await svc.from('profiles').update({ phone_opt_in: false }).eq('id', r.profile_id);
    return twiml();
  }
  if (kind === 'inbound') {
    const from = params.get('From') ?? ''; const word = (params.get('Body') ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    const optType = (params.get('OptOutType') ?? '').toUpperCase();   // set when Twilio's Advanced Opt-Out handled the keyword
    if (optType === 'STOP' || OPT_OUT.has(word)) await svc.from('profiles').update({ phone_opt_in: false }).eq('phone', from);
    else if (optType === 'START' || OPT_IN.has(word)) await svc.from('profiles').update({ phone_opt_in: true }).eq('phone', from);
    return twiml();   // Twilio itself sends the standard STOP / START / HELP replies
  }
  return new Response('unknown', { status: 400 });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const fromTw = new URL(req.url).searchParams.get('twilio');
  if (fromTw) return fromTwilio(req, fromTw, svc);
  const input = await req.json().catch(() => ({})) as { mode?: string; messageId?: number; ids?: string[]; profileId?: string; dry?: boolean };
  const cfg = config(); const tw = twilio();

  // the database's five-minute job: send whatever scheduled message is due
  if (input.mode === 'due') {
    const secret = Deno.env.get('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);
    const { data: due } = await svc.from('messages').select('id').eq('state', 'scheduled').lte('scheduled_for', new Date().toISOString()).order('scheduled_for');
    const results = [];
    for (const { id } of due ?? []) results.push({ id, ...(await deliver(svc, id, null, { email: null, phone: null })).body });   // a channel that isn't connected sends it back to drafts with the reason
    return json({ due: results.length, results });
  }

  // everything else: a signed-in admin
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  // CONFIRMATION TEXTS (2026-10-06). 'welcome-text': texts just turned on, so the campaign's registered opt-in message.
  // 'optout-text': texts just turned off ON THE WEBSITE, so one message saying so and how to turn them back on (a single
  // confirmation after an opt-out is allowed; a STOP reply gets Twilio's own registered reply, never this). The member
  // (or an admin for them) asks right after saving; only that profile's own number; once per number per kind per day,
  // at most 3 a day. Test accounts never get a real text: the body comes back instead.
  if (input.mode === 'welcome-text' || input.mode === 'optout-text') {
    const welcome = input.mode === 'welcome-text'; const event = welcome ? 'texts_welcome' : 'texts_goodbye'; const body = straighten(welcome ? WELCOME_TEXT : GOODBYE_TEXT);
    const { data: { user: caller } } = await user.auth.getUser(); if (!caller) return json({ error: 'sign in first' }, 401);
    const target = typeof input.profileId === 'string' && input.profileId !== caller.id ? input.profileId : caller.id;
    if (target !== caller.id) { const { data: adm } = await user.rpc('is_admin'); if (!adm) return json({ error: 'admins only' }, 403); }
    const { data: p } = await svc.from('profiles').select('phone, phone_opt_in, is_test').eq('id', target).maybeSingle();
    if (!p?.phone) return json({ sent: false, reason: 'no number' });
    if (welcome ? !p.phone_opt_in : p.phone_opt_in) return json({ sent: false, reason: welcome ? 'texts are off' : 'texts are on' });
    const { data: recent } = await svc.from('profile_events').select('detail').eq('profile_id', target).eq('event', event).gte('at', new Date(Date.now() - 24 * 3600_000).toISOString());
    if ((recent ?? []).some((e) => e.detail?.phone === p.phone && (e.detail?.ok || e.detail?.test))) return json({ sent: false, reason: 'already sent to this number today' });
    if ((recent ?? []).length >= 3) return json({ sent: false, reason: 'too many tries today' });
    if (p.is_test) { await svc.from('profile_events').insert({ profile_id: target, event, actor: caller.id, detail: { phone: p.phone, test: true } }); return json({ sent: false, test: true, body }); }
    if (!twilio().configured) return json({ sent: false, reason: 'texts aren’t connected yet' });
    const r = await twilioSend(p.phone, body);
    await svc.from('profile_events').insert({ profile_id: target, event, actor: caller.id, detail: { phone: p.phone, ok: r.ok, ...(r.ok ? { sid: r.sid } : { error: r.error, code: r.code }) } });
    // 21610: this phone replied STOP earlier, so the carrier blocks us until it texts START (ticking the box isn't enough)
    return json(r.ok ? { sent: true } : { sent: false, error: r.error, code: r.code, from: twilio().from });
  }

  const { data: isAdmin } = await user.rpc('is_admin');
  if (!isAdmin) return json({ error: 'admins only' }, 403);
  const { data: { user: authUser } } = await user.auth.getUser();
  const { data: myRow } = await svc.from('profiles').select('personal_email, usc_email, phone').eq('id', authUser!.id).single();
  const me = { email: (myRow?.personal_email || myRow?.usc_email || authUser?.email || '').toLowerCase() || null, phone: myRow?.phone ?? null };

  // TEXTS TURNED ON BEFORE TEXTS WORKED (2026-10-06): those members never got the welcome. Admin › Messages lists them
  // (dry) and sends it to each once. Same world rule as group sends (a test admin only reaches test accounts, never
  // texted for real); group-text hours apply.
  if (input.mode === 'welcome-backlog') {
    const { data: meRow } = await svc.from('profiles').select('is_test').eq('id', authUser!.id).maybeSingle(); const testWorld = Boolean(meRow?.is_test);
    const { data: list } = await svc.from('profiles').select('id, full_name, phone').eq('approved', true).eq('phone_opt_in', true).not('phone', 'is', null).eq('is_test', testWorld);
    const { data: done } = await svc.from('profile_events').select('profile_id, detail').eq('event', 'texts_welcome');
    const welcomed = new Set((done ?? []).filter((e) => e.detail?.ok || e.detail?.test).map((e) => `${e.profile_id}|${e.detail?.phone}`));
    const todo = (list ?? []).filter((p) => !welcomed.has(`${p.id}|${p.phone}`));
    if (input.dry) return json({ people: todo.map((p) => ({ id: p.id, name: p.full_name, phone: p.phone })) });
    if (!testWorld && !tw.configured) return json({ error: 'Texts aren’t connected yet.' }, 503);
    if (!testWorld && !textingHours()) return json({ error: 'Group texts only go out between 8 AM and 9 PM Pacific.' }, 400);
    const body = straighten(WELCOME_TEXT); let sent = 0; const errors: string[] = [];
    for (const p of todo) {
      if (testWorld) { await svc.from('profile_events').insert({ profile_id: p.id, event: 'texts_welcome', actor: authUser!.id, detail: { phone: p.phone, test: true, backlog: true } }); sent++; continue; }
      const r = await twilioSend(p.phone!, body);
      await svc.from('profile_events').insert({ profile_id: p.id, event: 'texts_welcome', actor: authUser!.id, detail: { phone: p.phone, ok: r.ok, backlog: true, ...(r.ok ? { sid: r.sid } : { error: r.error, code: r.code }) } });
      if (r.ok) sent++; else errors.push(r.error);
    }
    return json({ sent, failed: errors.length, error: errors[0] ?? null, test: testWorld || undefined });
  }

  // APPROVE pressed on Admin › Members: tell each newly approved person they're in (one call for one person or a hundred)
  if (input.mode === 'approved') {
    const ids = [...new Set((input.ids ?? []).filter((x) => typeof x === 'string'))].slice(0, 500);
    if (!ids.length) return json({ sent: 0 });
    // the "you're in" text (2026-10-06): texts switch on at sign-up, but the first one goes out on approval. Only to
    // people with texts on; once per number (an UNDO and re-approve doesn't text twice); test accounts never for real.
    let texted = 0;
    const { data: textable } = await svc.from('profiles').select('id, phone, is_test').in('id', ids).eq('approved', true).eq('phone_opt_in', true).not('phone', 'is', null);
    const { data: before } = await svc.from('profile_events').select('profile_id, detail').eq('event', 'texts_welcome').in('profile_id', ids);
    const had = new Set((before ?? []).filter((e) => e.detail?.ok || e.detail?.test).map((e) => `${e.profile_id}|${e.detail?.phone}`));
    for (const p of (textable ?? []).filter((x) => !had.has(`${x.id}|${x.phone}`))) {
      if (p.is_test) { await svc.from('profile_events').insert({ profile_id: p.id, event: 'texts_welcome', actor: authUser!.id, detail: { phone: p.phone, test: true, approved: true } }); texted++; continue; }
      if (!tw.configured) break;
      const r = await twilioSend(p.phone!, straighten(APPROVED_TEXT));
      await svc.from('profile_events').insert({ profile_id: p.id, event: 'texts_welcome', actor: authUser!.id, detail: { phone: p.phone, ok: r.ok, approved: true, ...(r.ok ? { sid: r.sid } : { error: r.error, code: r.code }) } });
      if (r.ok) texted++;
    }
    if (!cfg.key) return json({ configured: false, texted, error: 'Email isn’t connected yet: the Resend key hasn’t been added.' }, 503);
    const { data: people, error } = await svc.from('profiles').select('id, full_name, personal_email, usc_email, approved').in('id', ids).eq('approved', true);
    if (error) return json({ error: error.message }, 500);
    const list: { id: string; to: string; name: string }[] = [];
    for (const p of people ?? []) {
      let to = (p.personal_email || p.usc_email || '').trim();
      if (!to) { const { data: u } = await svc.auth.admin.getUserById(p.id); to = u?.user?.email ?? ''; }
      if (to && deliverable(to)) list.push({ id: p.id, to, name: p.full_name });
    }
    let sent = 0; const errors: string[] = [];
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chunk.map((c) => c.id).sort().join(','))))).map((b) => b.toString(16).padStart(2, '0')).join('');
      const res = await resendBatch(chunk.map((c) => approvedMail(c.to, c.name)), `tl-approved-${digest}`);   // the same approval retried can't email anyone twice
      if (res.ok) sent += chunk.length; else errors.push(res.error);
    }
    return errors.length && !sent ? json({ sent, texted, error: errors[0] }, 502) : json({ sent, texted, skipped: ids.length - list.length, error: errors[0] ?? null });
  }
  // READ-ONLY (2026-10-06): the A2P registration as Twilio has it (campaign status, Twilio's rejection reasons, what was
  // submitted), so a rejection can be fixed from its real reasons. Admins only; nothing is changed or sent.
  if (input.mode === 'twilio-compliance') {
    if (!tw.configured) return json({ error: 'texts not connected' }, 503);
    const get = async (u: string) => { const r = await fetch(u, { headers: { Authorization: `Basic ${btoa(`${tw.sid}:${tw.token}`)}` } }); return r.json().catch(() => ({})); };
    const services = (await get('https://messaging.twilio.com/v1/Services?PageSize=50')).services ?? [];
    const out = [];
    for (const sv of services) {
      const camps = (await get(`https://messaging.twilio.com/v1/Services/${sv.sid}/Compliance/Usa2p`)).compliance ?? [];
      out.push({ service: sv.friendly_name, inbound: sv.inbound_request_url, useInboundWebhookOnNumber: sv.use_inbound_webhook_on_number, campaigns: camps.map((c: Record<string, unknown>) => ({ status: c.campaign_status, errors: c.errors, use_case: c.us_app_to_person_usecase, description: c.description, message_flow: c.message_flow, samples: c.message_samples, has_links: c.has_embedded_links, opt_in_message: c.opt_in_message, privacy: c.privacy_policy_url, terms: c.terms_and_conditions_url, created: c.date_created, updated: c.date_updated })) });
    }
    const brands = ((await get('https://messaging.twilio.com/v1/a2p/BrandRegistrations')).data ?? []).map((b: Record<string, unknown>) => ({ status: b.status, type: b.brand_type, failure: b.failure_reason, errors: b.errors }));
    return json({ services: out, brands });
  }
  if (input.mode === 'status') {
    const acct = tw.configured ? await twilioAccount() : null;
    return json({
      email: { configured: Boolean(cfg.key), from: cfg.from, testMode: cfg.testMode, testTo: me.email },
      text: { configured: tw.configured && !acct?.error, from: tw.from || null, trial: acct?.trial ?? false, error: acct?.error ?? null, testTo: me.phone, hoursOpen: textingHours() },
    });
  }

  const { data: msg } = await svc.from('messages').select('*').eq('id', input.messageId ?? -1).maybeSingle();
  if (!msg) return json({ error: 'Message not found. Save it first.' }, 404);
  const m = msg as Msg; const want = channelsOf(m);

  if (input.mode === 'preview') { const to = await recipientsFor(svc, m, authUser!.id); const sms = smsBody(m.body, m.event); return json({ recipients: to.email, textRecipients: to.text, ...render(m, false), sms, smsSize: segments(sms) }); }

  if (input.mode === 'test') {
    if (!m.title?.trim() || !m.body?.trim()) return json({ error: 'Add a subject and a message first.' }, 400);
    if (want.includes('email') && !cfg.key) return json({ error: 'Email isn’t connected yet: the Resend key hasn’t been added.' }, 503);
    if (want.includes('text') && !tw.configured) return json({ error: 'Texts aren’t connected yet: the Twilio keys haven’t been added.' }, 503);
    if (want.includes('email') && !me.email) return json({ error: 'Your profile has no email to send the test to.' }, 400);
    if (want.includes('text') && !me.phone) return json({ error: 'Add your phone number on your profile first. To try texts before the TroyLabs number is verified, put in Twilio’s Virtual Phone number, +1 877 780 4236, and watch it in the Twilio console.' }, 400);
    const sms = smsBody(m.body, m.event, true);
    if (want.includes('text') && sms.length > SMS_MAX) return json({ error: `Too long for a text: ${sms.length} characters, and the limit is ${SMS_MAX}.` }, 400);
    const out: Record<string, unknown> = {}; const errs: string[] = [];
    if (want.includes('email')) { const res = await resendBatch([mail(me.email!, m, true)], `tl-test-${m.id}-${crypto.randomUUID()}`); if (res.ok) out.email = me.email; else errs.push(cfg.testMode ? `${res.error}. In test mode Resend only delivers to the email you signed up to Resend with; make sure that's ${me.email}.` : res.error); }
    if (want.includes('text')) { const res = await twilioSend(me.phone!, sms); if (res.ok) { out.text = me.phone; out.textSid = res.sid; } else errs.push(`Text: ${res.error}.`); }
    return errs.length ? json({ ...out, error: errs.join(' ') }, 502) : json(out);
  }
  if (input.mode === 'send') { const r = await deliver(svc, m.id, authUser!.id, me); return json(r.body, r.status); }
  return json({ error: 'unknown mode' }, 400);
});
