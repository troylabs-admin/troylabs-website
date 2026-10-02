/**
 * Email delivery for Admin › Message (2026-10-02). Holds the Resend key, so it runs here and never in the page.
 *
 * Modes (POST JSON):
 *   status                 → is email connected, from which address, and is it still in Resend's test mode
 *   preview { messageId }  → who would get it and the rendered email, nothing sent
 *   test    { messageId }  → sends the message to the calling admin only, subject marked [TEST]
 *   send    { messageId }  → sends it to its audience now, records every recipient
 *   due                    → called by the database every five minutes (shared secret); sends scheduled messages
 * Every mode except `due` requires a signed-in admin (checked through the same row-level security as the site).
 *
 * Recipients: approved members matching the message's channel rule or filters, who have an email on file and
 * haven't turned announcements off. One email per person (nobody sees anyone else's address), up to 100 per
 * Resend batch request, each batch with an idempotency key so a retry can't send twice.
 *
 * Resend test mode: until usctroylabs.com is verified, mail can only come from onboarding@resend.dev and only to
 * the Resend account's own address. In that mode a group send is allowed only when every recipient is the admin
 * sending it, so the whole pipeline can be tried on yourself without anyone else being emailed.
 *
 * Secrets: RESEND_API_KEY (required), RESEND_FROM (default "TroyLabs <onboarding@resend.dev>"),
 * REPLY_TO (default troylabs@usc.edu), CRON_SECRET (set with the migration).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SITE = 'https://usctroylabs.com';

type Rule = Record<string, string | string[]>;
interface Msg { id: number; title: string; body: string; send_by: 'email' | 'text' | 'both'; channel_id: number | null; filters: Rule; event: { name?: string; when?: string | null; where?: string | null; rsvp?: string | null } | null; state: string; scheduled_for: string | null }
interface Person { id: string; full_name: string; status: 'student' | 'alum'; join_term: string | null; join_year: number | null; divisions: string[]; industries: string[]; personal_email: string | null; usc_email: string | null; email_opt_in: boolean; city: { name: string } | null }

// ── who gets it: the same rules the Message page previews with ───────────────────────────────────
const cohortOf = (term: string | null, year: number | null) => (term && year ? `${term}${String(year).slice(2)}` : '');
function matches(p: Person, rule: Rule) {
  return Object.entries(rule ?? {}).every(([k, v]) => {
    const vals = ([] as string[]).concat(v as string | string[]).map((x) => String(x).toUpperCase());
    if (!vals.length) return true;
    if (k === 'status') return vals.some((x) => x.startsWith(p.status.toUpperCase().slice(0, 3)));
    if (k === 'cohort') return vals.includes(cohortOf(p.join_term, p.join_year));
    if (k === 'division' || k === 'divisions') return (p.divisions ?? []).some((d) => vals.includes(d.toUpperCase()) || vals.includes(d.toUpperCase().replace(' MANAGEMENT', '')));
    if (k === 'industry' || k === 'industries') return (p.industries ?? []).some((d) => vals.includes(d.toUpperCase()));
    if (k === 'city') return (p.city?.name ?? '').toUpperCase() === vals[0];
    return true;
  });
}
const emailOf = (p: Person) => (p.personal_email || p.usc_email || '').trim().toLowerCase();
async function recipientsFor(svc: SupabaseClient, m: Msg) {
  let rule: Rule = m.filters ?? {};
  if (m.channel_id) { const { data: ch } = await svc.from('channels').select('rule').eq('id', m.channel_id).single(); rule = (ch?.rule as Rule) ?? {}; }
  const { data, error } = await svc.from('profiles').select('id, full_name, status, join_term, join_year, divisions, industries, personal_email, usc_email, email_opt_in, city:cities(name)').eq('approved', true);
  if (error) throw error;
  const seen = new Set<string>();
  return ((data ?? []) as unknown as Person[])
    .filter((p) => p.email_opt_in !== false && emailOf(p) && matches(p, rule))
    .filter((p) => { const e = emailOf(p); if (seen.has(e)) return false; seen.add(e); return true; })
    .map((p) => ({ id: p.id, name: p.full_name, email: emailOf(p) }));
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
<tr><td style="padding:28px 32px 6px;${font};font-size:13px;font-weight:700;letter-spacing:4px;color:#0a0a0a">TROYLABS</td></tr>
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
    const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(emails) });
    if (r.status === 429 && attempt < 2) { await new Promise((ok) => setTimeout(ok, 1100 * (attempt + 1))); continue; }   // rate limit: back off and retry the same batch (same key, so never twice)
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: `Resend ${r.status}: ${body?.message ?? body?.error ?? 'request failed'}` };
    return { ok: true, ids: (body?.data ?? []).map((d: { id: string }) => d.id) };
  }
  return { ok: false, error: 'Resend kept rate-limiting the request' };
}
const mail = (to: string, m: Msg, test: boolean) => { const { from, replyTo } = config(); const { html, text } = render(m, test); return { from, to: [to], reply_to: replyTo, subject: test ? `[TEST] ${m.title}` : m.title, html, text }; };

/** send one message to its audience; the state change to `sending` is the lock against a double send */
async function deliver(svc: SupabaseClient, id: number, by: string | null, callerEmail: string | null) {
  const { testMode } = config();
  const { data: claimed } = await svc.from('messages').update({ state: 'sending', sent_by: by, last_error: null }).eq('id', id).in('state', ['draft', 'scheduled']).select().maybeSingle();
  if (!claimed) return { status: 409, body: { error: 'This message is already sent or being sent.' } };
  const m = claimed as Msg; const back = m.scheduled_for ? 'scheduled' : 'draft';
  const fail = async (error: string, status = 400) => { await svc.from('messages').update({ state: back === 'scheduled' && by === null ? 'draft' : back, last_error: error }).eq('id', id); return { status, body: { error } }; };
  if (!m.title?.trim()) return fail('Add a subject before sending.');
  if (!m.body?.trim()) return fail('The message is empty.');
  if (m.send_by === 'text') return fail('Texts aren’t connected yet. Choose EMAIL (or EMAIL + TEXT, which sends the email part) to send now.');
  const people = await recipientsFor(svc, m);
  if (!people.length) return fail('Nobody matches this audience (or everyone in it has turned announcements off).');
  if (testMode && people.some((p) => p.email !== callerEmail)) return fail(`Email is still in Resend's test mode, so it can only go to you. ${people.length} ${people.length === 1 ? 'person' : 'people'} match this audience. Group sends start once usctroylabs.com is verified in Resend; until then use SEND A TEST TO ME.`);
  await svc.from('message_recipients').delete().eq('message_id', id);
  await svc.from('message_recipients').insert(people.map((p) => ({ message_id: id, profile_id: p.id, channel: 'email', email: p.email })));
  let sent = 0, failed = 0; const errors: string[] = [];
  for (let i = 0; i < people.length; i += 100) {
    const chunk = people.slice(i, i + 100);
    const res = await resendBatch(chunk.map((p) => mail(p.email, m, false)), `tl-message-${id}-batch-${i / 100}`);
    if (res.ok) {
      sent += chunk.length; const at = new Date().toISOString();
      await Promise.all(chunk.map((p, j) => svc.from('message_recipients').update({ delivered_at: at, provider_id: res.ids[j] ?? null, error: null }).eq('message_id', id).eq('profile_id', p.id).eq('channel', 'email')));
    } else {
      failed += chunk.length; errors.push(res.error);
      await svc.from('message_recipients').update({ error: res.error }).eq('message_id', id).in('profile_id', chunk.map((p) => p.id)).eq('channel', 'email');
    }
  }
  if (!sent) return fail(errors[0] ?? 'Nothing was sent.', 502);
  await svc.from('messages').update({ state: 'sent', sent_at: new Date().toISOString(), sent_count: sent, failed_count: failed, last_error: errors[0] ?? null }).eq('id', id);
  return { status: 200, body: { sent, failed, error: errors[0] ?? null, textsSkipped: m.send_by === 'both' } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const input = await req.json().catch(() => ({})) as { mode?: string; messageId?: number };
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const cfg = config();

  // the database's five-minute job: send whatever scheduled message is due
  if (input.mode === 'due') {
    const secret = Deno.env.get('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);
    const { data: due } = await svc.from('messages').select('id').eq('state', 'scheduled').lte('scheduled_for', new Date().toISOString()).order('scheduled_for');
    const results = [];
    for (const { id } of due ?? []) {
      if (!cfg.key) { await svc.from('messages').update({ state: 'draft', last_error: 'Email wasn’t connected when this was due, so it went back to drafts.' }).eq('id', id); results.push({ id, error: 'not connected' }); continue; }
      results.push({ id, ...(await deliver(svc, id, null, null)).body });
    }
    return json({ due: results.length, results });
  }

  // everything else: a signed-in admin
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const { data: isAdmin } = await user.rpc('is_admin');
  if (!isAdmin) return json({ error: 'admins only' }, 403);
  const { data: { user: me } } = await user.auth.getUser();
  const { data: myRow } = await svc.from('profiles').select('personal_email, usc_email').eq('id', me!.id).single();
  const myEmail = (myRow?.personal_email || myRow?.usc_email || me?.email || '').toLowerCase();

  if (input.mode === 'status') return json({ configured: Boolean(cfg.key), from: cfg.from, testMode: cfg.testMode, testTo: myEmail });

  const { data: msg } = await svc.from('messages').select('*').eq('id', input.messageId ?? -1).maybeSingle();
  if (!msg) return json({ error: 'Message not found. Save it first.' }, 404);
  const m = msg as Msg;

  if (input.mode === 'preview') { const people = await recipientsFor(svc, m); return json({ configured: Boolean(cfg.key), testMode: cfg.testMode, recipients: people, ...render(m, false) }); }
  if (!cfg.key) return json({ configured: false, error: 'Email isn’t connected yet: the Resend key hasn’t been added.' }, 503);

  if (input.mode === 'test') {
    if (!m.title?.trim() || !m.body?.trim()) return json({ error: 'Add a subject and a message first.' }, 400);
    if (!myEmail) return json({ error: 'Your profile has no email to send the test to.' }, 400);
    const res = await resendBatch([mail(myEmail, m, true)], `tl-test-${m.id}-${crypto.randomUUID()}`);
    return res.ok ? json({ sent: 1, to: myEmail, testMode: cfg.testMode }) : json({ error: cfg.testMode ? `${res.error}. In test mode Resend only delivers to the email you signed up to Resend with; make sure that's ${myEmail}.` : res.error }, 502);
  }
  if (input.mode === 'send') { const r = await deliver(svc, m.id, me!.id, myEmail); return json(r.body, r.status); }
  return json({ error: 'unknown mode' }, 400);
});
