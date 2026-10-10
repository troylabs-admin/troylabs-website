// Admin › Members › waiting for approval, at scale (Bryan, 2026-10-02: "what if there's a hundred approvals?").
// 60 finished applications + 2 unfinished + 1 who lists e-board roles + 1 declined, then every control:
// paging, search, sort, select / select all / select everyone, bulk approve and decline with UNDO, details,
// VIEW FULL PROFILE and the way back, the unfinished and declined folds, claimed roles becoming the record,
// and the database refusing the same things to non-admins. Temporary accounts only; all removed.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';

const admin = adminClient(), made = []; let browser;
const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321';
const out = 'test-results/portal'; mkdirSync(out, { recursive: true });
/** an applicant without a session (no sign-in, so no auth rate limit) */
async function applicant(name, fields = {}) {
  const { data, error } = await admin.auth.admin.createUser({ email: `tl-qa-${crypto.randomUUID()}@example.com`, email_confirm: true });
  if (error) throw error; const id = data.user.id; made.push(id);
  const { error: pe } = await admin.from('profiles').update({ full_name: name, status: 'alum', grad_year: 2022, join_term: 'FA', join_year: 2019, divisions: ['TECH'], city_id: 1, approved: false, submitted_at: new Date().toISOString(), ...fields }).eq('id', id);
  if (pe) throw pe; return id;
}
const state = async (ids) => Object.fromEntries(((await admin.from('profiles').select('id, approved, declined_at').in('id', ids)).data ?? []).map((r) => [r.id, r.approved ? 'approved' : r.declined_at ? 'declined' : 'waiting']));

