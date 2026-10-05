// The whole sign-up journey (Bryan, 2026-10-05), as a new person and as an admin, with screenshots of every step:
//   the link → sign-in → create the profile (everything required) → SUBMIT FOR APPROVAL → the waiting screen →
//   coming back later, still waiting → editing while waiting → the admin's queue → approved → the network, searching
//   for someone, a member page, their own profile; and the other road: declined → "not approved" → restored.
// Also proves: nobody reaches the admins before submitting; the server refuses an unfinished submit; every submit is
// copied into profile_submissions, which nobody (member, admin or the server's own key) can change or delete.
// Temporary accounts only (example.com, made without sending email); all removed, test backups purged.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';

const admin = adminClient(), users = []; let browser;
const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321';
const out = 'test-results/journey'; mkdirSync(out, { recursive: true });
const ok = (r, m) => { assert.equal(r.error, null, `${m}: ${r.error?.message}`); return r.data; };
const shot = async (page, name, full = true) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}.png`, fullPage: full }); };
const noOverflow = async (page, label) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll: ${label}`);

try {
  // ── the database rules for a brand-new account ─────────────────────────────────────────────────
  const fresh = await makeUser(admin, 'unused', false, { blank: true }); users.push(fresh);
  const row = ok(await admin.from('profiles').select('approved, declined_at, submitted_at, personal_email, full_name').eq('id', fresh.id).single(), 'fresh row');
  assert.deepEqual(row, { approved: false, declined_at: null, submitted_at: null, personal_email: fresh.email, full_name: '' }, 'sign-up creates an empty, unapproved, unsubmitted profile');
  assert.deepEqual(ok(await fresh.sb.from('profiles').select('id'), 'pending read').map((r) => r.id), [fresh.id], 'a new account sees only its own profile');
  await fresh.sb.from('profiles').update({ approved: true }).eq('id', fresh.id);
  assert.equal((await admin.from('profiles').select('approved').eq('id', fresh.id).single()).data.approved, false, 'it cannot approve itself');
  assert.equal(ok(await fresh.sb.from('admins').select('user_id'), 'admins read').length, 0, 'it cannot read the admin list');
  console.log('PASS: 0 · a new account is empty, unapproved, unsubmitted, sees only itself and can’t approve itself');

  // a few people already in the network, so the search looks like the real thing
  const LA = 1, SF = 2;
  const cast = [
    ['Maya Chen', { status: 'alum', grad_year: 2022, join_term: 'FA', join_year: 2019, divisions: ['PRODUCT MANAGEMENT'], current_title: 'Product Manager', current_company: 'Stripe', city_id: SF, industries: ['FINTECH'], bio: 'PM at Stripe. Ran DEMO 2021.' }],
    ['Daniel Ortiz', { status: 'alum', grad_year: 2023, join_term: 'SP', join_year: 2021, divisions: ['TECH', 'BUILD'], current_title: 'Founder', current_company: 'Lumen Health', city_id: LA, industries: ['HEALTHTECH', 'AI'] }],
    ['Priya Patel', { status: 'student', grad_year: 2027, join_term: 'FA', join_year: 2024, divisions: ['VC/FINANCE'], current_title: 'Analyst Intern', current_company: 'Upfront Ventures', city_id: LA, industries: ['ENTERPRISE'] }],
  ];
  for (const [name, f] of cast) { const u = await makeUser(admin, name); users.push(u); ok(await admin.from('profiles').update({ ...f, submitted_at: new Date().toISOString() }).eq('id', u.id), name); }
  const boss = await makeUser(admin, 'Admin QA'); users.push(boss); ok(await admin.from('admins').insert({ user_id: boss.id }), 'admin');
  browser = await chromium.launch(); const errors = [];

  // ── 1. the link: the sign-in page ─────────────────────────────────────────────────────────────
  for (const [w, h, tag] of [[1440, 1000, 'desktop'], [390, 844, 'phone']]) {
    const sp = await browser.newPage({ viewport: { width: w, height: h } }); sp.on('pageerror', (e) => errors.push(e.message));
    await sp.route('**/auth/v1/otp**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));   // no real email is sent
    await sp.goto(`${base}/alumni-portal`);
    await expect(sp.getByRole('button', { name: 'EMAIL ME A LINK' })).toBeVisible(); await expect(sp.locator('#portal-auth')).toContainText('Sign in or join with your email');
    assert.equal(await sp.locator('input[type="password"], [role="tab"]').count(), 0, 'no password, no separate sign-up');
    await shot(sp, `01-sign-in-${tag}`);
    await sp.locator('#portal-email').fill('new.member@example.com'); await sp.getByRole('button', { name: 'EMAIL ME A LINK' }).click();
    await expect(sp.locator('#portal-msg')).toContainText('Check your inbox at new.member@example.com'); await sp.evaluate(() => scrollTo(0, 0)); await shot(sp, `02-check-your-inbox-${tag}`);
    await sp.close();
  }
  console.log('PASS: 1 · the link → sign-in with any email → "check your inbox" (desktop + phone)');

  // ── 2. a brand-new account opens their link: create the profile ──────────────────────────────
  const { page } = await signInPage(browser, fresh); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/alumni-portal/home`);
  await expect(page).toHaveURL(/\/alumni-portal\/profile\/?\?welcome=1&from=search$/);
  const panel = page.locator('#pf-onboard'), missing = panel.locator('[data-onboard-missing]'), submit = page.locator('.portal-profile [data-action="save"]');
  await expect(submit).toBeEnabled(); await expect(submit).toHaveText('SUBMIT FOR APPROVAL');
  await expect(panel.locator('[data-onboard-title]')).toHaveText('Create your profile');
  await expect(panel).toContainText('Search opens once your profile is finished and leadership approves you.');
  await expect(missing).toHaveText('Still needed: whether you’re a student or an alum, your name, your graduation year, the semester you joined TroyLabs, your division, your city, your LinkedIn profile link and your phone number.');
  assert.equal(await page.locator('[data-field="status"] .portal-chip[aria-pressed="true"]').count(), 0, 'neither STUDENT nor ALUM is picked for them');
  await shot(page, '03-create-profile-desktop');
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page, 'create profile, phone'); await shot(page, '03-create-profile-phone'); await page.setViewportSize({ width: 1440, height: 1000 });
  for (const path of [`members/?id=${boss.id}`, 'admin', 'admin/users']) { await page.goto(`${base}/alumni-portal/${path}`); await expect(page).toHaveURL(/profile\/?\?welcome=1(&from=\w+)?$/); }
  await expect(submit).toBeEnabled();
  console.log('PASS: 2 · new account → "Create your profile", everything required listed, nothing picked for them; every other page sends them back');

  // they can't submit half of it — and the server refuses even if the page were bypassed
  await page.locator('#pf-name').fill('Jordan Rivera'); await submit.click();
  await expect(page.locator('.portal-save .portal-feedback')).toContainText('Before you can submit, add whether you’re a student or an alum, your graduation year');
  await expect(submit).toHaveText('SUBMIT FOR APPROVAL');   // the button keeps its name; the message says what to do
  await expect(page.locator('[data-field="status"].portal-needs')).toHaveCount(1); await expect(page.locator('#pf-year.portal-needs')).toHaveCount(1); await expect(page.locator('#pf-loc.portal-needs')).toHaveCount(1); await expect(page.locator('#pf-li.portal-needs')).toHaveCount(1); await expect(page.locator('#pf-phone.portal-needs')).toHaveCount(1);
  await expect(page.locator('#pf-name.portal-needs')).toHaveCount(0);   // the name was filled in
  await page.locator('[data-field="status"] .portal-chip[data-value="alum"]').click(); await submit.click();
  await expect(page.locator('.portal-save .portal-feedback')).toContainText('Before you can submit, add your graduation year, the semester you joined TroyLabs, your division, your city, your LinkedIn profile link and your phone number');
  assert.ok((await fresh.sb.rpc('submit_application')).error, 'the server refuses an unfinished submit');
  await fresh.sb.from('profiles').update({ submitted_at: new Date().toISOString() }).eq('id', fresh.id);
  assert.equal((await admin.from('profiles').select('submitted_at').eq('id', fresh.id).single()).data.submitted_at, null, 'nobody can mark themselves submitted by editing the row');
  assert.equal(ok(await admin.from('profile_submissions').select('id').eq('profile_id', fresh.id), 'no backup yet').length, 0);
  await shot(page, '04-cannot-submit-yet', false);
  console.log('PASS: 2b · half a profile can’t be submitted (page and server both refuse; the row can’t be edited to "submitted")');

  // fill in everything, including e-board roles and a city typed but not placed
  await page.locator('#pf-classof-year').fill('2023'); await page.locator('#pf-term').selectOption('Fall'); await page.locator('#pf-year').fill('2021');
  for (const d of ['DESIGN', 'MARKETING']) await page.locator('[data-field="divisions"] .portal-chip', { hasText: d }).click();
  await page.locator('#pf-title').fill('Brand Designer'); await page.locator('#pf-co').fill('Figma'); await page.locator('#pf-li').fill('linkedin.com/in/Example-Person/'); await page.locator('#pf-phone').fill('(213) 555-0142');   // any spelling of the link; the phone saves with SUBMIT
  await page.locator('#pf-claim .portal-chip', { hasText: 'DIRECTOR OF DESIGN' }).click(); const role = page.locator('#pf-claim .portal-role-year[data-role="DIRECTOR OF DESIGN"]');
  await role.locator('select').first().selectOption('Fall'); await role.locator('input').first().fill('2022');
  await page.locator('#pf-note').fill('Design division FA21 to SP23; Director of Design FA22.');
  await page.locator('#pf-loc').fill('San Francisco, CA');
  await expect(missing).toHaveText('That’s everything. Press SUBMIT FOR APPROVAL at the bottom.');
  await expect(page.locator('.portal-save .portal-feedback')).toHaveText('');   // the earlier "not sent" went away once they started fixing it
  await shot(page, '05-profile-filled-in');
  await submit.click();
  await expect(panel.locator('[data-onboard-title]')).toHaveText('Submitted. Waiting for approval.');
  await expect(page.locator('.portal-save .portal-feedback')).toHaveText('Submitted. Your profile is with TroyLabs leadership.');
  { const saved = (await admin.from('profiles').select('linkedin_url, phone').eq('id', fresh.id).single()).data; assert.deepEqual(saved, { linkedin_url: 'https://www.linkedin.com/in/example-person', phone: '+12135550142' }, 'the link in one form, the phone saved by SUBMIT'); }
  await expect(submit).toHaveText('SAVE CHANGES', { timeout: 4000 });
  await shot(page, '06-submitted');
  const saved = ok(await admin.from('profiles').select('full_name, status, grad_year, join_term, join_year, divisions, approved, submitted_at, claimed_roles, request_note, city:cities(name)').eq('id', fresh.id).single(), 'saved');
  assert.equal(saved.full_name, 'Jordan Rivera'); assert.equal(saved.status, 'alum'); assert.equal(saved.grad_year, 2023); assert.equal(saved.join_term, 'FA'); assert.equal(saved.join_year, 2021);
  assert.deepEqual([...saved.divisions].sort(), ['DESIGN', 'MARKETING']); assert.equal(saved.city.name, 'San Francisco'); assert.equal(saved.request_note, 'Design division FA21 to SP23; Director of Design FA22.');
  assert.ok(saved.submitted_at, 'submitted'); assert.equal(saved.approved, false); assert.deepEqual(saved.claimed_roles, [{ role: 'DIRECTOR OF DESIGN', term: 'FA', year: 2022 }]);
  console.log('PASS: 3 · whole profile filled (typed city placed automatically) → SUBMIT → "Submitted. Waiting for approval."; the database matches');

  // the backup
  const backups = ok(await admin.from('profile_submissions').select('id, email, snapshot').eq('profile_id', fresh.id), 'backup');
  assert.equal(backups.length, 1, 'one backup copy for the submission'); assert.equal(backups[0].snapshot.full_name, 'Jordan Rivera'); assert.equal(backups[0].snapshot.city, 'San Francisco, CA'); assert.equal(backups[0].email, fresh.email);
  assert.equal(ok(await fresh.sb.from('profile_submissions').select('id'), 'member read').length, 0, 'a member can’t read the backups');
  await fresh.sb.from('profile_submissions').delete().eq('profile_id', fresh.id); await boss.sb.from('profile_submissions').delete().eq('profile_id', fresh.id);
  assert.ok((await admin.from('profile_submissions').delete().eq('id', backups[0].id)).error, 'not even the server’s own key can delete a backup');
  assert.ok((await admin.from('profile_submissions').update({ snapshot: {} }).eq('id', backups[0].id)).error, 'or change one');
  assert.equal(ok(await admin.from('profile_submissions').select('id').eq('profile_id', fresh.id), 'still there').length, 1, 'the backup survives every attempt');
  assert.equal(ok(await boss.sb.from('profile_submissions').select('id').eq('profile_id', fresh.id), 'admin read').length, 1, 'admins can read it');
  console.log('PASS: 4 · the submission is copied to the backup; members can’t see it; nobody can change or delete it (not admins, not the server key)');

  // ── 3. they come back later: still waiting ───────────────────────────────────────────────────
  await page.goto(`${base}/alumni-portal/home`);
  await expect(page.getByRole('heading', { name: 'WAITING FOR APPROVAL' })).toBeVisible(); await shot(page, '07-came-back-still-waiting-desktop', false);
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page, 'waiting, phone'); await shot(page, '07-came-back-still-waiting-phone', false); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/alumni-portal/admin`); await expect(page).toHaveURL(/\/alumni-portal\/home\/?$/);
  await page.goto(`${base}/alumni-portal/members/?id=${boss.id}`); await expect(page).toHaveURL(/\/alumni-portal\/home\/?$/);
  await page.getByRole('link', { name: 'EDIT YOUR PROFILE' }).click(); await expect(page.locator('.portal-profile [data-action="save"]')).toHaveText('SAVE CHANGES');
  await page.locator('#pf-bio').fill('Brand designer at Figma.'); await page.locator('.portal-profile [data-action="save"]').click();
  await expect(page.locator('.portal-save .portal-feedback')).toHaveText('Saved. Leadership sees your latest answers.');
  assert.equal(ok(await admin.from('profile_submissions').select('id').eq('profile_id', fresh.id), 'v2').length, 2, 'editing while waiting keeps another backup copy');
  console.log('PASS: 5 · coming back later → "Waiting for approval"; admin and member pages stay closed; edits while waiting save and are backed up too');

  // someone who signed in but never submitted is invisible to the admins
  const lurker = await makeUser(admin, 'Never Submitted QA', false); users.push(lurker);

  // ── 4. the admin ───────────────────────────────────────────────────────────────────────────────
  const { page: ap } = await signInPage(browser, boss); ap.on('pageerror', (e) => errors.push(e.message)); ap.on('dialog', (d) => d.accept());
  await ap.goto(`${base}/alumni-portal/admin`); await expect(ap.locator('[data-attention]')).toContainText(/waiting for approval/); await expect(ap.locator('[data-stat="members"]')).toHaveText(/^\d+$/); await shot(ap, '08-admin-overview');
  await ap.goto(`${base}/alumni-portal/admin/users`);
  const card = ap.locator('.portal-request', { hasText: 'Jordan Rivera' }); await expect(card).toBeVisible();
  for (const t of ['Class of 2023', 'joined FA21', 'MARKETING, DESIGN', 'E-board: Director of design (Fall 2022)']) await expect(card).toContainText(t);
  await expect(ap.locator('#approvals')).not.toContainText('Never Submitted QA'); await expect(ap.locator('body')).not.toContainText('STILL FILLING IN');
  await card.getByRole('button', { name: 'DETAILS' }).click(); await expect(card.locator('.portal-q-details')).toContainText('Brand Designer at Figma');
  await expect(card.getByRole('link', { name: /VIEW FULL PROFILE/ })).toHaveAttribute('href', `/alumni-portal/members/?id=${fresh.id}&from=approvals`);
  await shot(ap, '09-admin-waiting-list');
  await card.getByRole('button', { name: 'APPROVE' }).click(); await expect(ap.locator('#q-fb')).toContainText('Approved Jordan Rivera');
  await shot(ap, '10-admin-approved', false);
  assert.deepEqual(ok(await admin.from('eboard_roles').select('role, term, year').eq('profile_id', fresh.id), 'roles'), [{ role: 'DIRECTOR OF DESIGN', term: 'FA', year: 2022 }], 'their e-board role is now on record');
  console.log('PASS: 6 · admin sees them (answers, roles, details) and nobody who didn’t submit; APPROVE → in, role recorded');

  // ── 5. approved: they open the portal again ───────────────────────────────────────────────────
  await page.goto(`${base}/alumni-portal/home`); await expect(page.getByRole('heading', { name: 'WHO ARE YOU LOOKING FOR?' })).toBeVisible();
  await expect(page.locator('.portal-globe-wrap canvas')).toHaveCount(1, { timeout: 15000 }); await page.waitForTimeout(1500);
  await shot(page, '11-approved-network', false);
  await page.locator('#search-q').fill('Maya'); await expect(page.locator('.portal-card', { hasText: 'Maya Chen' })).toBeVisible(); await page.waitForTimeout(1800);
  await shot(page, '12-search-for-someone');
  await page.locator('.portal-card', { hasText: 'Maya Chen' }).click(); await expect(page.locator('[data-member-head]')).toBeVisible(); await expect(page.locator('[data-m-name]')).toHaveText('Maya Chen');
  await shot(page, '13-member-page', false);
  await page.locator('[data-back]').click(); await expect(page.locator('#search-q')).toHaveValue('Maya');
  await page.locator('#search-q').fill('Jordan Rivera'); await expect(page.locator('.portal-card', { hasText: 'Jordan Rivera' })).toBeVisible();
  await page.goto(`${base}/alumni-portal/profile`); await expect(page.locator('.portal-profile [data-action="save"]')).toHaveText('SAVE');
  await expect(page.locator('#pf-eboard')).toContainText(/Director of design/i); await expect(page.locator('#pf-onboard')).toBeHidden(); await expect(page.locator('#pf-claim')).toBeHidden();
  await shot(page, '14-their-profile-after-approval');
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/alumni-portal/home`); await page.locator('#search-q').fill('Maya'); await expect(page.locator('.portal-card', { hasText: 'Maya Chen' })).toBeVisible(); await page.waitForTimeout(1800); await noOverflow(page, 'search, phone'); await shot(page, '12-search-for-someone-phone');
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS: 7 · approved → the network and the globe; searching finds people; member page and back; they’re findable; their profile shows the e-board role');

  // ── 6. the other road: declined, what they see, restored ─────────────────────────────────────
  const second = await makeUser(admin, 'Riley Decline QA', false); users.push(second);
  const html = '<img src=x onerror="window.__injected=true">';
  ok(await admin.from('profiles').update({ request_note: `I was in TECH ${html}`, submitted_at: new Date().toISOString() }).eq('id', second.id), 'note with markup');
  await ap.goto(`${base}/alumni-portal/admin/users`);
  const card2 = ap.locator('.portal-request', { hasText: 'Riley Decline QA' });
  await expect(card2).toContainText(html); assert.equal(await ap.evaluate(() => window.__injected), undefined, 'a note is shown as text, never run');
  await card2.getByRole('button', { name: 'DECLINE' }).click(); await expect(card2).toHaveCount(0);
  await ap.locator('#declined-fold summary').click(); await expect(ap.locator('#declined-list')).toContainText('Riley Decline QA');
  const { page: dp } = await signInPage(browser, second); dp.on('pageerror', (e) => errors.push(e.message));
  await dp.goto(`${base}/alumni-portal/home`); await expect(dp.getByRole('heading', { name: 'NOT APPROVED' })).toBeVisible(); await shot(dp, '15-declined-sees', false);
  await ap.locator('#declined-list li', { hasText: 'Riley Decline QA' }).getByRole('button', { name: 'BACK TO WAITING LIST' }).click();
  await expect(ap.locator('.portal-request', { hasText: 'Riley Decline QA' })).toBeVisible();
  await dp.goto(`${base}/alumni-portal/home`); await expect(dp.getByRole('heading', { name: 'WAITING FOR APPROVAL' })).toBeVisible();
  console.log('PASS: 8 · decline → they see "not approved"; BACK TO WAITING LIST restores them; a note is shown as text, never run');

  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS: no browser errors');
} finally {
  if (browser) await browser.close();
  for (const u of users.reverse()) await u.cleanup();
  const purged = await admin.rpc('purge_test_backups');
  console.log(`Cleaned up ${users.length} temporary accounts; purged ${purged.data ?? 0} test backup rows${purged.error ? ` (purge failed: ${purged.error.message})` : ''}.`);
}
