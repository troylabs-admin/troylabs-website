/**
 * Several email addresses per account (2026-10-05): sign in with your USC or your personal address, and an address
 * only counts once its owner clicks a confirmation link (the GitHub / Google pattern). See
 * supabase/migrations/20261005000400_account_emails.sql for why (one member could block another's sign-up).
 *
 * Modes (POST JSON):
 *   sign-in { email, origin }  anyone. A confirmed extra address of an account → email a sign-in link FOR that account
 *                              TO this address and answer { sent: true }. Anything else → { otp: true }: the page asks
 *                              Supabase for its usual link (so a new address still creates an account, as before).
 *   add     { kind, email, origin }   signed in. kind 'usc' | 'personal'. Your own sign-in address or one already
 *                              confirmed is saved at once ({ saved: true }); a new one gets a confirmation link
 *                              ({ pending: true }). Taken by another account → 409.
 *   confirm { token }          anyone holding the link (it may open in another browser): records the address.
 *   remove  { kind }           signed in: takes the address off the profile and off sign-in.
 *   add / remove with { user_id } by an ADMIN (2026-10-06, Bryan: "let the admin be able to edit anything"): acts on
 *                              that member, saved straight away (no confirmation email), and recorded in their timeline
 *                              (profile_events 'admin_edit', actor = the admin). An address on another account is still refused.
 * With the service-role key as the bearer (tests only), `dry: true` returns the link instead of emailing it.
 *
 * Mail goes through Resend like every other TroyLabs email; test domains (example.com, .test) are never mailed.
 * Rate limits: 3 sign-in links per address per 10 minutes, 5 confirmation links per account per hour.
 * Secrets: RESEND_API_KEY, RESEND_FROM, REPLY_TO.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SITE = 'https://usctroylabs.com';
const ORIGINS = [SITE, 'https://www.usctroylabs.com', 'https://troylabs.vercel.app', 'http://localhost:4321', 'http://localhost:4399', 'http://127.0.0.1:4321', 'http://127.0.0.1:4399'];
const originOf = (o: unknown) => (typeof o === 'string' && ORIGINS.includes(o) ? o : SITE);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const deliverable = (to: string) => !/@(example\.(com|org|net)|[^@\s]+\.(test|invalid|example|localhost))$/i.test(to.trim());
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join('');
const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ── mail (same look as the approval email in send-message) ──────────────────────────────────────
const LOGO = `<img src="${SITE}/email/troylabs-wordmark.png" width="200" height="38" alt="TROYLABS" style="display:block;border:0;outline:none;width:200px;height:auto;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#0a0a0a">`;
function letter(to: string, subject: string, heading: string, body: string, button: string, href: string, footnote: string) {
  const from = Deno.env.get('RESEND_FROM') || 'TroyLabs <onboarding@resend.dev>', replyTo = Deno.env.get('REPLY_TO') || 'troylabs@usc.edu'; const font = 'font-family:Helvetica,Arial,sans-serif';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f3f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f3"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#ffffff;border-radius:14px">
<tr><td style="padding:28px 32px 6px">${LOGO}</td></tr>
<tr><td style="padding:16px 32px 0;${font};font-size:20px;font-weight:700;color:#0a0a0a">${esc(heading)}</td></tr>
<tr><td style="padding:10px 32px 0;${font};font-size:15px;line-height:1.6;color:#1a1a1a">${esc(body)}</td></tr>
<tr><td style="padding:22px 32px 4px"><a href="${esc(href)}" style="display:inline-block;background:#ff7d2c;color:#0a0a0a;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:1.5px;padding:13px 24px;border-radius:999px;${font}">${esc(button)}</a></td></tr>
<tr><td style="padding:24px 32px 26px;${font};font-size:12px;line-height:1.5;color:#888"><div style="border-top:1px solid #eeeeee;padding-top:16px">${esc(footnote)}</div></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${heading}\n\n${body}\n\n${button}: ${href}\n\n—\n${footnote}`;
  return { from, to: [to], reply_to: replyTo, subject, html, text };
}
async function send(mail: ReturnType<typeof letter>): Promise<string | null> {
  const key = Deno.env.get('RESEND_API_KEY'); if (!key) return 'email is not connected';
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(mail) });
  if (r.ok) return null; const b = await r.json().catch(() => ({})); return `Resend ${r.status}: ${b?.message ?? 'request failed'}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const input = await req.json().catch(() => ({})) as { mode?: string; email?: string; kind?: string; token?: string; origin?: string; dry?: boolean; user_id?: string };
  const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  // tests only: with a service-role key (either key format) the link comes back instead of being emailed. A key is
  // service-role if it can make an admin-only call; anything else is refused that power.
  const isServiceKey = async (k: string) => { if (k === serviceKey) return true; if (!k || k.split('.').length !== 3 && !k.startsWith('sb_secret_')) return false; const { error } = await createClient(url, k, { auth: { persistSession: false } }).auth.admin.listUsers({ page: 1, perPage: 1 }); return !error; };
  const dry = input.dry === true && await isServiceKey(bearer);
  const origin = originOf(input.origin);
  const recent = async (col: 'email' | 'user_id', v: string, purpose: string, minutes: number) => (await svc.from('email_sends').select('id', { count: 'exact', head: true }).eq(col, v).eq('purpose', purpose).gte('sent_at', new Date(Date.now() - minutes * 60_000).toISOString())).count ?? 0;

  try {
    // ── sign in with a confirmed extra address ─────────────────────────────────────────────────
    if (input.mode === 'sign-in') {
      const email = (input.email ?? '').trim().toLowerCase(); if (!EMAIL.test(email)) return json({ error: 'not an email address' }, 400);
      const { data: link } = await svc.from('account_emails').select('user_id').eq('email', email).maybeSingle();
      if (!link) return json({ otp: true });
      if (!dry && (await recent('email', email, 'sign-in', 10)) >= 3) return json({ error: 'Too many sign-in emails just now. Wait a few minutes and try again.' }, 429);
      const { data: u, error: ue } = await svc.auth.admin.getUserById(link.user_id); if (ue || !u.user?.email) throw ue ?? new Error('account not found');
      const { data: g, error: ge } = await svc.auth.admin.generateLink({ type: 'magiclink', email: u.user.email, options: { redirectTo: `${origin}/alumni-portal/home` } }); if (ge) throw ge;
      const href = g.properties.action_link;
      if (dry) return json({ sent: true, link: href });
      await svc.from('email_sends').insert({ email, user_id: link.user_id, purpose: 'sign-in' });
      if (deliverable(email)) { const err = await send(letter(email, 'Your TroyLabs sign-in link', 'Sign in to the TL Alumni Network', 'Use the button below to sign in. This address is linked to your TroyLabs account, so it opens the same profile as your other address.', 'SIGN IN', href, "Didn't ask to sign in? You can ignore this email; nobody can sign in without this link.")); if (err) return json({ error: err }, 502); }
      return json({ sent: true });
    }

    // ── open a confirmation link (no session needed: it may open in another browser) ───────────
    if (input.mode === 'confirm') {
      if (!input.token || input.token.length < 20) return json({ ok: false, reason: 'unknown' });
      const { data, error } = await svc.rpc('confirm_account_email', { p_hash: await sha256(input.token) }); if (error) throw error;
      return json(data);
    }

    // ── the rest is for the signed-in member (or a test acting for one) ────────────────────────
    let userId: string, authEmail: string, actingAdmin: string | null = null;
    if (dry && input.user_id) { const { data: u } = await svc.auth.admin.getUserById(input.user_id); if (!u.user) return json({ error: 'no such user' }, 404); userId = u.user.id; authEmail = u.user.email ?? ''; }
    else {
      const { data: u } = await svc.auth.getUser(bearer); if (!u.user) return json({ error: 'sign in first' }, 401); userId = u.user.id; authEmail = u.user.email ?? '';
      if (input.user_id && input.user_id !== userId) {   // an admin editing someone else
        const { data: isAdmin } = await svc.from('admins').select('user_id').eq('user_id', userId).maybeSingle(); if (!isAdmin) return json({ error: 'admins only' }, 403);
        const { data: t } = await svc.auth.admin.getUserById(input.user_id); if (!t.user) return json({ error: 'no such member' }, 404);
        actingAdmin = userId; userId = t.user.id; authEmail = t.user.email ?? '';
      }
    }
    const logAdmin = async (field: string, removed = false) => { if (actingAdmin) await svc.from('profile_events').insert({ profile_id: userId, event: 'admin_edit', actor: actingAdmin, detail: { fields: [field], ...(removed ? { removed: true } : {}) } }); };
    const kind = input.kind === 'usc' ? 'usc' : input.kind === 'personal' ? 'personal' : null;
    if (!kind) return json({ error: 'kind must be usc or personal' }, 400);
    const column = kind === 'usc' ? 'usc_email' : 'personal_email';

    if (input.mode === 'remove') {
      await svc.from('account_emails').delete().eq('user_id', userId).eq('kind', kind);
      const { error } = await svc.from('profiles').update({ [column]: null }).eq('id', userId); if (error) throw error;
      await logAdmin(column, true);
      return json({ removed: true });
    }

    if (input.mode === 'add') {
      const email = (input.email ?? '').trim().toLowerCase(); if (!EMAIL.test(email)) return json({ error: 'That doesn’t look like an email address.' }, 400);
      if (kind === 'usc' && !/@(?:[a-z0-9-]+\.)*usc\.edu$/.test(email)) return json({ error: 'A USC email ends in @usc.edu.' }, 400);
      const { data: taken, error: te } = await svc.rpc('email_taken', { addr: email, me: userId }); if (te) throw te;
      if (taken) return json({ error: 'That address is already on another TroyLabs account. If it’s yours, sign in with it, or write to troylabs@usc.edu.' }, 409);
      // already proven: your sign-in address, or one you confirmed before → save straight away
      const { data: mine } = await svc.from('account_emails').select('kind').eq('user_id', userId).eq('email', email).maybeSingle();
      if (email === authEmail.toLowerCase() || mine || actingAdmin) {
        if (mine && mine.kind !== kind) await svc.from('account_emails').update({ kind }).eq('user_id', userId).eq('email', email);
        else if (!mine && actingAdmin && email !== authEmail.toLowerCase()) {   // an admin's word stands for the confirmation: it becomes a sign-in address now
          await svc.from('account_emails').delete().eq('user_id', userId).eq('kind', kind);
          const { error: ae } = await svc.from('account_emails').insert({ email, user_id: userId, kind }); if (ae) throw ae;
        }
        const { error: pe } = await svc.from('profiles').update({ [column]: email }).eq('id', userId); if (pe) throw pe;
        await logAdmin(column);
        return json({ saved: true });
      }
      if (!dry && (await recent('user_id', userId, 'confirm', 60)) >= 5) return json({ error: 'Too many confirmation emails in the last hour. Try again later.' }, 429);
      const t = token();
      await svc.from('email_confirmations').delete().eq('user_id', userId).eq('kind', kind).is('used_at', null);
      const { error: ie } = await svc.from('email_confirmations').insert({ token_hash: await sha256(t), user_id: userId, email, kind, expires_at: new Date(Date.now() + 24 * 3600_000).toISOString() }); if (ie) throw ie;
      const href = `${origin}/alumni-portal/confirm-email#token=${t}`;   // in the #fragment: never sent to a server or logged
      if (dry) return json({ pending: true, link: href, token: t });
      await svc.from('email_sends').insert({ email, user_id: userId, purpose: 'confirm' });
      if (deliverable(email)) { const err = await send(letter(email, 'Confirm your email for the TL Alumni Network', 'Confirm this email address', `Confirm that ${email} is yours to add it to your TL Alumni Network profile. After that you can sign in with it too.`, 'CONFIRM EMAIL', href, "Didn't add this address? Ignore this email and nothing changes. The link expires in 24 hours.")); if (err) return json({ error: err }, 502); }
      return json({ pending: true });
    }
    return json({ error: 'unknown mode' }, 400);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
