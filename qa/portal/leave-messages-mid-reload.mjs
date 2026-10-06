// Admin › Message: leaving while the list reloads after DELETE (slowed to 2 s) must not throw on the next page.
// The bug (2026-10-06, intermittent in system-audit): load() drew into a list that was gone. Fails without the guard.
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';
const admin = adminClient(); const boss = await makeUser(admin, 'Race QA'); await admin.from('admins').insert({ user_id: boss.id });
const browser = await chromium.launch(); const errs = []; const title = `QA DRAFT ${boss.id}`;
try {
  const { page } = await signInPage(browser, boss); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${process.env.PORTAL_URL}/alumni-portal/admin/messages`); await page.locator('[data-aud-grid] button').first().waitFor();
  await page.locator('#mc-title').fill(title); await page.locator('#mc-body').fill('Disposable draft. Never send.');
  await page.locator('[data-aud-grid] .portal-chip[data-group="EVERYONE"][data-who="alumni"]').click(); await page.locator('[data-action="draft"]').click();
  const mine = page.locator('[data-msg-list] li[data-state="draft"]', { hasText: title }); await expect(mine).toHaveCount(1, { timeout: 5000 });
  // the reload after DELETE is slow (2 s); leave by the nav while it's in flight
  await page.route('**/rest/v1/messages?select=*', async (r) => { await new Promise((res) => setTimeout(res, 2000)); await r.continue().catch(() => {}); });
  page.once('dialog', (d) => d.accept()); await mine.locator('[data-del]').click(); await page.waitForTimeout(300);
  await page.locator('a[href="/alumni-portal/admin/analytics"]').first().click(); await page.waitForTimeout(3500);
  if (errs.length) throw new Error('page errors: ' + JSON.stringify(errs));
  console.log('PASS: left Admin › Message mid-reload; no page errors');
} finally { await browser.close(); await admin.from('messages').delete().eq('title', title); await boss.cleanup(); }
