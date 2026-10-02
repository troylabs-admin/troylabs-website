// Phone numbers for texts (2026-10-02): the profile stores E.164 whatever the member types, refuses numbers
// that can't get texts, and the database refuses them too. Temporary accounts only; all removed at the end.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';

const admin = adminClient(), users = []; let browser;
const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321';
const stored = async (u) => (await admin.from('profiles').select('phone, phone_opt_in').eq('id', u.id).single()).data;

try {
  // ── the database: only E.164, and texts need a number ───────────────────────────────────────────
  const m = await makeUser(admin, 'Phone QA'); users.push(m);
  for (const bad of ['310 555 0101', '3105550101', '+0123456789', '+1234567890123456', 'call me']) {
    assert.ok((await m.sb.from('profiles').update({ phone: bad }).eq('id', m.id)).error, `database refuses ${JSON.stringify(bad)}`);
  }
  assert.ok((await m.sb.from('profiles').update({ phone: null, phone_opt_in: true }).eq('id', m.id)).error, 'database refuses texts on without a number');
  assert.equal((await m.sb.from('profiles').update({ phone: '+13105550101', phone_opt_in: true }).eq('id', m.id)).error, null, 'database takes E.164');
  assert.equal((await m.sb.from('profiles').update({ phone: null, phone_opt_in: false }).eq('id', m.id)).error, null, 'removing the number with texts off is fine');
  console.log('PASS: database — E.164 only; texts on needs a number');

  // ── the profile page ────────────────────────────────────────────────────────────────────────────
  browser = await chromium.launch(); const errors = [];
  const { page } = await signInPage(browser, m); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/alumni-portal/profile`);
  await expect(page.locator('.portal-profile [data-action="save"]')).toBeEnabled();
  const row = page.locator('[data-contact="phone"]'), input = page.locator('#pf-phone'), save = row.locator('.portal-save-row');
  const setBox = async (on) => { if ((await page.locator('#pf-phone-opt').isChecked()) !== on) await page.locator('[data-contact="phone"] label.portal-check').click(); await expect(page.locator('#pf-phone-opt')).toBeChecked({ checked: on }); };
  const feedback = async () => (await page.locator('[data-contact="phone"]').innerText());
  await expect(row).toContainText('Reply STOP to any text to stop');

  await input.fill('555-0101'); await save.click();
  await expect.poll(feedback).toContain('Enter a number that can get texts');
  assert.deepEqual(await stored(m), { phone: null, phone_opt_in: false }, 'a short number is not saved');

  await input.fill(''); await setBox(true); await save.click();
  await expect.poll(feedback).toContain('Add your number to get texts');
  assert.deepEqual(await stored(m), { phone: null, phone_opt_in: false }, 'texts on with no number is not saved');

  await input.fill('310.555.0101'); await save.click();
  await expect.poll(async () => (await stored(m)).phone).toBe('+13105550101');
  assert.deepEqual(await stored(m), { phone: '+13105550101', phone_opt_in: true }, 'saved in E.164 with texts on');
  await expect(input).toHaveValue('(310) 555-0101');
  await expect.poll(feedback).toContain('reply STOP to any of them to stop');
  await page.reload(); await expect(page.locator('.portal-profile [data-action="save"]')).toBeEnabled(); await expect(page.locator('#pf-phone')).toHaveValue('(310) 555-0101'); await expect(page.locator('#pf-phone-opt')).toBeChecked();

  await page.locator('#pf-phone').fill('+44 20 7946 0958'); await setBox(false); await page.locator('[data-contact="phone"] .portal-save-row').click();
  await expect.poll(async () => (await stored(m)).phone).toBe('+442079460958');
  assert.equal((await stored(m)).phone_opt_in, false);
  await expect(page.locator('#pf-phone')).toHaveValue('+442079460958');
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS: profile — bad numbers refused with a reason; US and international numbers saved as E.164 and shown readably');
} finally {
  if (browser) await browser.close();
  for (const u of users.reverse()) await u.cleanup();
  console.log(`Cleaned up ${users.length} temporary accounts.`);
}
