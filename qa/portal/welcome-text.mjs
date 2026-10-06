// The opt-in confirmation text (2026-10-06): the A2P campaign promises one when someone turns texts on. Test accounts
// only, and the function never sends a real text to a test account (it returns the body instead), so no phone is texted.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';
import { GOODBYE_TEXT } from '../../supabase/functions/_shared/sms.ts';
const base = process.env.PORTAL_URL || 'http://localhost:4399';
const FN = 'https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/send-message';
const REGISTERED = "TroyLabs: You're signed up for TroyLabs event texts, a few msgs a month. Msg & data rates may apply. Reply HELP for help, STOP to cancel.";
const admin = adminClient();
const member = await makeUser(admin, 'Welcome Text QA'), boss = await makeUser(admin, 'Welcome Boss QA'), other = await makeUser(admin, 'Welcome Other QA');
await admin.from('admins').insert({ user_id: boss.id });
await admin.from('profiles').update({ phone: '+12135550161', phone_opt_in: false }).eq('id', member.id);
await admin.from('profiles').update({ phone: '+12135550162', phone_opt_in: false }).eq('id', other.id);
const call = async (u, body) => { const r = await fetch(FN, { method: 'POST', headers: { Authorization: `Bearer ${u.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'welcome-text', ...body }) }); return { status: r.status, ...(await r.json()) }; };
const welcomes = async (id) => (await admin.from('profile_events').select('actor, detail').eq('profile_id', id).eq('event', 'texts_welcome')).data;
const browser = await chromium.launch();
try {
  assert.equal(REGISTERED.length <= 160 && /^[\x20-\x7e]+$/.test(REGISTERED), true, 'one plain-text segment');
  assert.equal((await call(member, {})).reason, 'texts are off');
  console.log('PASS: texts off → no welcome');

  // the member ticks "Text me…" and saves: the page asks for the welcome; the reply is the registered text
  let { context, page } = await signInPage(browser, member);
  const asked = [], bye = []; page.on('response', async (r) => { if (!r.url().startsWith(FN)) return; const d = r.request().postData() ?? ''; if (d.includes('welcome-text')) asked.push(await r.json().catch(() => ({}))); else if (d.includes('optout-text')) bye.push(await r.json().catch(() => ({}))); });
  await page.goto(`${base}/alumni-portal/profile`); await page.locator('#pf-phone').waitFor(); await page.waitForTimeout(1500);
  await page.locator('label:has(#pf-phone-opt)').click(); await page.locator('[data-contact="phone"] .portal-save-row').click();
  await expect.poll(() => asked.length, { timeout: 10000 }).toBe(1);
  assert.deepEqual([asked[0].test, asked[0].body], [true, REGISTERED]);
  console.log('PASS: ticking texts on and saving sends the registered confirmation (test account: body returned, nothing texted)');
  assert.equal((await call(member, {})).reason, 'already sent to this number today');
  // a new number while texts are on gets its own welcome
  await page.locator('#pf-phone').fill('(213) 555-0163'); await page.locator('[data-contact="phone"] .portal-save-row').click();
  await expect.poll(() => asked.length, { timeout: 10000 }).toBe(2); assert.equal(asked[1].test, true);
  // saving again with nothing changed doesn't ask
  await page.locator('#pf-phone').fill('(213) 555-0163'); await expect(page.locator('[data-contact="phone"] .portal-save-row')).toBeDisabled();   // nothing changed: SAVE stays off, so no welcome either
  // turning texts off on the website: no welcome, one "texts are off" text
  await page.locator('label:has(#pf-phone-opt)').click(); await page.locator('[data-contact="phone"] .portal-save-row').click();
  await expect.poll(() => bye.length, { timeout: 10000 }).toBe(1); await page.waitForTimeout(1000);
  assert.equal(asked.length, 2, 'no welcome when texts turn off'); assert.deepEqual([bye[0].test, bye[0].body], [true, GOODBYE_TEXT]);
  const { data: gone } = await admin.from('profile_events').select('detail').eq('profile_id', member.id).eq('event', 'texts_goodbye'); assert.equal(gone.length, 1);
  assert.equal((await call(member, {})).reason, 'texts are off');
  const w = await welcomes(member.id); assert.deepEqual(w.map((e) => e.detail.phone).sort(), ['+12135550161', '+12135550163']); assert.ok(w.every((e) => e.actor === member.id));
  console.log('PASS: once per number per day; a new number gets one; unchanged saves don\'t; turning texts off on the website sends one "texts are off" text instead; each is in the member\'s timeline');
  await context.close();

  // someone else's: only an admin
  await admin.from('profiles').update({ phone_opt_in: true }).eq('id', other.id);
  assert.equal((await call(member, { profileId: other.id })).status, 403, 'a member can\'t trigger another member\'s welcome');
  ({ context, page } = await signInPage(browser, boss));
  await admin.from('profiles').update({ phone_opt_in: false }).eq('id', other.id);
  const asked2 = []; page.on('response', async (r) => { if (r.url().startsWith(FN) && r.request().postData()?.includes('welcome-text')) asked2.push({ req: JSON.parse(r.request().postData()), res: await r.json().catch(() => ({})) }); });
  await page.goto(`${base}/alumni-portal/profile?id=${other.id}`); await page.locator('#pf-admin-edit').waitFor({ state: 'visible' }); await page.waitForTimeout(1000);
  await page.locator('label:has(#pf-phone-opt)').click(); await page.locator('[data-contact="phone"] .portal-save-row').click();
  await expect.poll(() => asked2.length, { timeout: 10000 }).toBe(1);
  assert.deepEqual([asked2[0].req.profileId, asked2[0].res.test], [other.id, true]);
  assert.equal((await welcomes(other.id))[0].actor, boss.id);
  console.log('PASS: a member can\'t trigger someone else\'s welcome; an admin turning texts on for a member sends theirs, recorded with the admin');
  await context.close();
} finally { await browser.close(); for (const u of [member, other, boss]) await u.cleanup(); await admin.rpc('purge_test_backups'); }