try {
  const boss = await makeUser(admin, 'Queue Admin QA'); made.push(boss.id); await admin.from('admins').insert({ user_id: boss.id });
  const ids = [];
  for (let i = 1; i <= 60; i++) {
    const id = await applicant(`Queue QA ${String(i).padStart(2, '0')}`);
    await admin.from('profiles').update({ created_at: new Date(Date.UTC(2026, 8, 1) + i * 3600e3).toISOString() }).eq('id', id);   // 01 oldest … 60 newest
    ids.push(id);
  }
  const claimer = await applicant('Queue Claimer QA', { divisions: ['DESIGN', 'MARKETING'], request_note: 'Ran design FA23 to SP24.', linkedin_url: 'https://www.linkedin.com/in/example', claimed_roles: [{ role: 'DIRECTOR OF DESIGN', term: 'FA', year: 2023 }, { role: 'DIRECTOR OF DESIGN', term: 'SP', year: 2024 }] });
  const unsubmitted = await applicant('Half Done QA', { join_year: null, submitted_at: null });   // signed in, never pressed SUBMIT
  const declinedOne = await applicant('Already Declined QA', { declined_at: new Date().toISOString() });
  const mine = new Set([...ids, claimer]);

  browser = await chromium.launch(); const errors = [];
  const { page } = await signInPage(browser, boss); page.on('pageerror', (e) => errors.push(e.message)); page.on('dialog', (d) => d.accept());
  await page.goto(`${base}/alumni-portal/admin/users`);
  const rowsOf = page.locator('#requests-list .portal-q-row'); const row = (name) => page.locator('#requests-list .portal-q-row', { hasText: name });
  await expect(rowsOf).toHaveCount(25);
  const total = Number(await page.locator('#requests-n').innerText()); assert.ok(total >= 61, `the count includes all 61 finished applications (${total})`);
  await expect(page.locator('a[href="/alumni-portal/admin"] .portal-count').first()).toHaveText(String(total));
  await expect(page.locator('#requests-list')).not.toContainText('Half Done QA');
  console.log('PASS: 25 at a time; the count and the nav badge count finished applications only');

  // paging, search, sort
  await page.locator('[data-q-more]').click(); await expect(rowsOf).toHaveCount(50); await expect(page.locator('[data-q-more]')).toContainText(`${total - 50} LEFT`);
  await page.locator('#q-search').fill('Queue QA 07'); await expect(row('Queue QA 07')).toHaveCount(1); assert.ok((await rowsOf.count()) < 25, 'the search narrows the list');   // test emails hold random ids, so a few others contain "07" too
  await page.locator('#q-search').fill('design marketing'); await expect(row('Queue Claimer QA')).toHaveCount(1);
  await page.locator('#q-search').fill('nobody-by-this-name'); await expect(page.locator('#requests-list')).toContainText('Nobody matches that search');
  await page.locator('#q-search').fill('Queue QA');
  const names = async () => (await page.locator('#requests-list .portal-q-name').allInnerTexts()).filter((n) => /^Queue QA \d\d$/.test(n));
  assert.deepEqual((await names()).slice(0, 3), ['Queue QA 01', 'Queue QA 02', 'Queue QA 03'], 'oldest first by default');
  await page.locator('#q-sort').selectOption('newest'); assert.deepEqual((await names()).slice(0, 2), ['Queue QA 60', 'Queue QA 59'], 'newest first');
  await page.locator('#q-sort').selectOption('name'); assert.deepEqual((await names()).slice(0, 2), ['Queue QA 01', 'Queue QA 02'], 'name A–Z');
  await page.locator('#q-sort').selectOption('oldest');
  console.log('PASS: show more, search (name, division, nothing found), sort oldest / newest / name');

  // selection: some, the shown page, everyone
  await page.locator('#q-search').fill('Queue QA');
  const shownCount = await rowsOf.count();
  await page.locator('.portal-q-bar label.portal-check').click(); await expect(page.locator('[data-q-selected]')).toHaveText(`${shownCount} selected`);
  await expect(page.locator('[data-q-everyone]')).toHaveText('SELECT ALL 61'); await page.locator('[data-q-everyone]').click(); await expect(page.locator('[data-q-selected]')).toHaveText('61 selected');   // "Queue QA" matches the 60 and Queue Claimer QA
  await page.locator('.portal-q-bar label.portal-check').click(); await expect(page.locator('[data-q-selected]')).toHaveText('0 selected'); await expect(page.locator('[data-q-approve]')).toBeDisabled();
  console.log('PASS: select the shown page, then all 61 matching; unticking clears; the buttons wake only with a selection');

  // bulk approve three, UNDO, approve again
  for (const id of ids.slice(0, 3)) await admin.from('profiles').update({ phone: `+1213555${String(ids.indexOf(id)).padStart(4, '0')}`, phone_opt_in: true }).eq('id', id);   // texts on, as after sign-up
  const welcomes = async () => ((await admin.from('profile_events').select('profile_id, detail').eq('event', 'texts_welcome').in('profile_id', ids.slice(0, 3))).data ?? []);
  for (const n of ['Queue QA 01', 'Queue QA 02', 'Queue QA 03']) await row(n).locator('label.portal-check').click();
  await expect(page.locator('[data-q-approve]')).toHaveText('APPROVE 3 SELECTED');
  await page.locator('[data-q-approve]').click(); await expect(page.locator('#q-fb')).toContainText('Approved 3 people');
  assert.deepEqual(Object.values(await state(ids.slice(0, 3))), ['approved', 'approved', 'approved']);
  await expect(row('Queue QA 01')).toHaveCount(0);
  await page.locator('[data-q-undo]').click(); await expect(page.locator('#q-fb')).toContainText('3 people back on the waiting list');
  assert.deepEqual(Object.values(await state(ids.slice(0, 3))), ['waiting', 'waiting', 'waiting'], 'UNDO puts them back');
  await expect(row('Queue QA 01')).toHaveCount(1);
  // approval sent each of them the "you're in" text (test accounts: recorded, nobody texted); approving again doesn't text twice
  { const w = await welcomes(); assert.equal(w.length, 3, 'one "you\'re in" text each'); assert.ok(w.every((e) => e.detail.approved && e.detail.test && e.detail.card === true), 'each with the contact card'); }
  for (const n of ['Queue QA 01', 'Queue QA 02', 'Queue QA 03']) await row(n).locator('label.portal-check').click();
  await page.locator('[data-q-approve]').click(); await expect(page.locator('#q-fb')).toContainText('Approved 3 people');
  assert.equal((await welcomes()).length, 3, 'approving again after UNDO doesn\'t text twice');
  await page.locator('[data-q-undo]').click(); await expect(page.locator('#q-fb')).toContainText('3 people back on the waiting list');
  console.log('PASS: bulk approve 3 → approved in the database, each gets the "you\'re in" text once (not again after UNDO and re-approve); UNDO → back on the list');

  // bulk decline two, then one comes back from the Declined list
  for (const n of ['Queue QA 04', 'Queue QA 05']) await row(n).locator('label.portal-check').click();
  await page.locator('[data-q-decline]').click(); await page.locator('[data-q-confirm-decline]').click(); await expect(page.locator('#q-fb')).toContainText('Declined 2 people');
  assert.deepEqual(Object.values(await state(ids.slice(3, 5))), ['declined', 'declined']);
  await page.locator('#declined-fold summary').click(); await expect(page.locator('#declined-list')).toContainText('Queue QA 04'); await expect(page.locator('#declined-list')).toContainText('Already Declined QA');
  await page.locator('#declined-list li', { hasText: 'Queue QA 04' }).getByRole('button', { name: 'BACK TO WAITING LIST' }).click();
  await expect(row('Queue QA 04')).toHaveCount(1); assert.equal((await state([ids[3]]))[ids[3]], 'waiting');
  console.log('PASS: bulk decline 2; the Declined list shows them and BACK TO WAITING LIST restores one');

  // one person: details, their claimed roles, VIEW FULL PROFILE and back, approve → roles become the record
  await page.locator('#q-search').fill('Claimer');
  const c = row('Queue Claimer QA');
  await expect(c).toContainText('E-board: Director of design (Fall 2023, Spring 2024)');
  await c.getByRole('button', { name: 'DETAILS' }).click(); await expect(c.locator('.portal-q-details')).toBeVisible(); await expect(c.locator('.portal-q-details')).toContainText('Ran design FA23 to SP24.');
  await expect(c.locator('.portal-q-details a[href*="linkedin.com"]')).toHaveAttribute('target', '_blank');
  await c.getByRole('link', { name: /VIEW FULL PROFILE/ }).click();
  await expect(page).toHaveURL(new RegExp(`/alumni-portal/members/\\?id=${claimer}&from=approvals`));
  const back = page.locator('[data-back]'); await expect(back).toHaveText('← BACK TO WAITING FOR APPROVAL'); await back.click();
  await expect(page).toHaveURL(/\/alumni-portal\/admin\/users\/?#approvals$/); await expect(rowsOf).toHaveCount(25); await expect(page.locator('#q-search')).toHaveValue('');   // a fresh list, not the search from before
  await page.locator('#q-search').fill('Claimer'); await row('Queue Claimer QA').getByRole('button', { name: 'APPROVE' }).click(); await expect(page.locator('#q-fb')).toContainText('Approved Queue Claimer QA');
  const roles = (await admin.from('eboard_roles').select('role, term, year').eq('profile_id', claimer).order('year')).data;
  assert.deepEqual(roles, [{ role: 'DIRECTOR OF DESIGN', term: 'FA', year: 2023 }, { role: 'DIRECTOR OF DESIGN', term: 'SP', year: 2024 }], 'approving made the claimed roles their e-board record');
  console.log('PASS: details (note, LinkedIn), claimed e-board roles shown, VIEW FULL PROFILE → back to the waiting list, approve → roles recorded');

  // someone who never submitted is nowhere on the admin pages
  await page.locator('#q-search').fill('Half Done'); await expect(page.locator('#requests-list')).toContainText('Nobody matches that search');
  await expect(page.locator('body')).not.toContainText('Half Done QA'); await page.locator('#q-search').fill('');
  console.log('PASS: people who never pressed SUBMIT FOR APPROVAL aren’t shown to admins at all');

  // the database refuses non-admins
  const member = await makeUser(admin, 'Queue Member QA'); made.push(member.id);
  assert.ok((await member.sb.rpc('approve_members', { ids: [ids[10]] })).error, 'a member cannot approve');
  assert.ok((await member.sb.rpc('decline_members', { ids: [ids[10]] })).error, 'a member cannot decline');
  const loser = await makeUser(admin, 'Queue Declined QA', false); made.push(loser.id); await admin.from('profiles').update({ declined_at: new Date().toISOString() }).eq('id', loser.id);
  await loser.sb.from('profiles').update({ declined_at: null }).eq('id', loser.id);
  assert.ok((await admin.from('profiles').select('declined_at').eq('id', loser.id).single()).data.declined_at, 'a declined person cannot clear their own decline');
  assert.equal((await state([ids[10]]))[ids[10]], 'waiting');
  console.log('PASS: members cannot approve or decline; a declined person cannot put themselves back');

  // phone
  await page.locator('#q-search').fill('');
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll at 390');
  await page.locator('#approvals').screenshot({ path: `${out}/approvals-390.png` }); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#approvals').screenshot({ path: `${out}/approvals-1440.png`, clip: undefined });
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS: fits a phone; no browser errors');
} finally {
  if (browser) await browser.close();
  for (const id of made.reverse()) await admin.auth.admin.deleteUser(id);
  console.log(`Cleaned up ${made.length} temporary accounts.`);
}
