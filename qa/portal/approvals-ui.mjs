/** Offline Members regression. Run PORTAL_URL=http://localhost:4399 node qa/portal/approvals-ui.mjs.
 * Every remote request is mocked: no approvals, emails, SMS, accounts, or live writes. */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { createApprovalsFixture } from './approvals-ui-fixture.mjs';
const browser = await chromium.launch(), failures = [], out = 'test-results/approvals-ui';
const check = async (name, fn, options = {}) => {
  const f = await createApprovalsFixture(browser, options);
  try { await f.page.goto(`${f.base}/alumni-portal/admin/users`); await expect(f.page.locator('#requests-n')).toHaveText(String(options.pending ?? 30), { timeout: 15000 }); await expect(f.page.locator('[data-members] tbody tr[data-id]')).toHaveCount(3); await fn(f); assert.deepEqual(f.state.errors, []); console.log(`PASS: ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL: ${name}: ${error.message}`); }
  finally { await f.context.close(); }
};
const pendingIds = state => state.profiles.filter(p => !p.approved).map(p => p.id).sort();
try {
  await check('select all 30 is available without first selecting the shown 25', async ({ page }) => {
    await expect(page.locator('#requests-list [data-q-pick]')).toHaveCount(25);
    await expect(page.locator('[data-q-everyone]')).toBeVisible(); await expect(page.locator('[data-q-everyone]')).toContainText('30');
    await page.locator('[data-q-everyone]').click(); await expect(page.locator('[data-q-selected]')).toContainText('30');
    await page.locator('[data-q-clear]').click(); await expect(page.locator('[data-q-selected]')).toContainText('0'); await expect(page.locator('[data-q-approve]')).toBeDisabled();
    await page.locator('[data-q-more]').click(); await expect(page.locator('#requests-list [data-q-pick]')).toHaveCount(30); await expect(page.locator('[data-q-more]')).toBeHidden();
  });
  await check('admins sort before other members, including filtered results', async ({ page }) => {
    const names = () => page.locator('[data-members] tr[data-id]:visible .portal-name-link').allTextContents();
    assert.deepEqual(await names(), ['Morgan Admin', 'Zoe Admin', 'Aaron Member']);
    await page.locator('#members-q').fill('example.com'); assert.deepEqual(await names(), ['Morgan Admin', 'Zoe Admin', 'Aaron Member']);
    await page.locator('#members-q').fill('Admin'); assert.deepEqual(await names(), ['Morgan Admin', 'Zoe Admin']);
  });
  await check('one bulk approval covers all 30 once with no confirm dialog', async ({ page, state }) => {
    const ids = pendingIds(state); state.rpcDelay = 250;
    await page.locator('[data-q-everyone]').click(); await page.locator('[data-q-approve]').click();
    await page.locator('[data-q-approve]').evaluate(el => el.click());
    await expect(page.locator('#requests-n')).toHaveText('0'); assert.deepEqual(state.approvals.map(call => [...call].sort()), [ids]); assert.equal(state.notifications.length, 1); assert.deepEqual([...state.notifications[0].ids].sort(), ids); assert.deepEqual(state.dialogs, []);
    await expect(page.locator('#q-fb')).toContainText(/approved.*30|30.*approved/i); await expect(page.locator('[data-members] tbody tr[data-id]')).toHaveCount(33);
  });
  await check('search select-all approves only matching 15', async ({ page, state }) => {
    await page.locator('#q-search').fill('Tech Applicant'); await expect(page.locator('#requests-list [data-q-pick]')).toHaveCount(15);
    await page.locator('[data-q-everyone]').click(); await expect(page.locator('[data-q-selected]')).toContainText('15'); await page.locator('[data-q-approve]').click();
    await expect(page.locator('#requests-n')).toHaveText('15'); assert.equal(state.approvals.length, 1); assert.equal(state.approvals[0].length, 15); assert.ok(state.profiles.filter(p => state.approvals[0].includes(p.id)).every(p => p.divisions.includes('TECH'))); assert.deepEqual(state.dialogs, []);
  });
  await check('changing search does not retain hidden recipients', async ({ page }) => {
    await page.locator('[data-q-everyone]').click(); await page.locator('#q-search').fill('Tech Applicant'); await expect(page.locator('[data-q-selected]')).toContainText('0'); await expect(page.locator('[data-q-approve]')).toBeDisabled();
    await page.locator('#q-search').fill('NoSuchApplicant'); await expect(page.locator('#requests-list')).toContainText(/nobody matches/i); await expect(page.locator('[data-q-everyone]')).toBeDisabled();
  });
  await check('single approve is immediate and repeat clicks do not duplicate it', async ({ page, state }) => {
    state.rpcDelay = 250; const button = page.locator('[data-approve]').first(); const id = await button.getAttribute('data-approve');
    await button.evaluate(el => { el.click(); el.click(); }); await expect(page.locator('#requests-n')).toHaveText('29'); assert.deepEqual(state.approvals, [[id]]); assert.equal(state.notifications.length, 1); assert.deepEqual(state.dialogs, []);
  });
  await check('notification error leaves membership approved and detail collapsed', async ({ page, state }) => {
    state.notifyError = 'Fixture notification service is unavailable. '.repeat(25); const id = await page.locator('[data-approve]').first().getAttribute('data-approve'); await page.locator(`[data-approve="${id}"]`).click();
    await expect(page.locator('#requests-n')).toHaveText('29'); assert.equal(state.profiles.find(p => p.id === id).approved, true); await expect(page.locator('#q-fb')).toContainText(/approved/i); await expect(page.locator('#q-fb')).not.toHaveClass(/is-error/);
    await expect(page.locator('#q-fb details')).toHaveCount(1); await expect(page.locator('#q-fb details')).not.toHaveAttribute('open', ''); await expect(page.locator('#q-fb details')).toContainText('Fixture notification');
    await page.locator('#q-fb summary').click(); await expect(page.locator('#q-fb details')).toHaveAttribute('open', '');
  });
  await check('shown checkbox selects only displayed 25 and undo restores approved set', async ({ page, state }) => {
    await page.locator('label:has(#q-all)').click(); await expect(page.locator('[data-q-selected]')).toContainText('25');
    await page.locator('[data-q-approve]').click(); await expect(page.locator('#requests-n')).toHaveText('5'); assert.equal(state.approvals[0].length, 25);
    await page.locator('[data-q-undo]').click(); await expect(page.locator('#requests-n')).toHaveText('30'); await expect(page.locator('#q-fb')).toContainText('Undone'); assert.equal(state.notifications.length, 1);
  });
  await check('decline uses inline cancel and confirm, never browser dialog', async ({ page, state }) => {
    const id = await page.locator('[data-decline]').first().getAttribute('data-decline'); await page.locator(`[data-decline="${id}"]`).click();
    await expect(page.locator('[data-q-confirm-decline]')).toBeVisible(); assert.equal(state.declines.length, 0); await page.locator('[data-q-dismiss]').click(); await expect(page.locator('[data-q-confirm-decline]')).toHaveCount(0);
    await page.locator(`[data-decline="${id}"]`).click(); await page.locator('[data-q-confirm-decline]').click(); await expect(page.locator('#requests-n')).toHaveText('29'); assert.deepEqual(state.declines, [[id]]); assert.deepEqual(state.dialogs, []); assert.equal(state.notifications.length, 0);
  });
  await check('selection change dismisses stale decline confirmation', async ({ page }) => {
    await page.locator('[data-q-everyone]').click(); await page.locator('[data-q-decline]').click(); await expect(page.locator('[data-q-confirm-decline]')).toBeVisible(); await page.locator('[data-q-clear]').click(); await expect(page.locator('[data-q-confirm-decline]')).toHaveCount(0); await expect(page.locator('[data-q-selected]')).toContainText('0');
  });
  await check('failed approval does not notify or remove applicant', async ({ page, state }) => {
    state.rpcError = 'Fixture approval unavailable'; await page.locator('[data-approve]').first().click(); await expect(page.locator('#q-fb')).toContainText('Fixture approval unavailable'); await expect(page.locator('#requests-n')).toHaveText('30'); assert.equal(state.notifications.length, 0);
  });
  await check('leaving via Search during approval still notifies exactly once', async ({ page, state }) => {
    state.rpcDelay = 1200;
    const id = await page.locator('[data-approve]').first().getAttribute('data-approve');
    await page.locator('[data-approve]').first().click(); await expect.poll(() => state.approvals.length).toBe(1);
    await page.getByRole('link', { name: 'SEARCH', exact: true }).click();
    await expect(page).toHaveURL(/\/alumni-portal\/home\/?$/); await expect(page.locator('#approvals')).toHaveCount(0);
    await expect.poll(() => state.notifications.length).toBe(1);
    assert.deepEqual(state.approvals, [[id]]); assert.deepEqual(state.notifications[0].ids, [id]); assert.equal(state.profiles.find(p => p.id === id).approved, true);
  });
  await check('partial approval refreshes count without offering unsafe Undo', async ({ page, state }) => {
    state.rpcCount = 12;
    await page.locator('[data-q-everyone]').click(); await page.locator('[data-q-approve]').click();
    await expect(page.locator('#requests-n')).toHaveText('18'); await expect(page.locator('#q-fb')).toContainText('Approved 12 people.');
    await expect(page.locator('#q-fb')).toContainText('Some applications had already changed.'); await expect(page.locator('[data-q-undo]')).toHaveCount(0);
    assert.equal(state.approvals.length, 1); assert.equal(state.notifications.length, 1); assert.equal(state.notifications[0].ids.length, 30);
  });
  await check('Undo stays disabled while approval notification is sending', async ({ page, state }) => {
    state.notifyDelay = 1000; await page.locator('[data-approve]').first().click();
    await expect(page.locator('#q-fb')).toContainText('Sending notification…'); await expect(page.locator('[data-q-undo]')).toBeDisabled();
    await page.locator('[data-q-undo]').evaluate(el => el.click()); assert.equal(state.writes.filter(write => write.body.approved === false).length, 0);
    await expect(page.locator('[data-q-undo]')).toBeEnabled(); await expect(page.locator('#q-fb')).not.toContainText('Sending notification…'); assert.equal(state.notifications.length, 1);
  });
  await check('empty queue has no available bulk approval', async ({ page }) => { await expect(page.locator('#requests-list')).toContainText(/nobody waiting/i); await expect(page.locator('[data-q-bar]')).toBeHidden(); }, { pending: 0 });
  await check('one applicant can be selected and approved without dialog', async ({ page, state }) => {
    await page.locator('[data-q-everyone]').click(); await page.locator('[data-q-approve]').click(); await expect(page.locator('#requests-n')).toHaveText('0'); assert.equal(state.approvals[0].length, 1); assert.deepEqual(state.dialogs, []);
  }, { pending: 1 });
  for (const width of [320, 390, 768, 1440]) await check(`responsive approval and member UI ${width}px`, async ({ page, state }) => {
    await expect(page.locator('[data-members] thead')).not.toContainText('PROFILE'); await expect(page.locator('[data-members]')).not.toContainText(/\d+%/);
    await page.locator('[data-q-everyone]').click(); await page.locator('[data-q-details]').first().click();
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.portal-col *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.right > innerWidth + 1 || r.left < -1); }).map(el => ({ class: el.className, text: el.textContent.slice(0, 60) })));
    assert.deepEqual(overflow, []); mkdirSync(out, { recursive: true }); await page.screenshot({ path: `${out}/members-${width}.png`, fullPage: true }); await page.locator('[data-members]').screenshot({ path: `${out}/member-cards-${width}.png` });
    await page.locator('#approvals').evaluate(el => el.scrollIntoView({ block: 'start' })); await page.screenshot({ path: `${out}/queue-${width}.png` });
    state.notifyError = 'Fixture provider message: notification could not be delivered. '.repeat(15); await page.locator('[data-approve]').first().click(); await expect(page.locator('#q-fb')).toContainText(/approved/i); await page.locator('#q-fb').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/notification-${width}.png` });
  }, { viewport: { width, height: 1000 } });
} finally { await browser.close(); }
assert.deepEqual(failures, [], 'Approval UI regression failures');
console.log('PASS: all requests mocked; no live approvals, notifications, accounts, or database writes.');
