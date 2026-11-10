// Dropped out (Charlotte and Bryan, 2026-11-09), start to finish against the local stack (TL_SUPABASE=local, the site
// built with PUBLIC_SUPABASE_URL/KEY pointing at it, served on PORTAL_URL). Throwaway tl-qa accounts only, all deleted.
//   1. sign-up: pick DROPPED OUT → LAST SEMESTER AT USC appears (and the other year boxes hide); "still needed" names it;
//      a semester that hasn't started and one before joining TroyLabs are refused; Fall 2024 submits as
//      status alum + dropped_out + FA 2024
//   2. Admin › waiting list shows DROPPED OUT and "Last at USC Fall 2024"
//   3. Network: the card's tag and line; STATUS filter option A (ALUM = graduates only, DROPPED OUT = dropouts only, both
//      = both); the header counts them separately
//   4. their member page: tag and "Last at USC Fall 2024", never "Class of"
//   5. Admin › Members: the same filter on the server; CSV has dropped_out
//   6. editing: the form reloads with DROPPED OUT and the semester; switching to ALUM or CURRENT STUDENT clears dropped_out
// node qa/portal/dropped-out.mjs
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { adminClient, local, makeUser, url as projectUrl } from './helpers.mjs';
assert.ok(local, 'run with TL_SUPABASE=local');
const portal = process.env.PORTAL_URL || 'http://localhost:4321';
const out = 'test-results/dropped-out'; mkdirSync(out, { recursive: true });
const admin = adminClient(); const made = []; let browser;
const step = (s) => console.log(`PASS: ${s}`);
const row = async (id) => (await admin.from('profiles').select('status, dropped_out, grad_term, grad_year, submitted_at').eq('id', id).single()).data;
const contact = { phone: '+12135550142', personal_email: null, linkedin_url: 'https://www.linkedin.com/in/tl-qa-dropout', join_term: 'FA', join_year: 2022, divisions: ['TECH'], city_id: 1 };
try {
  const dropout = await makeUser(admin, 'Dana Dropout QA', false); made.push(dropout);
  const grad = await makeUser(admin, 'Gale Graduate QA', true); made.push(grad);
  const boss = await makeUser(admin, 'Ada Admin QA', true); made.push(boss);
  await admin.from('admins').insert({ user_id: boss.id });
  await admin.from('profiles').update({ ...contact, personal_email: dropout.email, grad_year: null, status: 'alum' }).eq('id', dropout.id);
  await admin.from('profiles').update({ status: 'alum', dropped_out: false, grad_year: 2024 }).eq('id', grad.id);

  browser = await chromium.launch();
  const key = `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token`;
  const as = async (user) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
    await context.addInitScript(({ key, session }) => { if (!sessionStorage.getItem('tl-qa-seeded')) { localStorage.setItem(key, JSON.stringify(session)); sessionStorage.setItem('tl-qa-seeded', '1'); } }, { key, session: user.session });
    const page = await context.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message)); return { page, errors };
  };

  // ── 1. sign-up ───────────────────────────────────────────────────────────────────────────────────────────────────
  const { page, errors } = await as(dropout);
  const loaded = async () => { await page.goto(`${portal}/alumni-portal/profile?welcome=1`); await expect(page.locator('.portal-profile')).not.toHaveAttribute('inert', ''); };
  await loaded();
  const chip = (v) => page.locator(`[data-field="status"] .portal-chip[data-value="${v}"]`);
  await expect(chip('dropped_out')).toHaveText('DROPPED OUT');
  await chip('dropped_out').click();
  await expect(page.locator('#pf-left')).toBeVisible(); await expect(page.locator('#pf-grad')).toBeHidden(); await expect(page.locator('#pf-classof')).toBeHidden();
  await expect(page.locator('#pf-left label')).toContainText('LAST SEMESTER AT USC');
  await page.locator('#pf-left-year').fill(''); await page.locator('#pf-name').press('End');   // nudge the live "still needed" list
  await expect(page.locator('[data-onboard-missing]')).toContainText('your last semester at USC');
  await expect(page.locator('[data-onboard-missing]')).not.toContainText('graduation year');
  step('sign-up — DROPPED OUT shows LAST SEMESTER AT USC (other year boxes hidden); "still needed" asks for the last semester');
  for (const c of ['alum', 'student', 'dropped_out']) {   // the boxes follow the chip both ways
    await chip(c).click();
    await expect(page.locator('#pf-classof')).toBeVisible({ visible: c === 'alum' }); await expect(page.locator('#pf-grad')).toBeVisible({ visible: c === 'student' }); await expect(page.locator('#pf-left')).toBeVisible({ visible: c === 'dropped_out' });
  }
  step('the year box follows the chip: ALUM → CLASS OF, CURRENT STUDENT → EXPECTED GRADUATION, DROPPED OUT → LAST SEMESTER');
  const save = page.locator('[data-action="save"]'), said = page.locator('.portal-save .portal-feedback');
  const next = new Date().getFullYear() + 1;
  await page.locator('#pf-left-term').selectOption('Spring'); await page.locator('#pf-left-year').fill(String(next)); await save.click();
  await expect(said).toContainText(`Spring ${next} hasn’t started yet. Check your last semester at USC.`);
  await page.locator('#pf-left-year').fill('2022'); await save.click();   // joined Fall 2022
  await expect(said).toContainText('Your last semester at USC (Spring 2022) is before you joined TroyLabs (Fall 2022).');
  assert.equal((await row(dropout.id)).submitted_at, null, 'nothing was sent while the dates were wrong');
  step('a semester that hasn\'t started, and one before joining TroyLabs, are refused with a plain reason; nothing is sent');
  await page.locator('#pf-left-term').selectOption('Fall'); await page.locator('#pf-left-year').fill('2024'); await save.click();
  await expect.poll(async () => (await row(dropout.id)).submitted_at, { timeout: 15000 }).not.toBeNull();
  const saved = await row(dropout.id);
  assert.deepEqual([saved.status, saved.dropped_out, saved.grad_term, saved.grad_year], ['alum', true, 'FA', 2024]);
  step('Fall 2024 submits: stored as status alum + dropped_out + FA 2024 (an alum who left early)');
  await page.screenshot({ path: `${out}/1-signup.png`, fullPage: false });

  // ── 2. the waiting list ──────────────────────────────────────────────────────────────────────────────────────────
  const A = await as(boss);
  await A.page.goto(`${portal}/alumni-portal/admin/users#approvals`);
  const waiting = A.page.locator(`.portal-q-row[data-id="${dropout.id}"]`);
  await expect(waiting.locator('.portal-tag')).toHaveText('DROPPED OUT');
  await expect(waiting).toContainText('Last at USC Fall 2024'); await expect(waiting).not.toContainText('Class of');
  step('Admin › waiting list — DROPPED OUT and "Last at USC Fall 2024"');
  await admin.from('profiles').update({ approved: true }).eq('id', dropout.id);   // approved in the database: the page's APPROVE also texts

  // ── 3. the Network page ──────────────────────────────────────────────────────────────────────────────────────────
  const M = await as(grad);
  await M.page.goto(`${portal}/alumni-portal/home`);
  const statusChip = (v) => M.page.locator(`[data-filter="status"] .portal-chip[data-value="${v}"]`);
  await expect(statusChip('DROPPED OUT')).toBeVisible();
  await expect(M.page.locator('.portal-explore-stats')).toContainText('DROPPED OUT');
  const stats = await M.page.locator('.portal-explore-stats').innerText();
  const n = (label) => Number(stats.match(new RegExp(`([\\d,]+) ${label}`))?.[1].replace(/,/g, ''));
  assert.equal(n('PEOPLE'), n('STUDENTS?') + n('ALUM(?:NI)?') + n('DROPPED OUT'), `the three counts add up to everyone: ${stats}`);
  const card = (who) => M.page.locator('.portal-card', { hasText: who });
  await statusChip('DROPPED OUT').click();
  await expect(card('Dana Dropout QA')).toBeVisible(); await expect(card('Gale Graduate QA')).toHaveCount(0);
  await expect(card('Dana Dropout QA').locator('.portal-role')).toHaveText('DROPPED OUT');
  await expect(card('Dana Dropout QA')).toContainText('Last at USC Fall 2024'); await expect(card('Dana Dropout QA')).not.toContainText('Class of');
  await M.page.screenshot({ path: `${out}/3-network-dropped-out.png` });
  await statusChip('DROPPED OUT').click(); await statusChip('ALUM').click();
  await expect(card('Gale Graduate QA')).toBeVisible(); await expect(card('Dana Dropout QA')).toHaveCount(0);
  await expect(card('Gale Graduate QA')).toContainText('Class of 2024');
  await statusChip('DROPPED OUT').click();
  await expect(card('Gale Graduate QA')).toBeVisible(); await expect(card('Dana Dropout QA')).toBeVisible();
  step('Network — the card reads DROPPED OUT · Last at USC Fall 2024; ALUM = graduates only, DROPPED OUT = dropouts only, both = both; counts add up');

  // ── 4. their member page ─────────────────────────────────────────────────────────────────────────────────────────
  await M.page.goto(`${portal}/alumni-portal/members/?id=${dropout.id}`);
  await expect(M.page.locator('[data-m-status]')).toHaveText('DROPPED OUT');
  await expect(M.page.locator('[data-m-meta]')).toContainText('Joined TroyLabs in Fall 2022 · Last at USC Fall 2024');
  await expect(M.page.locator('[data-m-meta]')).not.toContainText('Class of');
  await M.page.screenshot({ path: `${out}/4-member-page.png` });
  await M.page.goto(`${portal}/alumni-portal/members/?id=${grad.id}`);
  await expect(M.page.locator('[data-m-status]')).toHaveText('ALUM'); await expect(M.page.locator('[data-m-meta]')).toContainText('Class of 2024');
  step('member page — DROPPED OUT, "Joined TroyLabs in Fall 2022 · Last at USC Fall 2024"; a graduate\'s page unchanged');

  // ── 5. Admin › Members ───────────────────────────────────────────────────────────────────────────────────────────
  await A.page.goto(`${portal}/alumni-portal/admin/users#members`);
  const fchip = (v) => A.page.locator(`[data-filter="status"] .portal-chip[data-value="${v}"]`);
  const tr = (id) => A.page.locator(`[data-members] tbody tr[data-id="${id}"]`);
  await A.page.locator('.member-filter-fold summary').click();   // the filters live in a fold, closed by default
  await fchip('DROPPED OUT').click();
  await expect(tr(dropout.id)).toBeVisible(); await expect(tr(grad.id)).toHaveCount(0);
  await expect(tr(dropout.id).locator('.portal-tag')).toHaveText('DROPPED OUT');
  await fchip('DROPPED OUT').click(); await fchip('ALUM').click();
  await expect(tr(grad.id)).toBeVisible(); await expect(tr(dropout.id)).toHaveCount(0);
  await fchip('ALUM').click(); await fchip('DROPPED OUT').click();
  await expect(tr(dropout.id)).toBeVisible();
  const [download] = await Promise.all([A.page.waitForEvent('download'), A.page.locator('[data-action="export"]').click()]);
  const csv = readFileSync(await download.path(), 'utf8').split('\n');
  const head = csv[0].split(',').map((h) => h.replace(/"/g, '')); const line = csv.find((l) => l.includes('Dana Dropout QA'));
  assert.ok(line, 'the dropout is in the export'); assert.equal(head[2], 'dropped_out');
  assert.equal(line.split('","')[2], 'true', 'their dropped_out column says true');
  assert.ok(!csv.some((l) => l.includes('Gale Graduate QA')), 'the export follows the DROPPED OUT filter');
  step('Admin › Members — the server filter keeps ALUM and DROPPED OUT apart; the tag; CSV has dropped_out = true');

  // ── 6. editing later ────────────────────────────────────────────────────────────────────────────────────────────
  await loaded();
  await expect(chip('dropped_out')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pf-left')).toBeVisible(); await expect(page.locator('#pf-left-term')).toHaveValue('Fall'); await expect(page.locator('#pf-left-year')).toHaveValue('2024');
  await expect(page.locator('#pf-classof-year')).toHaveValue('');
  step('editing — the form opens with DROPPED OUT picked and Fall 2024 filled in');
  await chip('alum').click(); await page.locator('#pf-classof-year').fill('2025'); await save.click();
  await expect.poll(async () => { const r = await row(dropout.id); return [r.status, r.dropped_out, r.grad_year].join(); }, { timeout: 15000 }).toBe('alum,false,2025');
  await loaded(); await chip('dropped_out').click(); await page.locator('#pf-left-term').selectOption('Spring'); await page.locator('#pf-left-year').fill('2025'); await save.click();
  await expect.poll(async () => { const r = await row(dropout.id); return [r.status, r.dropped_out, r.grad_term, r.grad_year].join(); }, { timeout: 15000 }).toBe('alum,true,SP,2025');
  await loaded(); await chip('student').click(); await page.locator('#pf-grad-term').selectOption('Spring'); await page.locator('#pf-grad-year').fill(String(next)); await save.click();
  await expect.poll(async () => { const r = await row(dropout.id); return [r.status, r.dropped_out].join(); }, { timeout: 15000 }).toBe('student,false');
  step('editing — DROPPED OUT → ALUM (class of 2025) → DROPPED OUT (Spring 2025) → CURRENT STUDENT, each saved, dropped_out set and cleared');

  const all = [...errors, ...A.errors, ...M.errors];
  assert.deepEqual(all, [], `no page errors: ${all.join(' | ')}`);
  step('no page errors on any of the pages');
} finally {
  for (const u of made) await u.cleanup().catch((e) => console.error('cleanup', e.message));
  await browser?.close();
}
