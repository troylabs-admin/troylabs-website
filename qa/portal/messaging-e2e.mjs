// Admin › Message, end to end against the real providers (2026-10-02). Proves the audience is exactly right
// for every channel and a matrix of filters (and that the page counts what the sender sends), then — with
// TL_TEST_PHONE set to a number verified in Twilio — really texts it:
//   1. Twilio accepts the keys (status)
//   2. SEND A TEST TO ME texts our own wording to TL_TEST_PHONE
//   3. a filtered group send (only 8 AM–9 PM Pacific): the one matching member with TL_TEST_PHONE gets it and
//      Twilio reports it delivered; matching members with fake numbers are attempted (a trial refuses them);
//      members who don't match get nothing
// Run: TL_TEST_PHONE=+1... SUPABASE_CLI=... PORTAL_URL=... node qa/portal/messaging-e2e.mjs
// Temporary accounts with example.com emails and fictional 555-01xx numbers; all removed at the end.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, ref, signInPage } from './helpers.mjs';

const admin = adminClient(), users = [], msgs = []; let browser;
const FN = `https://${ref}.supabase.co/functions/v1/send-message`;
const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321';
const TEST_PHONE = process.env.TL_TEST_PHONE || null;
const call = async (u, mode, messageId) => { const r = await fetch(FN, { method: 'POST', headers: { Authorization: `Bearer ${u.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, messageId }) }); return { status: r.status, body: await r.json() }; };
const LA = 1, SF = 2;
const fake = (n) => `+1213555${String(100 + n).padStart(4, '0')}`;   // 555-0100..0199: reserved, never a real phone
const pacificHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));

try {
  const boss = await makeUser(admin, 'E2E Admin QA'); users.push(boss); await admin.from('admins').insert({ user_id: boss.id });
  await admin.from('profiles').update({ status: 'student', divisions: ['MARKETING'], join_term: 'SP', join_year: 2026, grad_year: 2029, city_id: null, phone: TEST_PHONE, phone_opt_in: false, email_opt_in: false }).eq('id', boss.id);   // matches no test audience

  // ── the cast: every attribute a filter can use, and every way to be left out ──────────────────────
  const cast = {
    A: { status: 'alum', divisions: ['TECH'], join_term: 'FA', join_year: 2019, industries: ['AI'], city_id: LA, phone: fake(1), phone_opt_in: true },
    B: { status: 'alum', divisions: ['PRODUCT MANAGEMENT'], join_term: 'SP', join_year: 2019, industries: ['FINTECH'], city_id: SF, phone: fake(2), phone_opt_in: true },
    C: { status: 'student', divisions: ['PRODUCT MANAGEMENT'], join_term: 'FA', join_year: 2019, industries: ['AI', 'ROBOTICS'], city_id: LA, phone: fake(3), phone_opt_in: true, grad_year: 2027 },
    D: { status: 'student', divisions: ['TECH', 'DESIGN'], join_term: 'SP', join_year: 2019, industries: ['ROBOTICS'], city_id: null, phone: fake(4), phone_opt_in: false, grad_year: 2028 },   // has a number, didn't opt in
    E: { status: 'alum', divisions: ['DEMO'], join_term: 'FA', join_year: 2019, industries: ['HEALTHTECH'], city_id: LA, phone: fake(5), phone_opt_in: true, email_opt_in: false },   // emails off, texts on
    G: { status: 'alum', divisions: ['TECH'], join_term: 'SP', join_year: 2019, industries: [], city_id: SF, phone: null, phone_opt_in: false },   // no number
    H: { status: 'student', divisions: ['BUILD', 'MARKETING'], join_term: 'FA', join_year: 2019, industries: [], city_id: LA, phone: fake(7), phone_opt_in: true, grad_year: 2027 },   // on the e-board this semester
    I: { status: 'alum', divisions: ['VC/FINANCE'], join_term: 'SP', join_year: 2019, industries: [], city_id: null, phone: fake(8), phone_opt_in: true },   // was on the e-board last year
  };
  const who = {};
  for (const [k, f] of Object.entries(cast)) { const u = await makeUser(admin, `E2E ${k} QA`); users.push(u); who[k] = u; const { error } = await admin.from('profiles').update({ grad_year: 2023, ...f }).eq('id', u.id); if (error) throw new Error(`${k}: ${error.message}`); }
  const F = await makeUser(admin, 'E2E F pending QA', false); users.push(F); await admin.from('profiles').update({ ...cast.A, phone: fake(6) }).eq('id', F.id);   // matches everything, not approved
  const la = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })); const term = la.getMonth() >= 6 ? 'FA' : 'SP', year = la.getFullYear();
  await admin.from('eboard_roles').insert([{ profile_id: who.H.id, role: 'DIRECTOR OF BUILD', term, year }, { profile_id: who.I.id, role: 'DIRECTOR OF VC/FINANCE', term: 'SP', year: year - 1 }, { profile_id: F.id, role: 'CO-PRESIDENT', term, year }]);
  const nameOf = Object.fromEntries([...Object.entries(who).map(([k, u]) => [u.id, k]), [F.id, 'F'], [boss.id, 'boss']]);
  const mine = (list) => list.filter((r) => nameOf[r.id]).map((r) => nameOf[r.id]).sort().join('');

  // ── the matrix: every channel and a set of filters, both ways of sending, against what should happen ──
  const channels = Object.fromEntries(((await admin.from('channels').select('id, name')).data ?? []).map((c) => [c.name, c.id]));
  const ch = (name) => { assert.ok(channels[name], `channel ${name} exists`); return { channel_id: channels[name] }; };
  const cases = [
    ['EVERYONE', ch('EVERYONE'), 'ABCEHI', 'ABCDGHI'],
    ['ALL ALUMNI', ch('ALL ALUMNI'), 'ABEI', 'ABGI'],
    ['ALL STUDENTS', ch('ALL STUDENTS'), 'CH', 'CDH'],
    ['E-BOARD', ch('E-BOARD'), 'H', 'H'],
    ['BUILD', ch('BUILD'), 'H', 'H'],
    ['DEMO', ch('DEMO'), 'E', ''],
    ['PRODUCT MANAGEMENT', ch('PRODUCT MANAGEMENT'), 'BC', 'BC'],
    ['VC/FINANCE', ch('VC/FINANCE'), 'I', 'I'],
    ['TECH', ch('TECH'), 'A', 'ADG'],
    ['MARKETING', ch('MARKETING'), 'H', 'H'],
    ['DESIGN', ch('DESIGN'), '', 'D'],
    ['alumni in TECH or DEMO', { filters: { status: ['ALUMNI'], divisions: ['TECH', 'DEMO'] } }, 'AE', 'AG'],
    ['students in BUILD', { filters: { status: ['STUDENTS'], divisions: ['BUILD'] } }, 'H', 'H'],
    ['cohort FA19', { filters: { cohort: ['FA19'] } }, 'ACEH', 'ACH'],
    ['cohort FA19 or SP19', { filters: { cohort: ['FA19', 'SP19'] } }, 'ABCEHI', 'ABCDGHI'],
    ['industry AI', { filters: { industries: ['AI'] } }, 'AC', 'AC'],
    ['students in ROBOTICS', { filters: { industries: ['ROBOTICS'], status: ['STUDENTS'] } }, 'C', 'CD'],
    ['students and alumni', { filters: { status: ['STUDENTS', 'ALUMNI'] } }, 'ABCEHI', 'ABCDGHI'],
    ['alumni in ROBOTICS (nobody)', { filters: { status: ['ALUMNI'], industries: ['ROBOTICS'] } }, '', ''],
  ];
  const bad = [];
  for (const [label, row, wantText, wantEmail] of cases) {
    const { data, error } = await admin.from('messages').insert({ title: `E2E ${label}`, body: 'Matrix check', send_by: 'both', filters: {}, ...row }).select().single(); if (error) throw error; msgs.push(data.id);
    const p = await call(boss, 'preview', data.id);
    const gotText = mine(p.body.textRecipients), gotEmail = mine(p.body.recipients);
    if (gotText !== wantText || gotEmail !== wantEmail) bad.push(`${label}: texts ${gotText || '—'} (want ${wantText || '—'}), emails ${gotEmail || '—'} (want ${wantEmail || '—'})`);
    if (/F|boss/.test(gotText + gotEmail)) bad.push(`${label}: a pending member or the opted-out admin was included`);
  }
  assert.deepEqual(bad, [], `audience mismatches:\n${bad.join('\n')}`);
  console.log(`PASS: audiences — ${cases.length} channels/filter combinations, texts and emails, exactly the right people (pending, not opted in, no number, emails off, former e-board all respected)`);

  // the page counts what the function sends (two implementations of the same rules)
  browser = await chromium.launch(); const errors = [];
  const { page } = await signInPage(browser, boss); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/alumni-portal/admin/messages`); await expect(page.locator('[data-action="preview"]')).toBeEnabled();
  await page.locator('[data-single]:not([data-when]) .portal-chip[data-value="both"]').click();
  for (const [label, row] of cases.filter(([, r]) => r.channel_id)) {
    const chip = page.locator(`[data-channels] .portal-chip[data-value="${label}"]`);
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
    await page.locator('[data-action="preview"]').click();
    const t = await page.locator('#msg-fb').innerText(); const m = /by email to (\d+) \w+ and by text to (\d+)/.exec(t); assert.ok(m, `preview text for ${label}: ${t}`);
    const id = msgs[cases.findIndex(([l]) => l === label)]; const p = await call(boss, 'preview', id);
    assert.deepEqual([Number(m[1]), Number(m[2])], [p.body.recipients.length, p.body.textRecipients.length], `page and sender agree for ${label}`);
  }
  // filters picked on the page (cohort chips are built from members' data after load) count the same as the sender
  const pressed = page.locator('[data-channels] .portal-chip[aria-pressed="true"]'); if (await pressed.count()) await pressed.first().click();   // back to no channel
  for (const [label, chips] of [['cohort FA19', ['FA19']], ['students in BUILD', ['STUDENTS', 'BUILD']]]) {
    for (const c of chips) await page.locator('[data-audience] [data-aud] .portal-chip', { hasText: new RegExp(`^(✓\\s*)?${c.replace('/', '\\/')}$`) }).first().click();
    await page.locator('[data-action="preview"]').click();
    const t = await page.locator('#msg-fb').innerText(); const m = /by email to (\d+) \w+ and by text to (\d+)/.exec(t); assert.ok(m, `preview text for ${label}: ${t}`);
    const p = await call(boss, 'preview', msgs[cases.findIndex(([l]) => l === label)]);
    assert.deepEqual([Number(m[1]), Number(m[2])], [p.body.recipients.length, p.body.textRecipients.length], `page and sender agree for ${label}`);
    for (const c of chips) await page.locator('[data-audience] [data-aud] .portal-chip', { hasText: new RegExp(`^(✓\\s*)?${c.replace('/', '\\/')}$`) }).first().click();   // untick
  }
  await expect(page.locator('[data-cohorts] .portal-chip', { hasText: 'FA19' })).toHaveCount(1);
  await expect(page.locator('[data-aud="divisions"] .portal-chip')).toHaveText(['BUILD', 'DEMO', 'PRODUCT MANAGEMENT', 'VC/FINANCE', 'TECH', 'MARKETING', 'DESIGN']);
  await page.locator('.portal-panels').screenshot({ path: 'test-results/portal/messages-audiences.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: the page’s counts equal the sender’s for every channel and for filters picked on the page (cohort chips from real data, all seven divisions)');

  if (!TEST_PHONE) { console.log('SKIP: real sends (set TL_TEST_PHONE to a number verified in Twilio)'); process.exitCode = 0; }
  else {
    // ── 1. keys ───────────────────────────────────────────────────────────────────────────────────
    const st = (await call(boss, 'status')).body.text; console.log('twilio:', JSON.stringify({ configured: st.configured, trial: st.trial, error: st.error, from: st.from }));
    assert.equal(st.error, null, 'Twilio accepts the keys'); assert.equal(st.configured, true);

    // ── 2. a test text to yourself, our own wording ─────────────────────────────────────────────────
    const { data: tm } = await admin.from('messages').insert({ title: 'E2E test text', body: 'TroyLabs portal check: this is the SEND A TEST TO ME text. No reply needed.', send_by: 'text', filters: {} }).select().single(); msgs.push(tm.id);
    const t = await call(boss, 'test', tm.id); console.log('test text:', t.status, JSON.stringify(t.body));
    assert.equal(t.status, 200, `test text accepted: ${t.body.error}`); assert.match(t.body.textSid, /^SM/);
    console.log('PASS: SEND A TEST TO ME — Twilio accepted our own wording for your phone');

    // ── 3. a real filtered group send ───────────────────────────────────────────────────────────────
    if (pacificHour < 8 || pacificHour >= 21) console.log(`SKIP: group send (it's ${pacificHour}:00 Pacific; group texts go out 8 AM–9 PM)`);
    else {
      const T = await makeUser(admin, 'E2E Target QA'); users.push(T); nameOf[T.id] = 'T';
      await admin.from('profiles').update({ status: 'alum', divisions: ['TECH'], join_term: 'FA', join_year: 2019, city_id: LA, phone: TEST_PHONE, phone_opt_in: true, email_opt_in: false }).eq('id', T.id);
      await admin.from('profiles').update({ phone: null }).eq('id', boss.id);   // so the phone belongs to T alone
      const { data: gm } = await admin.from('messages').insert({ title: 'E2E group text', body: 'TroyLabs portal check: a group text to alumni in TECH from the FA19 cohort. No reply needed.', send_by: 'text', filters: { status: ['ALUMNI'], divisions: ['TECH'], cohort: ['FA19'] } }).select().single(); msgs.push(gm.id);
      const s = await call(boss, 'send', gm.id); console.log('group send:', s.status, JSON.stringify(s.body));
      assert.equal(s.status, 200, `group send: ${s.body.error}`);
      const rows = (await admin.from('message_recipients').select('profile_id, channel, phone, delivered_at, provider_id, status, error').eq('message_id', gm.id)).data;
      const byName = Object.fromEntries(rows.map((r) => [nameOf[r.profile_id], r]));
      assert.deepEqual(Object.keys(byName).sort().join(''), 'AT', 'only the matching members were texted (A with a fake number, T with yours); G has no number, the rest don’t match');
      assert.ok(byName.T.delivered_at && /^SM/.test(byName.T.provider_id), 'Twilio took the text for your phone');
      console.log('A (fictional number):', byName.A.error ?? 'accepted');
      const msg = (await admin.from('messages').select('state, sent_count, failed_count').eq('id', gm.id).single()).data; console.log('message:', JSON.stringify(msg));
      assert.equal(msg.state, 'sent');
      let status = byName.T.status; for (let i = 0; i < 30 && !['delivered', 'undelivered', 'failed'].includes(status); i++) { await new Promise((r) => setTimeout(r, 3000)); status = (await admin.from('message_recipients').select('status').eq('message_id', gm.id).eq('profile_id', T.id).single()).data.status; }
      console.log('your phone, as Twilio reports it:', status);
      assert.equal(status, 'delivered', 'Twilio’s delivery report reached us and says delivered');
      assert.equal((await call(boss, 'send', gm.id)).status, 409, 'a sent message can’t be sent again');
      console.log('PASS: group send — right people attempted, your phone delivered (confirmed by Twilio’s report), no double send');
    }
  }
} finally {
  if (browser) await browser.close();
  for (const id of msgs) await admin.from('messages').delete().eq('id', id);
  for (const u of users.reverse()) await u.cleanup();
  console.log(`Cleaned up ${users.length} temporary accounts and ${msgs.length} messages.`);
}
