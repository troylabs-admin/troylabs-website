// The admin pages rebuilt on 2026-10-02, button by button: Overview (needs-your-attention, numbers, copy the sign-up
// link, every common job), Analytics (PostHog connected + refreshed time, 7 / 30 / 90 days, refresh), Message (the
// example messages while there are none, their buttons and tabs), the member page's way back, and the profile's
// "were you on e-board?" picker for people waiting. Temporary accounts only; all removed.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';

const admin = adminClient(), users = []; let browser;
const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321';
const out = 'test-results/portal'; mkdirSync(out, { recursive: true });
const num = async (loc) => Number((await loc.innerText()).replace(/[^\d]/g, ''));

try {
  const boss = await makeUser(admin, 'Pages Admin QA'); users.push(boss); await admin.from('admins').insert({ user_id: boss.id });
  const waiting = await makeUser(admin, 'Pages Waiting QA', false); users.push(waiting); await admin.from('profiles').update({ submitted_at: new Date().toISOString() }).eq('id', waiting.id);
  browser = await chromium.launch(); const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(({ key, session }) => { if (!sessionStorage.getItem('tl-qa-seeded')) { localStorage.setItem(key, JSON.stringify(session)); sessionStorage.setItem('tl-qa-seeded', '1'); } }, { key: 'sb-ackmhqxyxnceoarbhcrp-auth-token', session: boss.session });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message)); page.on('dialog', (d) => d.accept());

  // ── Overview ───────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${base}/alumni-portal/admin`);
  const att = page.locator('[data-attention]');
  await expect(att).toContainText(/waiting for approval/); await expect(att.getByRole('link', { name: 'REVIEW →' })).toHaveAttribute('href', '/alumni-portal/admin/users#approvals');
  await expect(att).toContainText('Email isn’t connected yet'); await expect(att).toContainText('Twilio trial');
  await expect(page.locator('[data-stat="members"]')).toHaveText(/^\d+$/); await expect(page.locator('[data-stat="site:$pageview"]')).toHaveText(/^[\d,]+$/, { timeout: 15000 });
  assert.ok(await num(page.locator('[data-stat="site:$pageview"]')) > 0, 'website visits come from PostHog');
  await expect(page.locator('[data-upcoming]')).toContainText(/Nothing scheduled|·/); await expect(page.locator('[data-recent]')).not.toContainText('—');
  await page.locator('[data-copy-link]').click(); await expect(page.locator('[data-copy-link]')).toHaveText('COPIED');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'https://usctroylabs.com/alumni-portal', 'COPY puts the sign-up link on the clipboard');
  for (const [name, url] of [['WRITE A MESSAGE', /admin\/messages/], ['REVIEW SIGN-UPS', /admin\/users\/?#approvals/], ['FIND OR EXPORT MEMBERS', /admin\/users\/?#members/], ['SEE ANALYTICS', /admin\/analytics/]]) {
    await page.goto(`${base}/alumni-portal/admin`); await page.getByRole('link', { name, exact: true }).click(); await expect(page).toHaveURL(url);
  }
  await page.goto(`${base}/alumni-portal/admin`); await expect(page.locator('[data-stat="members"]')).toHaveText(/^\d+$/);
  await page.locator('main, body').first().screenshot({ path: `${out}/overview-1440.png`, fullPage: true });
  console.log('PASS: Overview — attention (waiting → REVIEW, email and texts not connected), numbers incl. PostHog visits, COPY, every common job lands on the right page');

  // ── Analytics ──────────────────────────────────────────────────────────────────────────────────
  let asks = 0; const count = (r) => { if (r.url().includes('posthog-stats')) asks++; }; page.on('request', count);
  await page.goto(`${base}/alumni-portal/admin/analytics`);
  const status = page.locator('[data-site-status]');
  await expect(status).toContainText(/Connected to PostHog · refreshed .+ · last 30 days/, { timeout: 15000 });
  await page.waitForTimeout(1500); assert.equal(asks, 1, 'the page asks PostHog once per load (it used to ask twice)'); page.off('request', count);
  const views = {}; views[30] = await num(page.locator('[data-stat="site:$pageview"]'));
  for (const d of [7, 90]) {
    await page.locator(`[data-days] .portal-chip[data-value="${d}"]`).click();
    await expect(status).toContainText(`last ${d} days`, { timeout: 15000 }); await expect(page.locator('[data-period]').first()).toHaveText(`last ${d} days`);
    await page.waitForTimeout(900); views[d] = await num(page.locator('[data-stat="site:$pageview"]'));
  }
  assert.ok(views[7] <= views[30] && views[30] <= views[90], `page views grow with the period: ${JSON.stringify(views)}`);
  await expect(page.locator('[data-list="pages"] li').first()).toContainText('/'); await expect(page.locator('[data-list="devices"] li').first()).toContainText(/desktop|phone|tablet|not recorded/);
  await expect(page.locator('[data-list="portalPages"] li').first()).not.toHaveText('—');
  await page.getByRole('button', { name: 'REFRESH' }).click(); await expect(page.getByRole('button', { name: 'REFRESH' })).toHaveText('REFRESH', { timeout: 15000 }); await expect(status).toContainText('Connected to PostHog');
  await expect(page.locator('.portal-source').first()).toContainText('TROYLABS WEBSITE');
  console.log(`PASS: Analytics — connected + refreshed time, website first, 7 / 30 / 90 days (${views[7]} / ${views[30]} / ${views[90]} page views), lists filled, REFRESH`);

  // ── Message: examples while there are no messages ──────────────────────────────────────────────
  const real = (await admin.from('messages').select('id', { count: 'exact', head: true })).count;
  await page.goto(`${base}/alumni-portal/admin/messages`); await expect(page.locator('[data-action="preview"]')).toBeEnabled();
  await expect(page.getByText('How the groups stay current')).toHaveCount(0);
  if (real === 0) {
    await expect(page.locator('.portal-tag-example')).toHaveCount(4);
    const sent = page.locator('li[data-example="1"]');
    await sent.getByRole('button', { name: 'WHO GOT IT' }).click(); await expect(sent.locator('.portal-recipients')).toBeVisible(); await expect(sent.locator('.portal-recipients')).toContainText('FAILED: the carrier filtered it as spam');
    await sent.getByRole('button', { name: 'HIDE' }).click(); await expect(sent.locator('.portal-recipients')).toBeHidden();
    await page.locator('[data-msg-tabs] .portal-chip[data-value="sent"]').click(); await expect(page.locator('li[data-example]:visible')).toHaveCount(2);
    await page.locator('[data-msg-tabs] .portal-chip[data-value="all"]').click(); await expect(page.locator('li[data-example]:visible')).toHaveCount(4);
    await page.locator('li[data-example="2"]').getByRole('button', { name: 'USE AS A STARTING POINT' }).click();
    await expect(page.locator('#mc-title')).toHaveValue('Looking for BUILD mentors');
    const on = await page.locator('[data-aud-grid] .portal-chip[aria-pressed="true"]').evaluateAll((els) => els.map((e) => `${e.dataset.group}|${e.dataset.who}`).sort());
    assert.deepEqual(on, ['BUILD|alumni', 'PRODUCT MANAGEMENT|alumni', 'TECH|alumni'], 'the example loads its audience into the grid');
    assert.equal((await admin.from('messages').select('id', { count: 'exact', head: true })).count, 0, 'loading an example saves nothing');
    await page.locator('[data-msg-list]').screenshot({ path: `${out}/message-examples.png` });
    console.log('PASS: Message — 4 examples, WHO GOT IT / HIDE, tabs filter them, USE AS A STARTING POINT fills the composer (nothing saved); the groups section is gone');
  } else console.log(`SKIP: examples (the database has ${real} real messages, so they're hidden as designed)`);

  // ── the member page's way back ────────────────────────────────────────────────────────────────
  await page.goto(`${base}/alumni-portal/members/?id=${boss.id}&from=members`); await expect(page.locator('[data-back]')).toHaveText('← BACK TO MEMBERS'); await expect(page.locator('[data-back]')).toHaveAttribute('href', '/alumni-portal/admin/users#members');
  await page.goto(`${base}/alumni-portal/members/?id=${boss.id}`); await expect(page.locator('[data-back]')).toHaveText('← BACK TO SEARCH');
  console.log('PASS: member page — back to members / waiting list when you came from Admin, back to search otherwise');

  // ── the profile's e-board picker, for someone waiting ─────────────────────────────────────────
  const { page: wp } = await signInPage(browser, waiting); wp.on('pageerror', (e) => errors.push(e.message));
  await wp.goto(`${base}/alumni-portal/profile`); await expect(wp.locator('.portal-profile [data-action="save"]')).toBeEnabled();
  await expect(wp.locator('#pf-claim')).toBeVisible();
  await wp.locator('#pf-claim .portal-chip', { hasText: 'DIRECTOR OF TECH' }).click();
  await wp.locator('[data-action="save"]').click(); await expect(wp.locator('.portal-save .portal-feedback')).toContainText('Add the semester and year you were DIRECTOR OF TECH');
  const row = wp.locator('#pf-claim .portal-role-year[data-role="DIRECTOR OF TECH"]');
  await row.locator('input').first().fill('20x4'); await wp.locator('[data-action="save"]').click(); await expect(wp.locator('.portal-save .portal-feedback')).toContainText('isn\'t a year');
  await row.locator('select').first().selectOption('Fall'); await row.locator('input').first().fill('2024');
  await row.getByRole('button', { name: '+ ANOTHER SEMESTER' }).click(); await row.locator('select').nth(1).selectOption('Spring'); await row.locator('input').nth(1).fill('2025');
  await wp.locator('[data-action="save"]').click(); await expect(wp.locator('.portal-save .portal-feedback')).toContainText(/Saved|Submitted/);
  assert.deepEqual((await admin.from('profiles').select('claimed_roles').eq('id', waiting.id).single()).data.claimed_roles, [{ role: 'DIRECTOR OF TECH', term: 'FA', year: 2024 }, { role: 'DIRECTOR OF TECH', term: 'SP', year: 2025 }]);
  await wp.reload(); await expect(wp.locator('.portal-profile [data-action="save"]')).toBeEnabled();
  await expect(wp.locator('#pf-claim .portal-role-year[data-role="DIRECTOR OF TECH"] input')).toHaveCount(2); await expect(wp.locator('#pf-claim .portal-role-year[data-role="DIRECTOR OF TECH"] input').nth(1)).toHaveValue('2025');
  await expect(page.locator('body')).toBeVisible();
  await page.goto(`${base}/alumni-portal/profile`); await expect(page.locator('.portal-profile [data-action="save"]')).toBeEnabled(); await expect(page.locator('#pf-claim')).toBeHidden();
  console.log('PASS: profile — someone waiting lists e-board roles (role without a year and a bad year refused), saved and restored; approved members don’t see the picker');

  // ── the audit's findings (2026-10-02), each proven fixed ──────────────────────────────────────
  const other = await makeUser(admin, 'Pages Other QA'); users.push(other);
  await page.goto(`${base}/alumni-portal/admin/users`); await expect(page.locator(`[data-members] tr[data-id="${other.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-remove="${boss.id}"]`)).toBeDisabled();
  await page.locator(`[data-admin-toggle="${other.id}"]`).click(); await expect(page.locator('#members-fb')).toContainText('Made admin');
  await page.locator(`[data-admin-toggle="${other.id}"]`).click(); await expect(page.locator('#members-fb')).toContainText('Admin access removed');
  const spill = await page.evaluate(() => { const box = document.querySelector('.portal-table-wrap').getBoundingClientRect(); return [...document.querySelectorAll('[data-members] .portal-row-actions button')].filter((b) => b.getBoundingClientRect().right > box.right + 1).map((b) => b.textContent); });
  assert.deepEqual(spill, [], 'every row action fits inside the table at 1440');
  await page.locator(`[data-members] tr[data-id="${other.id}"] .portal-name-link`).click(); await expect(page.locator('[data-back]')).toHaveText('← BACK TO MEMBERS');
  await page.locator('[data-back]').click(); await expect(page).toHaveURL(/admin\/users\/?#members$/);
  console.log('PASS: audit — no REMOVE ACCESS on your own row; MAKE / REMOVE ADMIN confirm; actions fit; names open the profile and come back');

  await page.goto(`${base}/alumni-portal/profile`); await expect(page.locator('.portal-profile [data-action="save"]')).toBeEnabled();
  await expect(page.locator('[data-completion-note]')).not.toContainText('eboard');
  await page.locator('#pf-loc').fill(''); await page.locator('[data-action="update"]').click(); await expect(page.locator('#pf-loc').locator('xpath=../following-sibling::p[contains(@class,"portal-feedback")]')).toHaveText(/Type your city first/);
  await page.locator('#pf-loc').fill('Qqzxvwy Nowhere'); await page.locator('[data-action="update"]').click(); await expect(page.locator('#pf-loc').locator('xpath=../following-sibling::p[contains(@class,"portal-feedback")]')).toHaveText(/couldn't find/, { timeout: 15000 });
  console.log('PASS: audit — e-board never counts against completion; an empty or unknown location says what to do, under the box');

  await page.goto(`${base}/alumni-portal/home`); await page.locator('#search-q').fill('Pages Other'); await expect(page).toHaveURL(/q=Pages\+Other/);
  await page.locator('.portal-card', { hasText: 'Pages Other QA' }).click(); await expect(page).toHaveURL(/members\/\?id=/);
  await expect(page.locator('[data-back]')).toHaveAttribute('href', /\/alumni-portal\/home\?q=Pages\+Other/); await page.locator('[data-back]').click();
  await expect(page.locator('#search-q')).toHaveValue('Pages Other'); await expect(page.locator('.portal-card', { hasText: 'Pages Other QA' })).toBeVisible();
  await page.goto(`${base}/alumni-portal/home?sample=1`); await expect(page.locator('.portal-globe-wrap')).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
  await page.locator('#search-q').fill('fintech'); await expect(page.locator('.portal-card').first()).toBeVisible(); assert.equal(await page.locator('a.portal-card').count(), 0, 'sample cards are not links to missing pages');
  console.log('PASS: audit — BACK TO SEARCH returns to the same search and results; sample cards aren’t dead links');

  const { page: pp } = await signInPage(browser, waiting); const flashes = [];
  await pp.addInitScript(() => { new MutationObserver(() => { if (document.body?.innerText.includes('WHO ARE YOU LOOKING FOR')) window.__sawSearch = true; }).observe(document, { childList: true, subtree: true, characterData: true }); });
  await pp.goto(`${base}/alumni-portal/home`); await expect(pp.getByRole('heading', { name: "YOU'RE ON THE LIST" })).toBeVisible();
  assert.equal(await pp.evaluate(() => window.__sawSearch ?? false), false, 'someone waiting never sees the search page, not even for a moment');
  console.log('PASS: audit — no flash of the search page before "you’re on the list"');

  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS: no browser errors');
} finally {
  if (browser) await browser.close();
  for (const u of users.reverse()) await u.cleanup();
  const purged = await admin.rpc('purge_test_backups');
  console.log(`Cleaned up ${users.length} temporary accounts; purged ${purged.data ?? 0} test backup rows.`);
}
