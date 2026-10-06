// Admin › Messages (2026-10-06): the groups Bryan named, each listing exactly who it reaches (and who it doesn't, and
// why); templates with [placeholders] that can't be sent; the text as a phone shows it; the automatic texts word for
// word; the one-time welcome for members who turned texts on before texts were connected. Test accounts only: a test
// admin's page and send-message see only test accounts, and test accounts are never texted for real.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';
import { GOODBYE_TEXT, HELP_REPLY, STOP_REPLY, WELCOME_TEXT } from '../../supabase/functions/_shared/sms.ts';
const base = process.env.PORTAL_URL || 'http://localhost:4399';
const admin = adminClient(); const made = [];
const user = async (name, fields) => { const u = await makeUser(admin, name); made.push(u); const { error } = await admin.from('profiles').update(fields).eq('id', u.id); if (error) throw error; return u; };
const now = new Date(); const term = now.getMonth() >= 6 ? 'FA' : 'SP', year = now.getFullYear();
try {
  const boss = await user('Msg Boss QA', { status: 'alum', divisions: ['DEMO'], phone: '+12135550170', phone_opt_in: false });
  await admin.from('admins').insert({ user_id: boss.id });
  const pmAlum = await user('Pm Alum QA', { status: 'alum', divisions: ['PRODUCT MANAGEMENT'], phone: '+12135550171', phone_opt_in: true, email_opt_in: true });
  const pmQuiet = await user('Pm Quiet QA', { status: 'alum', divisions: ['PRODUCT MANAGEMENT'], phone: null, phone_opt_in: false, email_opt_in: false });
  const ebStudent = await user('Eboard Student QA', { status: 'student', grad_year: 2028, divisions: ['TECH'], phone: '+12135550172', phone_opt_in: true });
  const plainStudent = await user('Plain Student QA', { status: 'student', grad_year: 2029, divisions: ['TECH'], phone: '+12135550173', phone_opt_in: false });
  const ebAlum = await user('Eboard Alum QA', { status: 'alum', divisions: ['BUILD'], phone: null, phone_opt_in: false });
  await admin.from('eboard_roles').insert([{ profile_id: ebStudent.id, role: 'PRESIDENT', term, year }, { profile_id: ebAlum.id, role: 'DIRECTOR OF BUILD', term: 'SP', year: 2023 }]);

  const browser = await chromium.launch(); const errors = [];
  try {
    const { page } = await signInPage(browser, boss); page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/alumni-portal/admin/messages`); await page.locator('[data-aud-grid] .portal-chip').first().waitFor(); await page.waitForTimeout(1500);
    const cell = (g, w) => page.locator(`[data-aud-grid] .portal-chip[data-group="${g}"][data-who="${w}"]`);
    const sendBy = (v) => page.locator(`[data-single]:not([data-when]) .portal-chip[data-value="${v}"]`).click();
    const who = async () => { await page.waitForTimeout(150); return { names: await page.locator('[data-who-items] li .text-ink').allTextContents(), missed: (await page.locator('.portal-who-missed').allTextContents()).join(' '), head: await page.locator('[data-who-head]').textContent() }; };
    const clear = async () => { const on = page.locator('[data-aud-grid] .portal-chip[aria-pressed="true"]'); while (await on.count()) { await on.first().click(); await page.waitForTimeout(50); } };

    await expect(page.locator('[data-who-list]')).toBeHidden();   // nothing ticked: no list
    // alumni in PM, by email + text
    await sendBy('both'); await cell('PRODUCT MANAGEMENT', 'alumni').click();
    let w = await who(); assert.deepEqual(w.names, ['Pm Alum QA']); assert.match(w.missed, /Pm Quiet QA \(no number, announcements off\)/); assert.match(w.head, /WHO GETS IT · 1/);
    // only texts: who has texts on
    await sendBy('text'); w = await who(); assert.deepEqual(w.names, ['Pm Alum QA']); assert.match(w.missed, /Pm Quiet QA \(no number\)/);
    // everyone (students + alumni), by email
    await clear(); await sendBy('email'); await cell('EVERYONE', 'current').click(); await cell('EVERYONE', 'alumni').click();
    w = await who(); for (const n of ['Msg Boss QA', 'Pm Alum QA', 'Eboard Student QA', 'Plain Student QA', 'Eboard Alum QA']) assert.ok(w.names.includes(n), `everyone includes ${n}`); assert.match(w.missed, /Pm Quiet QA \(announcements off\)/);
    // students only
    await clear(); await cell('EVERYONE', 'current').click(); w = await who(); assert.deepEqual(w.names.sort(), ['Eboard Student QA', 'Plain Student QA']);
    // alumni only
    await clear(); await cell('EVERYONE', 'alumni').click(); w = await who(); assert.ok(!w.names.includes('Eboard Student QA') && !w.names.includes('Plain Student QA') && w.names.includes('Eboard Alum QA'));
    // students on e-board (this semester) / everyone who's been on e-board
    await clear(); await cell('E-BOARD', 'current').click(); w = await who(); assert.deepEqual(w.names, ['Eboard Student QA']);
    await cell('E-BOARD', 'alumni').click(); w = await who(); assert.deepEqual(w.names.sort(), ['Eboard Alum QA', 'Eboard Student QA']);
    console.log('PASS: alumni in PM, texts only, everyone, students only, alumni only, e-board now, e-board ever: each lists exactly who, and who won\'t get it and why');

    // templates: placeholders can't go out; the text preview is exactly what phones get
    await page.locator('[data-templates] .portal-chip', { hasText: 'EVENT INVITE' }).click();
    await expect(page.locator('#mc-title')).toHaveValue('Invite: [Event name]');
    await expect(page.locator('[data-sms-bubble]')).toBeVisible();
    const bubble = await page.locator('[data-sms-bubble]').textContent();
    assert.ok(bubble.startsWith("TroyLabs: You're invited to [Event name]!") && bubble.trimEnd().endsWith('Reply STOP to opt out.'), bubble);
    await page.locator('[data-action="test-send"]').click(); await expect(page.locator('#msg-fb')).toContainText("Fill in [Event name] first");
    await page.locator('[data-action="send"]').click(); await expect(page.locator('#msg-fb')).toContainText("Fill in [Event name] first");
    await page.locator('#mc-title').fill('Invite: Demo Night'); await page.locator('#mc-body').fill("You're invited to Demo Night! Founders show what they built."); await page.locator('#mc-ev-name').fill('Demo Night'); await page.locator('#mc-ev-where').fill('[Location]');
    await page.locator('[data-action="send"]').click(); await expect(page.locator('#msg-fb')).toContainText('Fill in [Location] first');
    await sendBy('email'); await expect(page.locator('[data-sms-preview]')).toBeHidden();
    await page.locator('[data-templates] .portal-chip', { hasText: 'WELCOME TO THE NETWORK' }).click();
    await expect(page.locator('[data-aud-grid] .portal-chip[aria-pressed="true"]')).toHaveCount(2);   // everyone: students + alumni
    console.log('PASS: templates fill the composer; nothing sends or tests while a [placeholder] is left; the text preview is exactly "TroyLabs: …" through "Reply STOP to opt out."');

    // the automatic texts, word for word
    const auto = await page.locator('[data-auto-texts] .portal-sms-bubble').allTextContents();
    assert.deepEqual(auto, [WELCOME_TEXT, GOODBYE_TEXT, STOP_REPLY, HELP_REPLY]);
    // the one-time welcome: Pm Alum and Eboard Student turned texts on with no welcome yet
    await expect(page.locator('[data-backlog]')).toBeVisible(); await expect(page.locator('[data-backlog-note]')).toContainText('2 people');
    await page.locator('[data-backlog-who]').click(); assert.deepEqual((await page.locator('[data-backlog-list] .text-ink').allTextContents()).sort(), ['Eboard Student QA', 'Pm Alum QA']);
    page.once('dialog', (d) => d.accept()); await page.locator('[data-backlog-send]').click();
    await expect(page.locator('#msg-fb')).toContainText('Welcome sent to 2 people'); await expect(page.locator('[data-backlog]')).toBeHidden();
    const { data: ev } = await admin.from('profile_events').select('profile_id, detail').eq('event', 'texts_welcome').in('profile_id', [pmAlum.id, ebStudent.id]);
    assert.equal(ev.length, 2); assert.ok(ev.every((e) => e.detail.test && e.detail.backlog));
    console.log('PASS: the automatic texts shown word for word; the one-time welcome lists who turned texts on before texts worked, sends once (test accounts: recorded, nobody texted), then disappears');
    assert.deepEqual(errors, []); console.log('PASS: no browser errors');
  } finally { await browser.close(); }
} finally { for (const u of made) await u.cleanup(); await admin.rpc('purge_test_backups'); }
