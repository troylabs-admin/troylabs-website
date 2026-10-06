// Temporary QA login only. LinkedIn states are response fixtures: no scraping, messages or real profile edits.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { adminClient, makeUser, signInPage } from './helpers.mjs';
const out = 'test-results/profile-ui'; mkdirSync(out, { recursive: true });
const admin = adminClient(); let user, browser;
try {
  user = await makeUser(admin, 'Profile UI QA');
  browser = await chromium.launch(); const { page } = await signInPage(browser, user);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let pending = false, status = { queued: false, synced_at: null, error: null }, statusFail = false, syncRequests = 0;
  await page.route('**/rest/v1/profiles?*', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(); const data = await response.json();
    const patch = p => p && ({ ...p, approved: !pending, submitted_at: null, linkedin_url: pending ? null : 'https://www.linkedin.com/in/tl-qa-status', personal_email: user.email, phone: '+12135550112' });
    await route.fulfill({ response, json: Array.isArray(data) ? data.map(patch) : patch(data) });
  });
  await page.route('**/rest/v1/rpc/my_linkedin_status', route => route.fulfill({ status: statusFail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(statusFail ? { message: 'Fixture unavailable' } : status) }));
  await page.route('**/functions/v1/linkedin-sync', route => { syncRequests++; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"queued":true}' }); });
  const load = async () => { await page.goto('http://localhost:4321/alumni-portal/profile'); await expect(page.locator('.portal-profile')).not.toHaveAttribute('inert', ''); await expect(page.locator('[data-li-status]')).not.toHaveText('Loading…'); };
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    status = { queued: true, synced_at: null, error: 'Fixture transient failure' }; statusFail = false; await load();
    await expect(page.locator('[data-li-status]')).toContainText('retry automatically');
    await expect(page.locator('[data-li-sync]')).toBeHidden();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no overflow at ${width}`);
    await page.locator('#pf-linkedin').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/retry-${width}.png` });
    statusFail = true; await load(); await expect(page.locator('[data-li-status]')).toContainText('couldn’t check');
    await expect(page.locator('[data-li-sync]')).toHaveText('CHECK AGAIN');
    statusFail = false; status = { queued: false, synced_at: null, error: null };
    await page.locator('[data-li-sync]').click(); await expect(page.locator('[data-li-status]')).toHaveText('Not imported yet.');
    assert.equal(syncRequests, 0, 'checking status does not queue a paid import');
    status = { queued: false, synced_at: new Date().toISOString(), error: 'Fixture failure after a recent sync' }; await load();
    await expect(page.locator('[data-li-sync]')).toBeDisabled(); await expect(page.locator('[data-li-fb]')).toContainText('tomorrow');
    pending = true; await load();
    await expect(page.locator('[data-li-status]')).toContainText('when leadership approves');
    await page.locator('#pf-li').fill('https://www.linkedin.com/company/example');
    await page.locator('[data-action="save"]').click();
    await expect(page.locator('#pf-li')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.portal-save .portal-feedback')).toContainText('your LinkedIn profile link');
    await page.locator('#pf-li').fill('linkedin.com/in/qa');
    await expect(page.locator('#pf-li')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-onboard-missing]')).toContainText('That’s everything.');
    const submitFits = await page.locator('[data-action="save"]').evaluate(button => {
      const range = document.createRange(); range.selectNodeContents(button);
      const text = range.getBoundingClientRect(), pill = button.getBoundingClientRect();
      return text.top >= pill.top && text.bottom <= pill.bottom && text.left >= pill.left && text.right <= pill.right;
    });
    assert.ok(submitFits, `the full submit label stays inside its pill at ${width}px`);
    await page.screenshot({ path: `${out}/onboard-${width}.png`, fullPage: true });
    pending = false;
    console.log(`PASS ${width}: profile no overflow; import retry/status failure/check again/daily limit; onboarding requires personal LinkedIn; accessible validation clears`);
  }
  assert.deepEqual(errors, []); console.log('PASS: no browser errors or external LinkedIn imports');
} finally { await browser?.close(); await user?.cleanup(); }
