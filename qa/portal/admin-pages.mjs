// The admin pages rebuilt on 2026-10-02, button by button (clean-up 2026-10-05: no text alarms, the attention box hides
// when there's nothing to do, numbers line up and carry thousands separators, the DECLINED fold): Overview (needs-your-attention, numbers, copy the sign-up
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
  const declined = await makeUser(admin, 'Pages Declined QA', false); users.push(declined); await admin.from('profiles').update({ submitted_at: new Date().toISOString(), declined_at: new Date().toISOString() }).eq('id', declined.id);
  browser = await chromium.launch(); const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(({ key, session }) => { if (!sessionStorage.getItem('tl-qa-seeded')) { localStorage.setItem(key, JSON.stringify(session)); sessionStorage.setItem('tl-qa-seeded', '1'); } }, { key: 'sb-ackmhqxyxnceoarbhcrp-auth-token', session: boss.session });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message} ${(e.stack ?? '').split('\n')[1]?.trim() ?? ''}`)); page.on('dialog', (d) => d.accept());

  // ── Overview ───────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${base}/alumni-portal/admin`);
  const att = page.locator('[data-attention]'), attBox = page.locator('.portal-attention');
  await expect(att).toContainText(/waiting for approval/); await expect(att.getByRole('link', { name: 'REVIEW →' })).toHaveAttribute('href', '/alumni-portal/admin/users#approvals');
  await expect(att).not.toContainText('Email isn’t connected'); await expect(att).not.toContainText('test mode');   // email is live since 2026-10-05
  await expect(att).not.toContainText(/Twilio|Texts?\b/i);   // texting is deferred (Bryan, 2026-10-05): never an alarm here
  await expect(page.locator('[data-stat="members"]')).toHaveText(/^\d[\d,]*$/); await expect(page.locator('[data-stat="site:$pageview"]')).toHaveText(/^\d{1,3}(,\d{3})*$/, { timeout: 15000 });   // 1,248 like the lists, never 1248
  assert.ok(await num(page.locator('[data-stat="site:$pageview"]')) > 0, 'website visits come from PostHog');
  await expect(page.locator('[data-upcoming]')).toContainText(/Nothing scheduled|·/); await expect(page.locator('[data-recent]')).not.toContainText('—');
  // layout the audit flagged: every tile's number on one line across the row; the link beside its sentence with a gap, on one line
  const layout = async () => page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const tops = [...document.querySelectorAll('.portal-tiles .t-stat')].map((n) => Math.round(r(n).top));
    const links = [...document.querySelectorAll('.portal-attention-go')].map((a) => { const t = r(a.previousElementSibling), l = r(a); return { lines: Math.round(l.height / parseFloat(getComputedStyle(a).lineHeight)), gapX: Math.round(l.left - t.right), gapY: Math.round(l.top - t.bottom) }; });
    return { tops, links };
  });
  let lay = await layout();
  assert.equal(new Set(lay.tops).size, 1, `the four tile numbers line up at 1440: ${lay.tops}`);
  assert.ok(lay.links.length && lay.links.every((l) => l.lines === 1 && l.gapX >= 12), `attention links sit on one line, clear of their sentence at 1440: ${JSON.stringify(lay.links)}`);
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300); lay = await layout();
  assert.deepEqual([lay.tops[0] === lay.tops[1], lay.tops[2] === lay.tops[3]], [true, true], `tile numbers line up per row at 390: ${lay.tops}`);
  assert.ok(lay.links.every((l) => l.lines === 1 && l.gapY >= 4), `on a phone the link sits under its sentence: ${JSON.stringify(lay.links)}`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  // the delivery check can say anything about texts (trial, no keys, an error): the box never mentions them
  const fakeStatus = (text) => async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    if (route.request().postDataJSON()?.mode !== 'status') return route.continue();
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { email: { configured: true, testMode: false, testTo: null, from: 'TroyLabs <hello@usctroylabs.com>' }, text } });
  };
  const trial = { configured: true, from: '+18005550100', trial: true, error: null, testTo: null };
  for (const text of [trial, { configured: false, from: null, trial: false, error: null, testTo: null }, { configured: true, from: '+18005550100', trial: false, error: 'Twilio said no', testTo: null }]) {
    await page.route('**/functions/v1/send-message', fakeStatus(text)); await page.goto(`${base}/alumni-portal/admin`);
    await expect(att).toContainText(/waiting for approval/); await page.waitForTimeout(1500);
    await expect(att).not.toContainText(/Twilio|Texts?\b/i); await expect(att.locator('li')).toHaveCount(1);
    await page.unroute('**/functions/v1/send-message');
  }
  // nothing to review (nobody waiting, email live, texts on a trial): no box at all, no filler
  await page.route('**/functions/v1/send-message', fakeStatus(trial));
  await page.route('**/rest/v1/profiles?*', async (route) => { const res = await route.fetch(); const rows = await res.json().catch(() => null); return Array.isArray(rows) ? route.fulfill({ response: res, json: rows.filter((p) => p.approved) }) : route.fulfill({ response: res }); });
  await page.goto(`${base}/alumni-portal/admin`); await expect(page.locator('[data-stat="members"]')).toHaveText(/^\d[\d,]*$/); await page.waitForTimeout(2500);
  await expect(attBox).toBeHidden(); await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeHidden(); await expect(page.getByText(/All caught up|Checking…/)).toHaveCount(0);
  await page.unroute('**/rest/v1/profiles?*'); await page.unroute('**/functions/v1/send-message');
  await page.goto(`${base}/alumni-portal/admin`); await expect(attBox).toBeVisible(); await expect(att).toContainText(/waiting for approval/);   // and it comes back when someone is waiting
  await page.locator('[data-copy-link]').click(); await expect(page.locator('[data-copy-link]')).toHaveText('COPIED');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'https://usctroylabs.com/alumni-portal', 'COPY puts the sign-up link on the clipboard');
  for (const [name, url] of [['WRITE A MESSAGE', /admin\/messages/], ['REVIEW SIGN-UPS', /admin\/users\/?#approvals/], ['FIND OR EXPORT MEMBERS', /admin\/users\/?#members/], ['SEE ANALYTICS', /admin\/analytics/]]) {
    await page.goto(`${base}/alumni-portal/admin`); await page.getByRole('link', { name, exact: true }).click(); await expect(page).toHaveURL(url);
  }
  await page.goto(`${base}/alumni-portal/admin`); await expect(page.locator('[data-stat="members"]')).toHaveText(/^\d[\d,]*$/);
  await page.locator('main, body').first().screenshot({ path: `${out}/overview-1440.png`, fullPage: true });
  console.log('PASS: Overview — attention (waiting → REVIEW; never a Twilio/text warning, whatever the text status; hidden when nothing needs review), numbers with thousands separators and lined up at 1440 and 390, COPY, every common job lands on the right page');

  // ── Message: the delivery line mentions texts only when TEXT or BOTH is picked ──────────────────
  await page.route('**/functions/v1/send-message', fakeStatus(trial));
  await page.goto(`${base}/alumni-portal/admin/messages`); const line = page.locator('#msg-delivery');
  await expect(line).toContainText('Email is connected'); await expect(line).not.toContainText(/Twilio|Texts?\b/i); await expect(line).not.toHaveClass(/is-warn/);
  await page.locator('[data-single]:not([data-when]) .portal-chip[data-value="text"]').click(); await expect(line).toContainText('Texts aren’t switched on yet'); await expect(line).toHaveClass(/is-warn/); await expect(line).not.toContainText('Twilio');
  await page.locator('[data-single]:not([data-when]) .portal-chip[data-value="both"]').click(); await expect(line).toContainText('Texts aren’t switched on yet');
  await page.locator('[data-single]:not([data-when]) .portal-chip[data-value="email"]').click(); await expect(line).not.toContainText(/Texts?\b/i); await expect(line).not.toHaveClass(/is-warn/);
  await page.unroute('**/functions/v1/send-message');
  console.log('PASS: Message — no text alarm while EMAIL is picked; TEXT or BOTH says plainly that texts can’t go out yet (no Twilio jargon)');

  // ── Members: the DECLINED fold ───────────────────────────────────────────────────────────────
  await page.goto(`${base}/alumni-portal/admin/users`); await expect(page.locator('#declined-fold')).toBeVisible();
  for (const [w, h] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h }); await page.locator('#declined-fold').evaluate((d) => { d.open = true; });
    await expect(page.locator(`#declined-list li[data-id="${declined.id}"]`)).toBeVisible();
    const m = await page.evaluate((id) => { const r = (el) => el.getBoundingClientRect(); const n = document.querySelector('#declined-n'), label = n.closest('summary'); const back = document.querySelector(`[data-restore="${id}"]`);
      return { countFromLabel: Math.round(r(n).left - r(label).left), labelWidth: Math.round(r(label).width), backLines: Math.round(r(back).height / parseFloat(getComputedStyle(back).lineHeight)), spill: r(back).right > r(back.closest('li')).right + 1 }; }, declined.id);
    assert.ok(m.countFromLabel < 160 && m.countFromLabel < m.labelWidth / 2, `the declined count sits beside its label at ${w}: ${JSON.stringify(m)}`);
    assert.deepEqual([m.backLines, m.spill], [1, false], `BACK TO WAITING LIST stays on one line inside its row at ${w}: ${JSON.stringify(m)}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS: Members — the DECLINED count sits by its label; BACK TO WAITING LIST on one line, at 1440 and 390');

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
  const { page: wp } = await signInPage(browser, waiting); wp.on('pageerror', (e) => errors.push(`${new URL(wp.url()).pathname}: ${e.message} ${(e.stack ?? '').split('\n')[1]?.trim() ?? ''}`));
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
  await pp.goto(`${base}/alumni-portal/home`); await expect(pp.getByRole('heading', { name: 'WAITING FOR APPROVAL' })).toBeVisible();
  assert.equal(await pp.evaluate(() => window.__sawSearch ?? false), false, 'someone waiting never sees the search page, not even for a moment');
  console.log('PASS: audit — no flash of the search page before "waiting for approval"');

  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS: no browser errors');
} finally {
  if (browser) await browser.close();
  for (const u of users.reverse()) await u.cleanup();
  const purged = await admin.rpc('purge_test_backups');
  console.log(`Cleaned up ${users.length} temporary accounts; purged ${purged.data ?? 0} test backup rows.`);
}
