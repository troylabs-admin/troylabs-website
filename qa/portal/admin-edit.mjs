// Admins edit other members' profiles (2026-10-06), years are real years, and search shows the directory by default.
// Temporary accounts only (example.com), deleted at the end; never touches real members.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { adminClient, makeUser, signInPage } from './helpers.mjs';

const base = process.env.PORTAL_URL || 'http://localhost:4399';
const out = 'test-results/portal'; mkdirSync(out, { recursive: true });
const admin = adminClient();
const boss = await makeUser(admin, 'Edit Boss QA'); await admin.from('admins').insert({ user_id: boss.id });
const member = await makeUser(admin, 'Edited Member QA'), other = await makeUser(admin, 'Plain Member QA');
await admin.from('profiles').update({ personal_email: `tl-qa-${member.id.slice(0, 8)}@example.com`, phone: '+12135550111', phone_opt_in: false, email_opt_in: true }).eq('id', member.id);
const browser = await chromium.launch(); const errors = [];
let r0; const row = async (id) => (await admin.from('profiles').select('*').eq('id', id).single()).data;
try {
  // ── entry points ────────────────────────────────────────────────────────────────────────────
  let { context, page } = await signInPage(browser, boss); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/alumni-portal/members/?id=${member.id}`);
  await expect(page.locator('[data-m-edit]')).toBeVisible(); assert.equal(await page.locator('[data-m-edit]').getAttribute('href'), `/alumni-portal/profile?id=${member.id}`);
  await page.goto(`${base}/alumni-portal/admin/users#members`);
  await expect(page.locator(`tr[data-id="${member.id}"] a[href="/alumni-portal/profile?id=${member.id}"]`)).toHaveText('EDIT');
  console.log('PASS: admins get EDIT PROFILE on a member page and EDIT on Admin › Members');

  // ── the edit page ───────────────────────────────────────────────────────────────────────────
  await page.goto(`${base}/alumni-portal/profile?id=${member.id}`);
  await expect(page.locator('#pf-admin-edit')).toBeVisible(); await expect(page.locator('#pf-admin-edit [data-edit-name]')).toHaveText('Edited Member QA');
  await expect(page.locator('#pf-heading')).toHaveText('EDIT PROFILE'); await expect(page.locator('#pf-name')).toHaveValue('Edited Member QA');
  for (const sel of ['#pf-usc', '#pf-personal', '#pf-email-opt', '#pf-phone-opt']) await expect(page.locator(sel)).toBeEnabled();
  await expect(page.locator('[data-action="save"]')).toHaveText('SAVE');
  console.log('PASS: the edit page says whose profile it is; every field is editable (admins can change anything)');

  // emails: saved at once by an admin (no confirmation), and they become sign-in addresses
  const newPersonal = `tl-qa-${member.id.slice(0, 8)}-new@example.com`;
  await page.locator('#pf-personal').fill(newPersonal); await page.locator('[data-contact="personal"] .portal-save-row').click();
  await expect(page.locator('[data-contact="personal"] .portal-feedback')).toContainText('Saved');
  assert.equal((await row(member.id)).personal_email, newPersonal);
  const { data: link } = await admin.from('account_emails').select('user_id, kind').eq('email', newPersonal).single(); assert.deepEqual(link, { user_id: member.id, kind: 'personal' });
  const signIn = await (await fetch('https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/account-email', { method: 'POST', headers: { Authorization: `Bearer ${admin.supabaseKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'sign-in', email: newPersonal, dry: true }) })).json();
  assert.ok(signIn.sent && signIn.link, 'the new address signs them in');
  // consent: an admin can turn texts on and announcements off; the record names the admin
  await page.locator('label:has(#pf-email-opt)').click(); await expect(page.locator('#pf-email-opt-fb')).toContainText('They won’t get');
  await page.locator('label:has(#pf-phone-opt)').click(); await page.locator('[data-contact="phone"] .portal-save-row').click(); await expect(page.locator('[data-contact="phone"] .portal-feedback')).toContainText('They’ll get');
  r0 = await row(member.id); assert.deepEqual([r0.email_opt_in, r0.phone_opt_in], [false, true]);
  const { data: on } = await admin.from('profile_events').select('actor, detail').eq('profile_id', member.id).eq('event', 'texts_on').single(); assert.equal(on.actor, boss.id, 'texts_on names the admin who turned it on');
  console.log('PASS: an admin sets a personal email (no confirmation; it signs them in), turns announcements off and texts on; the consent record names the admin');

  // years that don't fit together stop the save (alum, class of next year)
  await page.locator('[data-field="status"] .portal-chip[data-value="alum"]').click(); await page.locator('#pf-classof-year').fill(String(new Date().getFullYear() + 1));
  await page.locator('[data-action="save"]').click(); await expect(page.locator('.portal-save .portal-feedback')).toContainText('hasn’t graduated yet');
  await page.locator('#pf-classof-year').fill('2026');   // joined 2025 below: graduating in 2026 fits
  // a year that isn't one stops the save; a two-digit year is 20xx
  await page.locator('#pf-year').fill('20266'); await page.locator('[data-action="save"]').click();
  await expect(page.locator('.portal-save .portal-feedback')).toContainText('four digits'); await expect(page.locator('#pf-year')).toHaveClass(/portal-needs/);
  assert.equal((await row(member.id)).join_year, 2022, 'nothing saved');
  await page.locator('#pf-name').fill('Edited Member QA Renamed'); await page.locator('#pf-year').fill('25'); await page.locator('#pf-li').fill('linkedin.com/in/tl-qa-edited');
  await page.locator('[data-action="save"]').click(); await expect(page.locator('.portal-save .portal-feedback')).toContainText('Their card in search');
  let r = await row(member.id); assert.deepEqual([r.full_name, r.join_year, r.linkedin_url], ['Edited Member QA Renamed', 2025, 'https://www.linkedin.com/in/tl-qa-edited']);
  assert.equal((await row(boss.id)).full_name, 'Edit Boss QA', "the admin's own profile is untouched");
  console.log('PASS: "20266" refused and outlined; "25" saved as 2025; name and LinkedIn saved to the member, not the admin');

  // phone, city and photo
  await page.locator('#pf-phone').fill('(310) 555-0199'); await page.locator('[data-contact="phone"] .portal-save-row').click();
  await expect(page.locator('[data-contact="phone"] .portal-feedback')).toContainText('Saved');
  await page.locator('#pf-loc').fill('San Francisco, CA'); await page.locator('[data-action="update"]').click(); await expect(page.locator('#pf-loc-note')).toContainText('San Francisco');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAgElEQVR4nNXOQREAIAzAsFI1aEIxshCxB9coyLpnUyZxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEidxEufvwNQDdSIByrksp9EAAAAASUVORK5CYII=', 'base64');   // a real 64×64 PNG
  await page.locator('#pf-photo').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png });
  await expect.poll(async () => (await row(member.id)).avatar_path, { timeout: 15000 }).toBe(`${member.id}/avatar.webp`);
  r = await row(member.id);
  assert.deepEqual([r.phone, r.avatar_source], ['+13105550199', 'upload']);
  console.log('PASS: phone, city pin and photo saved to the member');

  // the record
  const { data: ev } = await admin.from('profile_events').select('actor, detail').eq('profile_id', member.id).eq('event', 'admin_edit');
  const fields = new Set(ev.flatMap((e) => e.detail.fields)); assert.ok(ev.every((e) => e.actor === boss.id), 'every edit names the admin');
  for (const f of ['full_name', 'join_year', 'linkedin_url', 'phone', 'city_id', 'avatar_path', 'personal_email', 'email_opt_in', 'phone_opt_in']) assert.ok(fields.has(f), `${f} recorded`);
  console.log(`PASS: ${ev.length} admin edits in the member's timeline, each with the admin's id and the fields`);

  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/alumni-portal/profile?id=${member.id}`); await expect(page.locator('#pf-admin-edit')).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll at 390');
  await page.screenshot({ path: `${out}/admin-edit-390.png` }); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/alumni-portal/profile?id=${member.id}`); await expect(page.locator('#pf-admin-edit')).toBeVisible(); await page.screenshot({ path: `${out}/admin-edit-1440.png` });
  await context.close();

  // ── a member can't ──────────────────────────────────────────────────────────────────────────
  ({ context, page } = await signInPage(browser, other)); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/alumni-portal/members/?id=${member.id}`); await expect(page.locator('[data-m-name]')).toHaveText('Edited Member QA Renamed'); await expect(page.locator('[data-m-edit]')).toBeHidden();
  await page.goto(`${base}/alumni-portal/profile?id=${member.id}`); await expect(page.locator('#pf-name')).toHaveValue('Plain Member QA');
  await expect(page.locator('#pf-admin-edit')).toBeHidden(); await expect(page.locator('#pf-heading')).toHaveText('YOUR PROFILE');
  const { data: hacked } = await other.sb.from('profiles').update({ full_name: 'hacked' }).eq('id', member.id).select('id'); assert.equal(hacked?.length ?? 0, 0, 'the database refuses it too');
  // their own save, with a two-digit year
  await page.locator('#pf-year').fill('24'); await page.locator('[data-action="save"]').click(); await expect(page.locator('.portal-save .portal-feedback')).toContainText('Your card in search');
  assert.equal((await row(other.id)).join_year, 2024);
  console.log("PASS: a member gets no EDIT, ?id= opens their own profile, the database refuses the write; their own \"24\" saves as 2024");

  // ── search shows the directory until you search ──────────────────────────────────────────────
  await page.goto(`${base}/alumni-portal/home`); await expect(page.locator('.portal-card').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'BROWSE ALL MEMBERS' })).toHaveCount(0); await expect(page.getByRole('button', { name: 'CLEAR ALL' })).toHaveCount(0);
  await page.locator('#search-q').fill('Edited Member QA Renamed'); await expect(page.locator('.portal-card')).toHaveCount(1); await expect(page.getByRole('button', { name: 'CLEAR ALL' })).toBeVisible();
  await page.getByRole('button', { name: 'CLEAR ALL' }).click(); await expect(page.locator('.portal-card').first()).toBeVisible(); assert.ok(await page.locator('.portal-card').count() > 1);
  // SHOW MORE (when there are more than 24) stands clear of the last row of cards
  const gap = await page.evaluate(() => { const b = document.querySelector('.portal-globe-more'); if (!b) return null; return b.getBoundingClientRect().top - Math.max(...[...document.querySelectorAll('.portal-grid > li')].map((c) => c.getBoundingClientRect().bottom)); });
  if (gap !== null) assert.ok(gap >= 12, `SHOW MORE is ${gap}px below the cards`);
  // a member without a current job shows their LinkedIn headline on the card
  await admin.from('profiles').update({ current_title: null, current_company: null, linkedin_headline: 'Headline QA @ Somewhere' }).eq('id', other.id);
  await page.reload(); await page.locator('#search-q').fill('Plain Member QA'); await expect(page.locator('.portal-card', { hasText: 'Plain Member QA' })).toContainText('Headline QA @ Somewhere');
  console.log(`PASS: search shows everyone before you search (no BROWSE button); CLEAR ALL appears with a search and brings everyone back; SHOW MORE ${gap === null ? 'not needed' : `${Math.round(gap)}px below the cards`}; no current job → the LinkedIn headline on the card`);
  await context.close();
  assert.deepEqual(errors, [], 'no browser errors'); console.log('PASS: no browser errors');
} finally { await browser.close(); for (const u of [member, other, boss]) await u.cleanup(); await admin.rpc('purge_test_backups'); }
