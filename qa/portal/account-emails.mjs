// Several emails per account (2026-10-05). Before: a member could type someone else's address onto their profile and
// that person's sign-up failed ("Database error saving new user"; reproduced). Now an address counts only once its
// owner confirms it by email, a confirmed address signs in to the same account, and nothing anyone types can block a
// sign-up. Temporary example.com accounts only (never mailed); all removed.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage, sql } from './helpers.mjs';

const admin = adminClient(); const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321';
const FN = 'https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/account-email';
const serviceKey = admin.supabaseKey ?? admin['supabaseKey'];
const call = async (body, bearer) => { const r = await fetch(FN, { method: 'POST', headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: base, ...body }) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
const as = (u, body) => call(body, u.session.access_token);
const dry = (body) => call({ ...body, dry: true }, serviceKey);
const addr = (tag) => `tl-qa-${tag}-${crypto.randomUUID().slice(0, 8)}@example.com`;
const profile = async (id) => (await admin.from('profiles').select('usc_email, personal_email').eq('id', id).single()).data;
const linked = async (email) => (await admin.from('account_emails').select('user_id, kind').eq('email', email).maybeSingle()).data;
/** who a sign-in link signs in: follow it without a browser and read the session it hands back */
const whoseLink = async (link) => { const r = await fetch(link, { redirect: 'manual' }); const at = new URLSearchParams((r.headers.get('location') ?? '').split('#')[1] ?? '').get('access_token'); return at ? JSON.parse(Buffer.from(at.split('.')[1], 'base64url').toString()).sub : null; };
const users = []; const extra = []; let browser;
const signUp = async (email) => { const { data, error } = await admin.auth.admin.generateLink({ type: 'signup', email, password: crypto.randomUUID() }); if (data?.user) extra.push(data.user.id); return error ? error.message : 'created'; };

try {
  assert.ok(serviceKey, 'service key available to the test');
  const ana = await makeUser(admin, 'Ana Emails QA'); users.push(ana);
  const ben = await makeUser(admin, 'Ben Emails QA'); users.push(ben);

  // ── the original bug: nobody can block someone else's sign-up ────────────────────────────────
  const victim = addr('victim');
  const direct = await ana.sb.from('profiles').update({ personal_email: victim }).eq('id', ana.id).select('personal_email');
  assert.ok(direct.error || !direct.data?.length, 'a member can no longer write an address onto their profile directly');
  assert.notEqual((await profile(ana.id)).personal_email, victim);
  const directUsc = await ana.sb.from('profiles').update({ usc_email: 'tl-qa-squat@usc.edu' }).eq('id', ana.id).select('usc_email');
  assert.ok(directUsc.error || !directUsc.data?.length, 'nor a USC address');
  // even an address already sitting on someone's profile (an admin could put one there) doesn't block its owner
  await admin.from('profiles').update({ personal_email: victim }).eq('id', ben.id);
  assert.equal(await signUp(victim), 'created', 'the owner of an address on someone else\'s profile can still sign up');
  await admin.from('profiles').update({ personal_email: ben.email }).eq('id', ben.id);
  console.log('PASS: the bug — members can\'t write addresses directly, and an address on another profile never blocks a sign-up');

  // ── add → confirm ─────────────────────────────────────────────────────────────────────────────
  const anaPersonal = addr('ana-personal');
  const add = await dry({ mode: 'add', kind: 'personal', email: anaPersonal, user_id: ana.id });
  assert.equal(add.pending, true, 'a new address waits for confirmation'); assert.ok(add.token && add.link.includes('#token='), 'the link carries the token in the #fragment');
  assert.notEqual((await profile(ana.id)).personal_email, anaPersonal, 'not on the profile before it is confirmed');
  assert.equal(await linked(anaPersonal), null, 'and it can\'t sign in yet');
  assert.deepEqual(await call({ mode: 'confirm', token: 'x'.repeat(43) }), { status: 200, ok: false, reason: 'unknown' }, 'a made-up token does nothing');
  const ok = await call({ mode: 'confirm', token: add.token });
  assert.equal(ok.ok, true, `confirms: ${JSON.stringify(ok)}`); assert.equal((await profile(ana.id)).personal_email, anaPersonal, 'now on the profile');
  assert.equal((await linked(anaPersonal))?.user_id, ana.id, 'and linked for sign-in');
  assert.equal((await call({ mode: 'confirm', token: add.token })).reason, 'used', 'a link works once');
  console.log('PASS: add → confirm — pending until the link is clicked; the link works once; a made-up token does nothing');

  // ── sign in with the confirmed address ───────────────────────────────────────────────────────
  const s = await dry({ mode: 'sign-in', email: anaPersonal });
  assert.equal(s.sent, true); assert.equal(await whoseLink(s.link), ana.id, 'the link signs in to Ana\'s account');
  assert.equal((await dry({ mode: 'sign-in', email: anaPersonal.toUpperCase() })).sent, true, 'case doesn\'t matter');
  assert.deepEqual(await call({ mode: 'sign-in', email: addr('nobody') }), { status: 200, otp: true }, 'an unknown address gets the usual link (a new account, as before)');
  assert.deepEqual(await call({ mode: 'sign-in', email: ana.email }), { status: 200, otp: true }, 'the sign-in address itself uses the usual link');
  assert.equal((await call({ mode: 'sign-in', email: 'not-an-email' })).status, 400);
  // a second account for a confirmed address is refused (only reachable by going around the sign-in page)
  assert.match(await signUp(anaPersonal), /Database error|already/i, 'no second account for a confirmed address');
  console.log('PASS: sign-in — a confirmed address signs in to the same account; unknown and primary addresses use the usual link');

  // ── rate limit (real mode; example.com is never mailed) ──────────────────────────────────────
  const r1 = [await call({ mode: 'sign-in', email: anaPersonal }), await call({ mode: 'sign-in', email: anaPersonal }), await call({ mode: 'sign-in', email: anaPersonal })];
  assert.ok(r1.every((r) => r.sent), `three links are fine: ${JSON.stringify(r1)}`);
  const r4 = await call({ mode: 'sign-in', email: anaPersonal }); assert.equal(r4.status, 429, 'the fourth within 10 minutes is refused');
  console.log('PASS: rate limit — 3 sign-in links per address per 10 minutes');

  // ── conflicts ─────────────────────────────────────────────────────────────────────────────────
  assert.equal((await as(ben, { mode: 'add', kind: 'personal', email: ana.email })).status, 409, 'someone else\'s sign-in address is refused');
  assert.equal((await as(ben, { mode: 'add', kind: 'personal', email: anaPersonal })).status, 409, 'someone else\'s confirmed address is refused');
  // two people race for the same new address: the first to confirm wins, the other link says so
  const contested = addr('contested');
  const a1 = await dry({ mode: 'add', kind: 'personal', email: contested, user_id: ben.id });
  const c2 = await makeUser(admin, 'Cara Emails QA'); users.push(c2);
  const a2 = await dry({ mode: 'add', kind: 'personal', email: contested, user_id: c2.id });
  assert.equal((await call({ mode: 'confirm', token: a2.token })).ok, true, 'the first confirmation wins');
  const lose = await call({ mode: 'confirm', token: a1.token }); assert.equal(lose.reason, 'taken', 'the later one is told it\'s taken');
  assert.notEqual((await profile(ben.id)).personal_email, contested);
  console.log('PASS: conflicts — another account\'s address is refused; a race goes to whoever confirms first');

  // ── USC, own address, expiry, removal, signed out ────────────────────────────────────────────
  assert.equal((await as(ana, { mode: 'add', kind: 'usc', email: addr('gmail') })).status, 400, 'a USC address must be usc.edu');
  const uscTag = crypto.randomUUID().slice(0, 8);
  const sub = await dry({ mode: 'add', kind: 'usc', email: `tl-qa-${uscTag}@marshall.usc.edu`, user_id: ana.id }); assert.equal(sub.pending, true, 'department addresses (…@marshall.usc.edu) count as USC');
  assert.equal((await as(ben, { mode: 'add', kind: 'personal', email: ben.email })).saved, true, 'your own sign-in address saves at once');
  const old = await dry({ mode: 'add', kind: 'usc', email: `tl-qa-old-${uscTag}@usc.edu`, user_id: ben.id });
  await admin.from('email_confirmations').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('user_id', ben.id).eq('kind', 'usc');
  assert.equal((await call({ mode: 'confirm', token: old.token })).reason, 'expired', 'links expire after 24 hours');
  const rm = await as(ana, { mode: 'remove', kind: 'personal' }); assert.equal(rm.removed, true);
  assert.equal((await profile(ana.id)).personal_email, null); assert.equal(await linked(anaPersonal), null);
  assert.deepEqual(await call({ mode: 'sign-in', email: anaPersonal }), { status: 200, otp: true }, 'a removed address no longer signs in to the account');
  assert.equal((await call({ mode: 'add', kind: 'personal', email: addr('x') })).status, 401, 'adding needs a signed-in member');
  assert.equal((await call({ mode: 'add', kind: 'personal', email: addr('x'), user_id: ana.id, dry: true }, 'not-the-key')).status, 401, 'test mode needs the service key');
  console.log('PASS: USC addresses (incl. departments), own address, 24-hour expiry, removal, signed-out refusals');

  // ── the pages ────────────────────────────────────────────────────────────────────────────────
  browser = await chromium.launch(); const errors = [];
  const { page } = await signInPage(browser, ana); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/alumni-portal/profile`); await page.locator('.portal-profile:not([inert])').waitFor();
  const typed = addr('typed');
  await page.locator('#pf-personal').fill(typed); await page.locator('[data-contact="personal"] .portal-save-row').click();
  await expect(page.locator('[data-contact="personal"] .portal-feedback')).toContainText(`We sent a confirmation link to ${typed}`);
  await expect(page.locator('#pf-personal')).toHaveValue('', { timeout: 3000 });
  assert.notEqual((await profile(ana.id)).personal_email, typed, 'the page didn\'t save it unconfirmed');
  // open the emailed link (here: a fresh token for the same pending address) in a signed-out browser
  const fresh = await dry({ mode: 'add', kind: 'personal', email: typed, user_id: ana.id });
  const ctx = await browser.newContext(); const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(fresh.link.replace('https://usctroylabs.com', base));
  await expect(p2.locator('[data-confirm-title]')).toHaveText('EMAIL CONFIRMED'); await expect(p2.locator('[data-confirm-text]')).toContainText(typed);
  assert.ok(!p2.url().includes('token='), 'the token is gone from the address bar');
  await p2.screenshot({ path: 'test-results/portal/confirm-email.png' });
  await p2.reload(); await expect(p2.locator('[data-confirm-title]')).toHaveText('LINK NOT RECOGNISED');
  await page.reload(); await page.locator('.portal-profile:not([inert])').waitFor(); await expect(page.locator('#pf-personal')).toHaveValue(typed);
  // the sign-in page: a confirmed second address gets "check your email" (sent by our function; example.com isn't mailed)
  const gate = await (await browser.newContext()).newPage(); gate.on('pageerror', (e) => errors.push(e.message));
  await gate.goto(`${base}/alumni-portal`); await gate.locator('#portal-email').fill(typed); await gate.getByRole('button', { name: 'EMAIL ME A LINK' }).click();
  await expect(gate.locator('#portal-msg')).toContainText(/check|sent|inbox/i);
  assert.equal((await sql(`select count(*)::int n from public.email_sends where email = '${typed}' and purpose = 'sign-in'`)).rows[0].n, 1, 'the sign-in page routed the second address through the function');
  assert.deepEqual(errors, []);
  console.log('PASS: the pages — SAVE sends a confirmation (nothing saved yet); the link confirms signed out and clears the token; sign-in with the second address works');
} finally {
  if (browser) await browser.close();
  for (const u of users) await u.cleanup().catch(() => {});
  for (const id of extra) await admin.auth.admin.deleteUser(id).catch(() => {});
  await admin.from('email_sends').delete().like('email', 'tl-qa-%');
  console.log(`Cleaned up ${users.length + extra.length} temporary accounts.`);
}
