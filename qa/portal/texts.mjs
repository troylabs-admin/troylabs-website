// Texts through Twilio (2026-10-02): who a text goes to, what it says, that nothing is sent without the Twilio
// keys, and the two Twilio callbacks (delivery reports, STOP/START replies) including their signature check.
// The callbacks need TWILIO_AUTH_TOKEN on the function. Before Twilio is connected this script sets a random
// throwaway token for the run and removes it at the end; once a real token is set it never touches it and
// skips the signed-callback checks. Temporary accounts and messages; all removed.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, ref, signInPage } from './helpers.mjs';

const admin = adminClient(), users = [], msgs = [];
const FN = `https://${ref}.supabase.co/functions/v1/send-message`;
const cli = process.env.SUPABASE_CLI || 'supabase';
const call = async (u, mode, messageId) => { const r = await fetch(FN, { method: 'POST', headers: { Authorization: `Bearer ${u.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, messageId }) }); return { status: r.status, body: await r.json() }; };
const secretNames = () => JSON.parse(execFileSync(cli, ['secrets', 'list', '--project-ref', ref, '--output', 'json'], { encoding: 'utf8' })).map((s) => s.name);
const sign = (token, url, params) => createHmac('sha1', token).update(url + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64');
const twilioPost = (token, kind, params, tamper = {}) => { const url = `${FN}?twilio=${kind}`; return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(token ? { 'X-Twilio-Signature': sign(token, url, params) } : {}) }, body: new URLSearchParams({ ...params, ...tamper }) }); };
let tempToken = null, browser;
const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321';

try {
  const boss = await makeUser(admin, 'Admin QA'); users.push(boss); await admin.from('admins').insert({ user_id: boss.id });
  const texter = await makeUser(admin, 'Texter QA'); users.push(texter);
  const noOptIn = await makeUser(admin, 'Number No Opt-in QA'); users.push(noOptIn);
  const noPhone = await makeUser(admin, 'No Number QA'); users.push(noPhone);
  const pending = await makeUser(admin, 'Pending Texter QA', false); users.push(pending);
  const n = () => `+1213555${String(1000 + Math.floor(Math.random() * 8999))}`;
  const phones = { texter: n(), noOptIn: n(), pending: n() };
  await admin.from('profiles').update({ phone: phones.texter, phone_opt_in: true }).eq('id', texter.id);
  await admin.from('profiles').update({ phone: phones.noOptIn, phone_opt_in: false }).eq('id', noOptIn.id);
  await admin.from('profiles').update({ phone: phones.pending, phone_opt_in: true }).eq('id', pending.id);
  const mine = new Set(users.map((u) => u.id));
  const ins = async (row) => { const { data, error } = await admin.from('messages').insert({ title: 'QA text', body: 'Mixer “tonight” — bring a friend', filters: {}, ...row }).select().single(); if (error) throw error; msgs.push(data.id); return data.id; };

  // ── status ───────────────────────────────────────────────────────────────────────────────────────
  const st = await call(boss, 'status'); console.log('status:', JSON.stringify(st.body));
  assert.ok(st.body.email && st.body.text, 'status reports email and text separately');
  const connected = st.body.text.configured === true;

  // ── recipients and the text itself ───────────────────────────────────────────────────────────────
  const textOnly = await call(boss, 'preview', await ins({ send_by: 'text', event: { name: 'Fall mixer', when: '2026-10-08T19:00', where: 'Founders Lounge', rsvp: 'https://example.com/rsvp' } }));
  const names = (list) => list.filter((r) => mine.has(r.id)).map((r) => r.name).sort();
  assert.deepEqual(names(textOnly.body.textRecipients), ['Texter QA'], 'texts: only approved members with a number who opted in');
  assert.deepEqual(names(textOnly.body.recipients), [], 'TEXT sends no email');
  const sms = textOnly.body.sms;
  assert.ok(sms.startsWith('TroyLabs: Mixer "tonight" - bring a friend'), 'names TroyLabs first; smart punctuation straightened');
  assert.ok(sms.includes('Fall mixer - Thu, Oct 8, 7:00 PM PT - Founders Lounge\nRSVP: https://example.com/rsvp'), 'event line');
  assert.ok(sms.endsWith('Reply STOP to opt out.'), 'STOP line');
  assert.deepEqual(textOnly.body.smsSize, { chars: sms.length, segments: 1, unicode: false }, 'one plain segment');
  const both = await call(boss, 'preview', await ins({ send_by: 'both' }));
  assert.deepEqual(names(both.body.textRecipients), ['Texter QA']);
  assert.ok(names(both.body.recipients).includes('No Number QA') && names(both.body.recipients).includes('Texter QA'), 'BOTH: email to everyone with an address too');
  console.log('PASS: text recipients (opt-in, number, approved), TEXT vs BOTH, the text (sender, punctuation, event, STOP)');

  // ── nothing sends without the keys ───────────────────────────────────────────────────────────────
  if (!connected) {
    const id = msgs[0]; const t = await call(boss, 'test', id); const s = await call(boss, 'send', id);
    assert.equal(t.status, 503); assert.match(t.body.error, /Texts aren’t connected/);
    assert.equal(s.status, 503); assert.match(s.body.error, /Texts aren’t connected/);
    const row = (await admin.from('messages').select('state, last_error').eq('id', id).single()).data;
    assert.equal(row.state, 'draft', 'still a draft'); assert.match(row.last_error, /Twilio keys/);
    assert.equal((await admin.from('message_recipients').select('*', { count: 'exact', head: true }).eq('message_id', id)).count, 0, 'nobody recorded as texted');
    console.log('PASS: refuses to text without the Twilio keys; message stays a draft with the reason');
  } else console.log('SKIP: no-key checks (Twilio is connected)');

  // ── the Message page ─────────────────────────────────────────────────────────────────────────────
  browser = await chromium.launch(); const errors = [];
  await admin.from('profiles').update({ phone: '+18777804236', phone_opt_in: false }).eq('id', boss.id);   // Twilio's Virtual Phone, the way an admin tests on a trial
  const { page } = await signInPage(browser, boss); page.on('pageerror', (e) => errors.push(e.message)); page.on('dialog', (d) => d.accept());
  await page.goto(`${base}/alumni-portal/admin/messages`);
  const status = page.locator('#msg-delivery');
  await expect(status).toContainText(connected ? 'Texts are' : 'Texts aren’t connected yet');
  await expect(status).toContainText('Email');
  await page.locator('[data-single]:not([data-when]) .portal-chip[data-value="text"]').click();
  await page.locator('#mc-title').fill('QA text from the page');
  await page.locator('#mc-body').fill('Mixer tonight at 7');
  const counter = page.locator('#mc-sms');
  await expect(counter).toBeVisible(); await expect(counter).toContainText('one text per person');
  await page.locator('#mc-body').fill('Mixer tonight at 7 🚀 ' + 'x'.repeat(60));
  await expect(counter).toContainText('2 texts joined into one'); await expect(counter).toContainText('emoji');
  await page.locator('#mc-body').fill('y'.repeat(1700)); await expect(counter).toContainText('Too long for a text');
  await page.locator('#mc-body').fill('Mixer tonight at 7');
  await page.locator('[data-action="preview"]').click();
  await expect(page.locator('#msg-fb')).toContainText('by text to'); await expect(page.locator('#msg-fb')).toContainText('opted in');
  await page.locator('[data-single]:not([data-when]) .portal-chip[data-value="email"]').click(); await expect(counter).toBeHidden();
  await page.locator('[data-single]:not([data-when]) .portal-chip[data-value="both"]').click(); await expect(counter).toBeVisible();
  await page.locator('[data-action="preview"]').click(); await expect(page.locator('#msg-fb')).toContainText(/by email to \d+ (person|people) and by text to \d+ (person|people)/);
  await page.locator('[data-single]:not([data-when]) .portal-chip[data-value="text"]').click();
  if (!connected) {
    await page.locator('[data-action="test-send"]').click(); await expect(page.locator('#msg-fb')).toContainText('Texts aren’t connected yet');
    await page.locator('[data-action="send"]').click(); await expect(page.locator('#msg-fb')).toContainText('Texts aren’t connected yet');
    await expect(page.locator('[data-msg-list] li', { hasText: 'QA text from the page' }).first()).toContainText('Not sent: Texts aren’t connected');
    console.log('PASS: page — SEND A TEST / SEND NOW explain that texts aren’t connected; the draft keeps the reason');
  }
  // a text scheduled for the middle of the night is refused before it's saved
  await page.locator('[data-when] .portal-chip[data-value="later"]').click();
  const night = new Date(Date.now() + 2 * 86400e3); const pt = new Date(night.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })); night.setTime(night.getTime() + (3 - pt.getHours()) * 3600e3);   // 3 AM Pacific, two days out
  const local = new Date(night.getTime() - night.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  await page.locator('#mc-when').fill(local); await page.locator('[data-action="send"]').click();
  await expect(page.locator('#msg-fb')).toContainText('between 8 AM and 9 PM Pacific');
  for (const id of (await admin.from('messages').select('id').eq('title', 'QA text from the page')).data ?? []) msgs.push(id.id);
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll at 390');
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.locator('.portal-panels').screenshot({ path: 'test-results/portal/messages-text.png' });
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS: page — status line, live text counter (segments, emoji, too long), TEXT/BOTH preview counts, no night-time texts');

  // ── Twilio's callbacks ───────────────────────────────────────────────────────────────────────────
  assert.equal((await twilioPost(null, 'inbound', { From: phones.texter, Body: 'STOP' })).status, 403, 'unsigned callback refused');
  assert.equal((await twilioPost('not-the-token', 'inbound', { From: phones.texter, Body: 'STOP' })).status, 403, 'wrongly signed callback refused');
  if (!secretNames().includes('TWILIO_AUTH_TOKEN')) {
    tempToken = randomBytes(16).toString('hex');
    execFileSync(cli, ['secrets', 'set', `TWILIO_AUTH_TOKEN=${tempToken}`, '--project-ref', ref], { stdio: 'ignore' });
    let up = false; for (let i = 0; i < 20 && !up; i++) { await new Promise((r) => setTimeout(r, 3000)); up = (await twilioPost(tempToken, 'inbound', { From: '+10000000000', Body: 'hello' })).status === 200; }
    assert.ok(up, 'the function picked up the throwaway token');
    const optIn = async () => (await admin.from('profiles').select('phone_opt_in').eq('id', texter.id).single()).data.phone_opt_in;
    const inbound = { From: phones.texter, To: '+18885550123', Body: 'Stop', MessageSid: 'SMqa1' };
    assert.equal((await twilioPost(tempToken, 'inbound', inbound, { Body: 'hi' })).status, 403, 'a field changed after signing is refused');
    assert.equal(await optIn(), true);
    const res = await twilioPost(tempToken, 'inbound', inbound);
    assert.equal(res.status, 200); assert.match(await res.text(), /<Response\/>/, 'answers with empty TwiML (Twilio sends the standard STOP reply)');
    assert.equal(await optIn(), false, 'STOP turns texts off on the profile');
    await twilioPost(tempToken, 'inbound', { ...inbound, Body: 'START' }); assert.equal(await optIn(), true, 'START turns them back on');
    await twilioPost(tempToken, 'inbound', { ...inbound, Body: 'what time is it?' }); assert.equal(await optIn(), true, 'other replies change nothing');
    await twilioPost(tempToken, 'inbound', { ...inbound, Body: 'anything', OptOutType: 'STOP' }); assert.equal(await optIn(), false, 'Twilio’s OptOutType=STOP is honoured');
    await admin.from('profiles').update({ phone_opt_in: true }).eq('id', texter.id);
    console.log('PASS: inbound — signature checked; STOP / START / OptOutType update the profile; other replies ignored');

    // delivery reports
    const id = msgs[1];
    await admin.from('message_recipients').insert([{ message_id: id, profile_id: texter.id, channel: 'text', phone: phones.texter, provider_id: 'SMqaDelivered', status: 'queued', delivered_at: new Date().toISOString() },
      { message_id: id, profile_id: noOptIn.id, channel: 'text', phone: phones.noOptIn, provider_id: 'SMqaFiltered', status: 'queued', delivered_at: new Date().toISOString() }]);
    const rcpt = async (sid) => (await admin.from('message_recipients').select('status, error').eq('provider_id', sid).single()).data;
    await twilioPost(tempToken, 'status', { MessageSid: 'SMqaDelivered', MessageStatus: 'delivered', AccountSid: 'ACqa' });
    assert.deepEqual(await rcpt('SMqaDelivered'), { status: 'delivered', error: null });
    await twilioPost(tempToken, 'status', { MessageSid: 'SMqaDelivered', MessageStatus: 'sent', AccountSid: 'ACqa' });
    assert.equal((await rcpt('SMqaDelivered')).status, 'delivered', 'a late "sent" report never undoes "delivered"');
    await twilioPost(tempToken, 'status', { MessageSid: 'SMqaFiltered', MessageStatus: 'undelivered', ErrorCode: '30007', AccountSid: 'ACqa' });
    assert.deepEqual(await rcpt('SMqaFiltered'), { status: 'undelivered', error: 'the carrier filtered it as spam' }, 'carrier errors in words');
    assert.equal((await twilioPost(tempToken, 'status', { MessageSid: 'SMqaFiltered', MessageStatus: 'delivered' }, { MessageStatus: 'failed' })).status, 403, 'tampered report refused');
    console.log('PASS: delivery reports — delivered / undelivered recorded with the reason; out-of-order reports can’t step back; signature checked');
  } else console.log('SKIP: signed-callback checks (a real TWILIO_AUTH_TOKEN is set; this script never replaces it)');
} finally {
  if (browser) await browser.close();
  if (tempToken) { try { execFileSync(cli, ['secrets', 'unset', 'TWILIO_AUTH_TOKEN', '--project-ref', ref, '--yes'], { stdio: 'ignore' }); console.log('Removed the throwaway Twilio token.'); } catch (e) { console.log('!! could not remove the throwaway TWILIO_AUTH_TOKEN — unset it by hand'); } }
  for (const id of msgs) await admin.from('messages').delete().eq('id', id);
  for (const u of users.reverse()) await u.cleanup();
  console.log(`Cleaned up ${users.length} temporary accounts and ${msgs.length} messages.`);
}
