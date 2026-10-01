// Sign-up and approval (Bryan, 2026-09-30): everyone gets the site link, signs up with any email, creates
// their own profile, waits, and leadership approves or declines them by hand on Admin › Members.
// Temporary accounts only (example.com, created without sending email); all removed at the end.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';

const admin = adminClient(), users = []; let browser;
const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321';
const out = 'test-results/portal'; mkdirSync(out, { recursive: true });
const ok = (r, m) => { assert.equal(r.error, null, `${m}: ${r.error?.message}`); return r.data; };
const noOverflow = async (page, label) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll: ${label}`);

try {
  // ── database: a brand-new account from a personal email ─────────────────────────────────────────
  const fresh = await makeUser(admin, 'unused', false, { blank: true }); users.push(fresh);
  const row = ok(await admin.from('profiles').select('approved, declined_at, personal_email, usc_email, full_name').eq('id', fresh.id).single(), 'fresh row');
  assert.deepEqual(row, { approved: false, declined_at: null, personal_email: fresh.email, usc_email: null, full_name: '' }, 'sign-up creates an empty, unapproved profile keyed to the email used');
  const visible = ok(await fresh.sb.from('profiles').select('id'), 'pending read');
  assert.deepEqual(visible.map((r) => r.id), [fresh.id], 'a pending account sees only its own profile');
  assert.ok((await fresh.sb.from('profiles').update({ approved: true }).eq('id', fresh.id)).error, 'a pending account cannot approve itself');
  assert.equal(ok(await fresh.sb.from('admins').select('user_id'), 'admins read').length, 0, 'a pending account cannot read the admin list');
  console.log('PASS: database — new account is unapproved, sees only itself, cannot approve itself');

  const boss = await makeUser(admin, 'Admin QA'); users.push(boss);
  ok(await admin.from('admins').insert({ user_id: boss.id }), 'temporary admin');
  browser = await chromium.launch();
  const errors = [];

  // ── a brand-new member is sent to create their profile ──────────────────────────────────────────
  const { page } = await signInPage(browser, fresh); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/alumni-portal/home`);
  await expect(page).toHaveURL(/\/alumni-portal\/profile\/?\?welcome=1$/);
  const panel = page.locator('#pf-onboard'), missing = panel.locator('[data-onboard-missing]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-onboard-title]')).toHaveText('Create your profile');
  await expect(missing).toHaveText('Still needed: your name, your graduation year, the semester you joined TroyLabs and your division.');
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await noOverflow(page, `profile sign-up panel at ${width}`); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/alumni-portal/members/?id=${boss.id}`); await expect(page).toHaveURL(/profile\/?\?welcome=1$/);
  await page.goto(`${base}/alumni-portal/admin`); await expect(page).toHaveURL(/profile\/?\?welcome=1$/);
  console.log('PASS: new account lands on "Create your profile"; every other page sends it back there');

  // the list of what is still needed follows the form as it is filled (wait until the profile has loaded:
  // SAVE stays disabled until then, and the load fills every field)
  await expect(page.locator('.portal-profile [data-action="save"]')).toBeEnabled();
  await page.locator('#pf-name').fill('Jordan Fresh QA');
  await expect(missing).toHaveText('Still needed: your graduation year, the semester you joined TroyLabs and your division.');
  await page.locator('[data-field="status"] .portal-chip[data-value="alum"]').click();
  await page.locator('#pf-classof-year').fill('2023');
  await page.locator('#pf-term').selectOption('Fall'); await page.locator('#pf-year').fill('2021');
  await page.locator('[data-field="divisions"] .portal-chip', { hasText: 'DESIGN' }).click();
  await expect(missing).toHaveText('That’s everything needed. Press SAVE at the bottom to send it.');
  await page.locator('#pf-note').fill('Design division FA21 to SP23; ran the BUILD demo-day site.');
  await page.locator('[data-action="save"]').click();
  await expect(panel.locator('[data-onboard-title]')).toHaveText('Sent. You’re on the list.');
  await expect(page.locator('.portal-save .portal-feedback')).toHaveText('Saved. Your profile is with TroyLabs leadership.');
  const saved = ok(await admin.from('profiles').select('full_name, status, grad_year, join_term, join_year, divisions, request_note, approved').eq('id', fresh.id).single(), 'saved');
  assert.deepEqual(saved, { full_name: 'Jordan Fresh QA', status: 'alum', grad_year: 2023, join_term: 'FA', join_year: 2021, divisions: ['DESIGN'], request_note: 'Design division FA21 to SP23; ran the BUILD demo-day site.', approved: false });
  await page.screenshot({ path: `${out}/onboarding-sent.png`, fullPage: true });
  console.log('PASS: missing list updates live; SAVE sends the profile and the note; database matches');

  // ── the waiting screen ──────────────────────────────────────────────────────────────────────────
  await page.goto(`${base}/alumni-portal/home`);
  await expect(page.getByRole('heading', { name: "YOU'RE ON THE LIST" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'EDIT YOUR PROFILE' })).toHaveAttribute('href', '/alumni-portal/profile');
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page, 'waiting screen at 390'); await page.screenshot({ path: `${out}/waiting-390.png` }); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/alumni-portal/members/?id=${boss.id}`); await expect(page).toHaveURL(/\/alumni-portal\/home\/?$/);
  console.log('PASS: finished profile → waiting screen; member pages stay closed');

  // ── the admin accepts them ──────────────────────────────────────────────────────────────────────
  const { page: ap } = await signInPage(browser, boss); ap.on('pageerror', (e) => errors.push(e.message)); ap.on('dialog', (d) => d.accept());
  await ap.goto(`${base}/alumni-portal/admin/users`);
  const card = ap.locator('.portal-request', { hasText: 'Jordan Fresh QA' });
  await expect(card).toBeVisible();
  for (const text of ['Class of 2023', 'joined FA21', 'DESIGN', fresh.email, 'ran the BUILD demo-day site']) await expect(card).toContainText(text);
  await expect(ap.locator('a[href="/alumni-portal/admin"] .portal-count').first()).toHaveText(/^[1-9]\d*$/);
  await expect(card.getByRole('link', { name: 'VIEW PROFILE' })).toHaveAttribute('href', `/alumni-portal/members/?id=${fresh.id}`);
  await card.getByRole('button', { name: 'APPROVE' }).click();
  await expect(ap.locator('#members-fb')).toContainText('Approved Jordan Fresh QA');
  await expect(card).toHaveCount(0);
  await expect(ap.locator('[data-members] tbody')).toContainText('Jordan Fresh QA');
  await page.goto(`${base}/alumni-portal/home`);
  await expect(page.getByRole('heading', { name: 'WHO ARE YOU LOOKING FOR?' })).toBeVisible();
  console.log('PASS: admin sees the badge and the person’s answers, approves, and the member gets the network');

  // ── decline, what the declined person sees, and restore ─────────────────────────────────────────
  const second = await makeUser(admin, 'Riley Decline QA', false); users.push(second);
  const html = '<img src=x onerror="window.__injected=true">';
  ok(await admin.from('profiles').update({ request_note: `I was in TECH ${html}` }).eq('id', second.id), 'note with markup');
  await ap.reload();
  const card2 = ap.locator('.portal-request', { hasText: 'Riley Decline QA' });
  await expect(card2).toContainText(html);
  assert.equal(await ap.evaluate(() => window.__injected), undefined, 'a note is shown as text, never run');
  await ap.setViewportSize({ width: 390, height: 844 }); await noOverflow(ap, 'approval queue at 390'); await card2.screenshot({ path: `${out}/queue-card-390.png` }); await ap.setViewportSize({ width: 1440, height: 1000 });
  await card2.getByRole('button', { name: 'DECLINE' }).click();
  await expect(card2).toHaveCount(0);
  await ap.locator('#declined-fold summary').click();
  await expect(ap.locator('#declined-list')).toContainText('Riley Decline QA');
  const { page: dp } = await signInPage(browser, second); dp.on('pageerror', (e) => errors.push(e.message));
  await dp.goto(`${base}/alumni-portal/home`); await expect(dp.getByRole('heading', { name: 'NOT APPROVED' })).toBeVisible();
  await dp.goto(`${base}/alumni-portal/profile`); await expect(dp.locator('#pf-onboard [data-onboard-title]')).toHaveText('Your request wasn’t approved');
  await ap.locator('#declined-list li', { hasText: 'Riley Decline QA' }).getByRole('button', { name: 'BACK TO WAITING LIST' }).click();
  await expect(ap.locator('.portal-request', { hasText: 'Riley Decline QA' })).toBeVisible();
  await dp.goto(`${base}/alumni-portal/home`); await expect(dp.getByRole('heading', { name: "YOU'RE ON THE LIST" })).toBeVisible();
  console.log('PASS: decline shows "not approved" to them; back to the waiting list restores them; notes are escaped');

  // ── the sign-in page invites new people in, without a password or a separate sign-up ────────────
  const sp = await browser.newPage(); await sp.goto(`${base}/alumni-portal`);
  await expect(sp.getByRole('button', { name: 'EMAIL ME A LINK' })).toBeVisible();
  await expect(sp.locator('#portal-auth')).toContainText('New here? Use any email you check.');
  assert.equal(await sp.locator('input[type="password"], [role="tab"]').count(), 0, 'no password field, no sign-up tab');

  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log('PASS: sign-in page copy; no browser errors');
} finally {
  if (browser) await browser.close();
  for (const u of users.reverse()) await u.cleanup();
  console.log(`Cleaned up ${users.length} temporary accounts.`);
}
