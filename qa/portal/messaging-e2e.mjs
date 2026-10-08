// Admin › Message, end to end against the real providers (2026-10-02). Proves mixed audiences (groups × CURRENT /
// ALUMNI, narrowing) reach exactly the right people, that the page saves what was ticked and counts what the sender
// sends, then — with
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

  // ── the matrix: mixed audiences against the live database, both ways of sending ───────────────────
  const C = (group, who) => ({ group, who });
  const cases = [
    ['everyone current', { cells: [C('EVERYONE', 'current')] }, 'CH', 'CDH'],
    ['everyone alumni', { cells: [C('EVERYONE', 'alumni')] }, 'ABEI', 'ABGI'],
    ['everyone (current + alumni)', { cells: [C('EVERYONE', 'current'), C('EVERYONE', 'alumni')] }, 'ABCEHI', 'ABCDGHI'],
    ['e-board current', { cells: [C('E-BOARD', 'current')] }, 'H', 'H'],
    ['e-board alumni', { cells: [C('E-BOARD', 'alumni')] }, 'I', 'I'],
    ['e-board current + alumni', { cells: [C('E-BOARD', 'current'), C('E-BOARD', 'alumni')] }, 'HI', 'HI'],
    ['design current', { cells: [C('DESIGN', 'current')] }, '', 'D'],
    ['design alumni (nobody)', { cells: [C('DESIGN', 'alumni')] }, '', ''],
    ['tech + tech alumni + design + design alumni', { cells: [C('TECH', 'current'), C('TECH', 'alumni'), C('DESIGN', 'current'), C('DESIGN', 'alumni')] }, 'A', 'ADG'],
    ['current e-board + all alumni', { cells: [C('E-BOARD', 'current'), C('EVERYONE', 'alumni')] }, 'ABEHI', 'ABGHI'],
    ['build current + marketing current (H in both, once)', { cells: [C('BUILD', 'current'), C('MARKETING', 'current')] }, 'H', 'H'],
    ['product management current', { cells: [C('PRODUCT MANAGEMENT', 'current')] }, 'C', 'C'],
    ['product management alumni', { cells: [C('PRODUCT MANAGEMENT', 'alumni')] }, 'B', 'B'],
    ['vc/finance alumni', { cells: [C('VC/FINANCE', 'alumni')] }, 'I', 'I'],
    ['demo alumni (emails off: text only)', { cells: [C('DEMO', 'alumni')] }, 'E', ''],
    ['tech alumni, only cohort FA19', { cells: [C('TECH', 'alumni')], cohort: ['FA19'] }, 'A', 'A'],
    ['everyone, only industry AI', { cells: [C('EVERYONE', 'current'), C('EVERYONE', 'alumni')], industries: ['AI'] }, 'AC', 'AC'],
    ['students, only ROBOTICS', { cells: [C('EVERYONE', 'current')], industries: ['ROBOTICS'] }, 'C', 'CD'],
    ['nothing ticked (nobody)', { cells: [] }, '', ''],
  ];
  const bad = [];
  for (const [label, audience, wantText, wantEmail] of cases) {
    const { data, error } = await admin.from('messages').insert({ title: `E2E ${label}`, body: 'Matrix check', send_by: 'both', audience }).select().single(); if (error) throw error; msgs.push(data.id);
    const p = await call(boss, 'preview', data.id);
    const gotText = mine(p.body.textRecipients), gotEmail = mine(p.body.recipients);
    if (gotText !== wantText || gotEmail !== wantEmail) bad.push(`${label}: texts ${gotText || '—'} (want ${wantText || '—'}), emails ${gotEmail || '—'} (want ${wantEmail || '—'})`);
    if (/F|boss/.test(gotText + gotEmail)) bad.push(`${label}: a pending member or the opted-out admin was included`);
  }
  assert.deepEqual(bad, [], `audience mismatches:\n${bad.join('\n')}`);
  const none = msgs[cases.findIndex(([l]) => l.startsWith('nothing ticked'))];
  const refused = await call(boss, 'send', none); assert.ok(refused.status >= 400 && /tick at least one group|Pick who gets it/i.test(refused.body.error), `a message with nothing ticked is refused: ${refused.body.error}`);
  console.log(`PASS: audiences — ${cases.length} mixes on the live database (e-board current/alumni, divisions current/alumni, overlaps sent once, narrowing), email and text; nothing ticked is refused`);

  // ── the page: ticking boxes saves exactly that audience, counts match the sender, EDIT brings it back ─
  browser = await chromium.launch(); const errors = [];
  const { page } = await signInPage(browser, boss); page.on('pageerror', (e) => errors.push(e.message)); page.on('dialog', (d) => d.accept());
  await page.goto(`${base}/alumni-portal/admin/messages`); await expect(page.locator('[data-action="preview"]')).toBeEnabled();
  await expect(page.locator('[data-aud-grid] .portal-aud-group')).toHaveText(['EVERYONE', 'E-BOARD', 'BUILD', 'DEMO', 'PRODUCT MANAGEMENT', 'VC/FINANCE', 'TECH', 'MARKETING', 'DESIGN']);
  await page.locator('[data-single]:not([data-when]) .portal-chip[data-value="email"]').click();
  const box = (g, w) => page.locator(`[data-aud-grid] .portal-chip[data-group="${g}"][data-who="${w}"]`);
  const sendBy = (v) => page.locator(`[data-single]:not([data-when]) .portal-chip[data-value="${v}"]`).click();
  const count = async (re) => { await page.waitForTimeout(150); const t = await page.locator('[data-aud-summary]').innerText(); const m = re.exec(t); assert.ok(m, `summary: ${t}`); return Number(m[1]); };
  // one channel per message: read the email count, then the text count, and go back to email (the subject box is email-only)
  const summaryCounts = async () => { const e = await count(/by email to (\d+)/); await sendBy('text'); const t = await count(/by text to (\d+)/); await sendBy('email'); return [e, t]; };
  for (const label of ['tech + tech alumni + design + design alumni', 'current e-board + all alumni', 'e-board current + alumni', 'tech alumni, only cohort FA19']) {
    const [, audience] = cases.find(([l]) => l === label);
    await page.locator('[data-action="new-draft"]').click();
    for (const c of audience.cells) await box(c.group, c.who).click();
    if (audience.cohort?.length) await page.locator('details.portal-or').evaluate((d) => { d.open = true; });   // cohorts sit in the NARROW IT DOWN fold
    for (const c of audience.cohort ?? []) await page.locator('[data-cohorts] .portal-chip', { hasText: new RegExp(`^(✓\\s*)?${c}$`) }).click();
    await page.locator('#mc-title').fill(`E2E page ${label}`); await page.locator('#mc-body').fill('Page routing check');
    await page.locator('[data-action="draft"]').click(); await expect(page.locator('#msg-fb')).toContainText('Saved as a draft');
    const saved = (await admin.from('messages').select('id, audience').eq('title', `E2E page ${label}`).single()).data; msgs.push(saved.id);
    const key = (a) => JSON.stringify({ cells: [...a.cells].map((c) => `${c.group}|${c.who}`).sort(), cohort: [...(a.cohort ?? [])].sort(), industries: [...(a.industries ?? [])].sort() });
    assert.equal(key(saved.audience), key(audience), `the page saved exactly the ticked boxes for ${label}`);
    // one channel per message: the email count against the sender as an email, the text count against it as a text
    const pe = await call(boss, 'preview', saved.id);
    { const { error } = await admin.from('messages').update({ send_by: 'text' }).eq('id', saved.id); if (error) throw error; } const pt = await call(boss, 'preview', saved.id);
    { const { error } = await admin.from('messages').update({ send_by: 'email' }).eq('id', saved.id); if (error) throw error; }
    assert.deepEqual(await summaryCounts(), [pe.body.recipients.length, pt.body.textRecipients.length], `the page's count is the sender's for ${label}`);
    // EDIT brings the same boxes back
    await page.locator('[data-action="new-draft"]').click(); assert.equal(await page.locator('[data-aud-grid] .portal-chip[aria-pressed="true"]').count(), 0, 'NEW DRAFT clears the boxes');
    await page.locator(`[data-msg-list] li[data-id="${saved.id}"] [data-edit]`).click();
    const on = await page.locator('[data-aud-grid] .portal-chip[aria-pressed="true"]').evaluateAll((els) => els.map((e) => `${e.dataset.group}|${e.dataset.who}`).sort());
    assert.deepEqual(on, audience.cells.map((c) => `${c.group}|${c.who}`).sort(), `EDIT restores the boxes for ${label}`);
  }
  // WHO WILL GET IT lists the same people the sender would pick (the box clicks above must not trigger it)
  const last = (await admin.from('messages').select('id').eq('title', 'E2E page e-board current + alumni').single()).data.id;
  const row = page.locator(`[data-msg-list] li[data-id="${last}"]`);
  await row.locator('[data-recipients-for]').click(); await expect(row.locator('.portal-recipients')).toBeVisible();
  // real members can match too (the real e-board does): check our two people are listed, and nobody else of ours
  await expect(row.locator('.portal-recipients li', { hasText: /E2E .* QA/ })).toHaveText([/E2E [HI] QA/, /E2E [HI] QA/]);
  await row.locator('[data-recipients-for]').click(); await expect(row.locator('.portal-recipients')).toBeHidden();
  await page.locator('[data-action="new-draft"]').click(); await page.locator('#mc-title').fill('E2E nothing ticked'); await page.locator('#mc-body').fill('x');
  await expect(page.locator('[data-aud-summary]')).not.toHaveCSS('color', 'rgb(255, 125, 44)');   // a quiet hint, not a warning, before anyone tries to send
  await page.locator('[data-action="draft"]').click(); await expect(page.locator('#msg-fb')).toContainText('Saved as a draft');
  const parked = (await admin.from('messages').select('id').eq('title', 'E2E nothing ticked')).data; assert.equal(parked.length, 1, 'a half-written draft saves without an audience'); msgs.push(parked[0].id);
  await page.locator('[data-action="send"]').click(); await expect(page.locator('#msg-fb')).toContainText('tick at least one box');
  await expect(page.locator('[data-aud-summary]')).toHaveCSS('color', 'rgb(255, 125, 44)');   // now it's a warning
  assert.equal((await admin.from('messages').select('state').eq('id', parked[0].id).single()).data.state, 'draft', 'and it can’t be sent to nobody');
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll at 390');
  await page.locator('[data-aud-grid]').screenshot({ path: 'test-results/portal/audience-grid-390.png' }); await page.setViewportSize({ width: 1440, height: 1000 });
  await box('DESIGN', 'current').click(); await box('TECH', 'alumni').click(); await page.locator('.portal-panels').screenshot({ path: 'test-results/portal/audience-grid.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: the page — ticked boxes are saved exactly, its counts are the sender’s, EDIT restores the boxes, a draft saves without an audience but can’t be sent to nobody, fits a phone');

  if (!TEST_PHONE) { console.log('SKIP: real sends (set TL_TEST_PHONE to a number verified in Twilio)'); process.exitCode = 0; }
  else {
    // ── 1. keys ───────────────────────────────────────────────────────────────────────────────────
    const st = (await call(boss, 'status')).body.text; console.log('twilio:', JSON.stringify({ configured: st.configured, trial: st.trial, error: st.error, from: st.from }));
    assert.equal(st.error, null, 'Twilio accepts the keys'); assert.equal(st.configured, true);

    // ── 2. a test text to yourself, our own wording ─────────────────────────────────────────────────
    const { data: tm } = await admin.from('messages').insert({ title: 'E2E test text', body: 'TroyLabs portal check: this is the SEND A TEST TO ME text. No reply needed.', send_by: 'text', audience: { cells: [{ group: 'EVERYONE', who: 'alumni' }] } }).select().single(); msgs.push(tm.id);
    const t = await call(boss, 'test', tm.id); console.log('test text:', t.status, JSON.stringify(t.body));
    assert.equal(t.status, 200, `test text accepted: ${t.body.error}`); assert.match(t.body.textSid, /^SM/);
    console.log('PASS: SEND A TEST TO ME — Twilio accepted our own wording for your phone');

    // ── 3. a real filtered group send ───────────────────────────────────────────────────────────────
    if (pacificHour < 8 || pacificHour >= 21) console.log(`SKIP: group send (it's ${pacificHour}:00 Pacific; group texts go out 8 AM–9 PM)`);
    else {
      const T = await makeUser(admin, 'E2E Target QA'); users.push(T); nameOf[T.id] = 'T';
      await admin.from('profiles').update({ status: 'alum', divisions: ['TECH'], join_term: 'FA', join_year: 2019, city_id: LA, phone: TEST_PHONE, phone_opt_in: true, email_opt_in: false }).eq('id', T.id);
      await admin.from('profiles').update({ phone: null }).eq('id', boss.id);   // so the phone belongs to T alone
      const { data: gm } = await admin.from('messages').insert({ title: 'E2E group text', body: 'TroyLabs portal check: a group text to alumni in TECH from the FA19 cohort. No reply needed.', send_by: 'text', audience: { cells: [{ group: 'TECH', who: 'alumni' }], cohort: ['FA19'] } }).select().single(); msgs.push(gm.id);
      // hard stop: a real send may only ever reach this test's own accounts (2026-10-05: real members now share groups with test ones)
      const pre = await call(boss, 'preview', gm.id); const outsiders = [...(pre.body.recipients ?? []), ...(pre.body.textRecipients ?? [])].filter((r) => !users.some((u) => u.id === (r.id ?? r.profile_id)));
      if (outsiders.length) throw new Error(`refusing to send: ${outsiders.length} real member(s) match this audience`);
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
