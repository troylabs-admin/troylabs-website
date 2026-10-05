// Leaving a portal page before it has loaded (2026-10-05): the site navigates in-page, so a page's script keeps
// running after you click away, and twice it wrote into elements that were already gone (member page, Admin ›
// Members). Every portal page is opened with the database slowed down, left right away through the nav, and must
// not throw. Temporary admin account only; removed.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';

const admin = adminClient(); const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321'; let browser, u;
const PAGES = ['/alumni-portal/home', '/alumni-portal/profile', '/alumni-portal/members/?id=SELF', '/alumni-portal/admin', '/alumni-portal/admin/users', '/alumni-portal/admin/message', '/alumni-portal/admin/analytics', '/alumni-portal/admin/handoff'];
try {
  u = await makeUser(admin, 'Leave Admin QA'); await admin.from('admins').insert({ user_id: u.id });
  browser = await chromium.launch(); const errors = [];
  for (const path of PAGES) {
    const { context, page } = await signInPage(browser, u);
    page.on('pageerror', (e) => errors.push(`${path}: ${e.message} ${(e.stack ?? '').split('\n')[1]?.trim() ?? ''}`));
    await page.goto(`${base}/alumni-portal/handoff-warmup`.replace('handoff-warmup', 'admin/handoff')); await page.waitForLoadState('networkidle');   // signed in, scripts loaded
    await context.route(/supabase\.co\/(rest|functions)\//, async (r) => { await new Promise((ok) => setTimeout(ok, 2500)); await r.continue().catch(() => {}); });
    await page.evaluate((to) => { const a = document.createElement('a'); a.href = to; document.body.append(a); a.click(); }, path.replace('SELF', u.id));
    await page.waitForURL((x) => `${x.pathname}${x.search}`.startsWith(path.replace('SELF', u.id).split('?')[0]));
    await page.waitForTimeout(300);
    await page.evaluate(() => { const a = document.createElement('a'); a.href = '/alumni-portal/admin/handoff'; document.body.append(a); a.click(); });   // leave before anything has loaded
    await page.waitForTimeout(6000);
    await context.close();
  }
  assert.deepEqual(errors, [], 'no page throws when left while loading');
  console.log(`PASS: ${PAGES.length} portal pages left mid-load; nothing throws`);
} finally { await browser?.close(); await u?.cleanup(); }
