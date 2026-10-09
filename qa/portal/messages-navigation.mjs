// Local Astro navigation with delayed mocked writes/providers. No live messages or database writes.
// PORTAL_URL=http://localhost:4321 node qa/portal/messages-navigation.mjs
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { createMessagesFixture } from './messages-ui-fixture.mjs';

const browser = await chromium.launch();
const fixtures = [];
async function open() {
  const f = await createMessagesFixture(browser); fixtures.push(f);
  await f.page.goto(`${f.base}/alumni-portal/admin/messages`);
  await expect(f.page.locator('[data-template="0"]')).toBeVisible();
  return f;
}
async function returnToMessages(page) {
  await page.locator('.portal-adminbar a[href="/alumni-portal/admin/handoff"]').click();
  await expect(page).toHaveURL(/handoff/);
  await page.locator('.portal-adminbar a[href="/alumni-portal/admin/messages"]').click();
  await expect(page.locator('[data-template="0"]')).toBeVisible();
}
try {
  const saved = await open(), p = saved.page;
  saved.state.writeDelay = 6000;
  await p.locator('#mc-body').fill('Old save, mocked only');
  await p.locator('[data-action="draft"]').click();
  await returnToMessages(p);
  await p.locator('#mc-body').fill('Keep this unsaved text after navigation');
  await expect.poll(() => saved.state.writes.length, { timeout: 10000 }).toBe(1);
  await p.waitForTimeout(200);
  await expect(p.locator('#mc-body')).toHaveValue('Keep this unsaved text after navigation');
  assert.deepEqual(saved.state.errors, []);
  await saved.context.close();
  console.log('PASS: delayed save never clears a newly opened composer');

  for (const action of ['send', 'test-send']) {
    const f = await open(), page = f.page;
    f.state.functionDelay = 6000;
    await page.locator('#mc-body').fill('Old provider operation, mocked only');
    await page.locator('[data-group="TECH"][data-who="alumni"]').click();
    const response = page.waitForResponse(r => r.url().includes('/functions/v1/send-message') && r.request().postDataJSON()?.mode === (action === 'send' ? 'send' : 'test'));
    await page.locator(`[data-action="${action}"]`).click();
    await expect.poll(() => f.state.calls.some(c => c.mode === (action === 'send' ? 'send' : 'test'))).toBe(true);
    await returnToMessages(page);
    await page.locator('[data-edit="900001"]').click();
    await page.locator('#mc-body').fill('Revision of the existing saved draft');
    await response; await page.waitForTimeout(200);
    await expect(page.locator('#msg-fb')).toContainText('Editing');
    await page.locator('[data-action="draft"]').click();
    await expect(page.locator('#mc-body')).toHaveValue('');
    assert.equal(f.state.writes.at(-1).method, 'PATCH', 'stale provider response must not turn edit into new insert');
    assert.equal(f.state.writes.at(-1).id, 900001);
    assert.deepEqual(f.state.errors, []);
    await f.context.close();
    console.log(`PASS: delayed ${action} result preserves fresh feedback and editing identity`);
  }

  const scheduled = await open(), q = scheduled.page;
  await q.locator('#mc-body').fill('Offline scheduling regression');
  await q.locator('[data-group="TECH"][data-who="alumni"]').click();
  await q.locator('[data-when] [data-value="later"]').click();
  await q.locator('#mc-when').fill('2030-10-08T10:00');
  await q.locator('#mc-repeat').selectOption('daily');
  await q.locator('#mc-repeat-end').selectOption('count');
  await q.locator('#mc-repeat-count').fill('3');
  await q.locator('[data-action="send"]').click();
  await expect(q.locator('#mc-body')).toHaveValue('');
  await q.waitForTimeout(1800); // old completion timer incorrectly restored SCHEDULE after clearing the composer
  await expect(q.locator('[data-send-btn]')).toHaveText('SEND NOW');
  await expect(q.locator('[data-when] [data-value="now"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(q.locator('#mc-repeat')).toHaveValue('once');
  assert.equal(scheduled.state.writes.at(-1).body.recurrence.frequency, 'daily');
  assert.deepEqual(scheduled.state.writes.at(-1).body.recurrence.end, {type:'count',count:3});
  await expect(q.locator('[data-scheduled-list]')).toContainText('Offline scheduling regression');
  await expect(q.locator('[data-msg-list]')).not.toContainText('Offline scheduling regression');
  assert.deepEqual(scheduled.state.errors, []);
  console.log('PASS: cleared schedule label still matches SEND NOW after completion timers');
} finally {
  for (const f of fixtures) await f.context.close();
  await browser.close();
}
