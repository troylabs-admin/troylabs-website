/** Offline SMS UI regression: PORTAL_URL=http://localhost:4399 node qa/portal/messages-ui.mjs.
 * Every external request is mocked. MESSAGES_UI_CAPTURE_ONLY=1 runs only responsive captures. */
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createMessagesFixture } from './messages-ui-fixture.mjs';
const out = 'test-results/messages-ui', browser = await chromium.launch(), failures = [];
const personId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const group = (page, name = 'TECH', who = 'alumni') => page.locator(`[data-group="${name}"][data-who="${who}"]`);
const action = (page, name) => page.locator(`[data-action="${name}"]`);
const mode = (page, name) => page.locator(`[data-audience-mode="${name}"]`);
const picker = (page, n) => page.locator(`[data-person-id="${personId(n)}"]`);
const body = page => page.locator('#mc-body');
const count = (page, n) => expect(page.locator('[data-who-head]')).toContainText(new RegExp(`\\b${n}\\b`));
const compose = async page => { await body(page).fill('Demo night is this Thursday. Join us at 7 PM!'); await group(page).click(); };
const schedule = async page => { await compose(page); await page.locator('[data-when] [data-value="later"]').click(); await page.locator('#mc-when').fill('2030-10-08T10:00'); };
const cleared = async page => {
  await expect(body(page)).toHaveValue(''); await expect(page.locator('#mc-when')).toHaveValue('');
  await expect(page.locator('[data-templates] [aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('[data-aud-grid] [aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('[data-person-id]:checked')).toHaveCount(0);
  await expect(page.locator('[data-when] [data-value="now"]')).toHaveAttribute('aria-pressed', 'true');
};
const check = async (name, work, options = {}) => {
  const f = await createMessagesFixture(browser, options);
  try {
    if (options.setup) await options.setup(f.state);
    await f.page.goto(`${f.base}/alumni-portal/admin/messages`);
    await expect(f.page.locator('[data-template="0"]')).toBeVisible({ timeout: 15000 });
    await expect(action(f.page, 'send')).toBeEnabled();
    await work(f);
    assert.deepEqual(f.state.errors, [], 'browser errors');
    assert.equal(f.state.calls.some(c => c.mode === 'welcome-backlog' && !c.dry), false, 'welcome delivery is never invoked');
    console.log(`PASS: ${name}`);
  } catch (e) { failures.push(`${name}: ${e.message}`); console.error(`FAIL: ${name}: ${e.message}`); }
  finally { await f.context.close(); }
};
try {
  if (!process.env.MESSAGES_UI_CAPTURE_ONLY) {
    await check('SMS-only composer has no email, channel or subject controls', async ({ page }) => {
      await expect(page.locator('#mc-title, [data-subject-field], [data-single]:not([data-when])')).toHaveCount(0);
      await expect(page.locator('[data-templates]')).not.toContainText(/welcome/i);
      await expect(page.locator('[data-test-target]')).toContainText('(213) 555-0171');
      await expect(page.locator('[data-test-target]')).not.toContainText('messages-admin@example.com');
      await body(page).fill('A quick update.'); await expect(page.locator('[data-sms-bubble]')).toContainText('TroyLabs:');
      await expect(page.locator('[data-sms-bubble]')).toContainText('Reply STOP');
    });
    await check('templates visibly select one and always preserve SMS', async ({ page, state }) => {
      const templates = page.locator('[data-template]');
      for (let i = 0; i < await templates.count(); i++) { await templates.nth(i).click(); await expect(templates.nth(i)).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('[data-template][aria-pressed="true"]')).toHaveCount(1); await expect(page.locator('[data-sms-bubble]')).toBeVisible(); }
      await body(page).fill('Our announcement is ready.'); await action(page, 'draft').click(); await expect(page.locator('#msg-fb')).toContainText(/saved as a draft/i);
      assert.equal(state.writes.at(-1).body.send_by, 'text'); await cleared(page);
    });
    await check('empty history uses an honest empty state without sample messages', async ({ page }) => {
      await expect(page.locator('[data-msg-list]')).toContainText(/no messages/i); await expect(page.locator('[data-example-use], [data-example-recipients]')).toHaveCount(0); await expect(page.locator('[data-msg-list]')).not.toContainText(/EXAMPLE|DEMO 2026/);
    }, { setup: state => { state.messages = []; } });
    await check('overlapping groups and shared phones yield two unique recipients', async ({ page }) => {
      await group(page).click(); await group(page, 'BUILD').click(); await count(page, 2); await page.locator('[data-who-head]').click();
      await expect(page.locator('[data-who-items] .text-ink')).toHaveCount(2); await expect(page.locator('[data-who-items]')).toContainText('Alexandra Longlastname'); await expect(page.locator('[data-who-items]')).toContainText('Riley Build Alum');
      await expect(page.locator('[data-who-items]')).toContainText(/shared|same|once/i); await expect(page.locator('[data-who-items]')).toContainText(/texts off|opted out/i); await expect(page.locator('[data-who-items]')).toContainText(/no number|no phone/i);
      await expect(page.locator('[data-who-items]')).not.toContainText(/Unapproved Applicant|Production Member/);
    });
    await check('custom people search preserves selection and routes only exact IDs', async ({ page, state }) => {
      await mode(page, 'people').click(); await page.locator('#mc-person-search').fill('Alexandra'); await picker(page, 2).check();
      await page.locator('#mc-person-search').fill('Jamie'); await picker(page, 3).check(); await count(page, 2);
      await body(page).fill('A note for two people.'); await action(page, 'draft').click(); await expect(page.locator('#msg-fb')).toContainText(/saved as a draft/i);
      const saved = state.writes.at(-1).body; assert.equal(saved.send_by, 'text'); assert.equal(saved.audience.mode, 'people'); assert.deepEqual([...saved.audience.profile_ids].sort(), [personId(2), personId(3)]); assert.deepEqual(saved.audience.cells, []); await cleared(page);
    });
    await check('search matching selection and clear do not select hidden people', async ({ page, state }) => {
      await mode(page, 'people').click(); await page.locator('#mc-person-search').fill('Jamie'); await action(page, 'select-people').click(); await expect(picker(page, 3)).toBeChecked(); await count(page, 1);
      await action(page, 'clear-audience').click(); await expect(page.locator('[data-person-id]:checked')).toHaveCount(0);
      await page.locator('#mc-person-search').fill('NoSuchPerson'); await expect(page.locator('[data-person-id]')).toHaveCount(0); await body(page).fill('No accidental audience.'); await action(page, 'send').click(); assert.equal(state.writes.length, 0); assert.equal(state.calls.some(c => c.mode === 'send'), false);
    });
    await check('group and people modes never combine recipients', async ({ page, state }) => {
      await group(page).click(); await mode(page, 'people').click(); await picker(page, 3).check(); await count(page, 1);
      await body(page).fill('Only Jamie should be selected.'); await action(page, 'draft').click(); await expect(page.locator('#msg-fb')).toContainText(/saved as a draft/i);
      assert.deepEqual(state.writes.at(-1).body.audience.profile_ids, [personId(3)]); assert.deepEqual(state.writes.at(-1).body.audience.cells, []);
    });
    await check('custom people exclusions explain opted-out and missing-phone selections', async ({ page }) => {
      await mode(page, 'people').click(); await picker(page, 4).check(); await picker(page, 6).check(); await count(page, 0); await page.locator('[data-who-head]').click();
      await expect(page.locator('[data-who-items]')).toContainText('Taylor Opted Out'); await expect(page.locator('[data-who-items]')).toContainText('Casey No Number'); await expect(page.locator('[data-who-items]')).toContainText(/texts off|opted out/i); await expect(page.locator('[data-who-items]')).toContainText(/no number|no phone/i);
      await expect(picker(page, 7)).toHaveCount(0); await expect(picker(page, 8)).toHaveCount(0);
    });
    await check('confirmed custom send persists exact people then sends once', async ({ page, state }) => {
      await mode(page, 'people').click(); await picker(page, 3).check(); await body(page).fill('An individual invitation'); await action(page, 'send').click(); await expect(page.locator('#msg-fb')).toContainText(/sent 1 message/i);
      assert.equal(state.writes.length, 1); assert.equal(state.writes[0].body.send_by, 'text'); assert.deepEqual(state.writes[0].body.audience.profile_ids, [personId(3)]); assert.deepEqual(state.writes[0].body.audience.cells, []);
      assert.deepEqual(state.calls.filter(c => c.mode === 'send'), [{ mode: 'send', messageId: state.writes[0].id }]); assert.equal(state.dialogs.length, 1);
    });
    await check('custom person draft reopens with original ID and selection', async ({ page, state }) => {
      await mode(page, 'people').click(); await picker(page, 3).check(); await body(page).fill('A personal draft'); await action(page, 'draft').click(); await expect(page.locator('#msg-fb')).toContainText(/saved as a draft/i);
      const id = state.writes.at(-1).id; await page.locator(`[data-edit="${id}"]`).click(); await expect(mode(page, 'people')).toHaveAttribute('aria-pressed', 'true'); await expect(picker(page, 3)).toBeChecked(); await body(page).fill('Revised personal draft'); await action(page, 'draft').click(); await expect(body(page)).toHaveValue('');
      assert.equal(state.writes.at(-1).method, 'PATCH'); assert.equal(state.writes.at(-1).id, id); assert.equal(state.messages.filter(m => m.id === id).length, 1);
    });
    await check('saving a draft clears body audience schedule and template', async ({ page, state }) => {
      await page.locator('[data-template="2"]').click(); await body(page).fill('An unfinished announcement'); await group(page).click(); await page.locator('[data-when] [data-value="later"]').click(); await page.locator('#mc-when').fill('2030-10-08T10:00');
      await action(page, 'draft').click(); await expect(page.locator('#msg-fb')).toContainText(/saved as a draft/i); assert.equal(state.writes.length, 1); await cleared(page);
    });
    await check('draft save allows an empty audience', async ({ page, state }) => {
      await body(page).fill('Unfinished draft'); await action(page, 'draft').click(); await expect(page.locator('#msg-fb')).toContainText(/saved as a draft/i); assert.equal(state.writes.length, 1); assert.equal(state.writes[0].body.send_by, 'text');
    });
    await check('scheduled edit preserves local time and draft edit clears it', async ({ page }) => {
      await page.locator('[data-edit="900002"]').click(); await expect(page.locator('#mc-when')).toHaveValue('2030-10-08T10:00'); await page.locator('[data-edit="900001"]').click(); await expect(page.locator('#mc-when')).toHaveValue(''); await expect(page.locator('[data-when] [data-value="now"]')).toHaveAttribute('aria-pressed', 'true');
    });
    for (const reset of ['new-draft', 'template']) await check(`${reset} clears a previous schedule`, async ({ page }) => {
      await page.locator('[data-edit="900002"]').click(); await (reset === 'new-draft' ? action(page, reset) : page.locator('[data-template="0"]')).click(); await expect(page.locator('#mc-when')).toHaveValue(''); await expect(page.locator('[data-when] [data-value="now"]')).toHaveAttribute('aria-pressed', 'true');
    });
    await check('text schedule needs no subject and stores correct UTC time', async ({ page, state }) => {
      await schedule(page); const content = 'Demo night is this Thursday at 7 PM in the Iovine and Young Hall commons, bring a friend'; await body(page).fill(content); await action(page, 'send').click(); await expect(page.locator('#msg-fb')).toContainText('Scheduled');
      const w = state.writes.at(-1).body; assert.equal(w.send_by, 'text'); assert.equal(w.scheduled_for, '2030-10-08T17:00:00.000Z'); assert.ok(w.title.endsWith('…') && w.title.length <= 61 && content.startsWith(w.title.slice(0, -1))); assert.equal(state.calls.some(c => c.mode === 'send'), false);
    });
    await check('short SMS body is its history name', async ({ page, state }) => { await schedule(page); await body(page).fill('See you at DEMO tonight!'); await action(page, 'send').click(); await expect(page.locator('#msg-fb')).toContainText('Scheduled'); assert.equal(state.writes.at(-1).body.title, 'See you at DEMO tonight!'); });
    const guards = [
      ['empty body', async p => body(p).fill(''), /write.*message/i],
      ['missing audience', async p => group(p).click(), /pick|choose.*(?:audience|group|person)/i],
      ['zero reachable people', async p => { await group(p).click(); await group(p, 'DEMO').click(); }, /nobody|no.*recipient/i],
      ['oversized body', async p => body(p).fill('a'.repeat(2000)), /too long|shorten/i],
      ['missing date', async p => p.locator('#mc-when').fill(''), /pick.*date|date.*time/i],
      ['past date', async p => p.locator('#mc-when').fill('2020-01-01T10:00'), /passed|future/i],
      ['outside texting hours', async p => p.locator('#mc-when').fill('2030-10-08T23:00'), /8 AM.*9 PM/],
      ['template placeholder', async p => body(p).fill('Join [Event name] tomorrow'), /fill.*Event name|placeholder/i],
    ];
    for (const [name, prepare, error] of guards) await check(`schedule rejects ${name}`, async ({ page, state }) => { await schedule(page); await prepare(page); await action(page, 'send').click(); await expect(page.locator('#msg-fb')).toContainText(error); assert.equal(state.writes.length, 0); assert.equal(state.calls.some(c => c.mode === 'send'), false); });
    await check('zero-recipient send never invokes sender', async ({ page, state }) => { await body(page).fill('No recipient test'); await group(page, 'DEMO').click(); await action(page, 'send').click(); await expect(page.locator('#msg-fb')).toContainText(/nobody/i); assert.equal(state.writes.length, 0); assert.equal(state.calls.some(c => c.mode === 'send'), false); });
    await check('self-test remains self-targeted despite selected people', async ({ page, state }) => {
      await mode(page, 'people').click(); await picker(page, 3).check(); await body(page).fill('A self-test for the admin'); await action(page, 'test-send').click(); await expect(page.locator('#msg-fb')).toContainText('(213) 555-0171');
      const tests = state.calls.filter(c => c.mode === 'test'); assert.equal(tests.length, 1); assert.deepEqual(Object.keys(tests[0]).sort(), ['messageId', 'mode']); assert.equal(state.calls.some(c => c.mode === 'send'), false); assert.equal(state.writes.at(-1).body.send_by, 'text');
    });
    await check('testing a scheduled message preserves original schedule', async ({ page, state }) => {
      await page.locator('[data-edit="900002"]').click(); const original = structuredClone(state.messages.find(m => m.id === 900002)); await action(page, 'test-send').click(); await expect(page.locator('#msg-fb')).toContainText(/original schedule is unchanged/i); assert.equal(state.writes[0].method, 'POST'); assert.deepEqual(state.messages.find(m => m.id === 900002), original); assert.equal(state.calls.filter(c => c.mode === 'test').length, 1);
    });
    await check('cohort filters survive saved-draft editing', async ({ page, state }) => {
      await compose(page); await page.locator('.portal-or > summary').click(); await page.locator('[data-cohorts] .portal-chip').filter({ hasText: 'FA22' }).click(); await action(page, 'draft').click(); await expect(page.locator('#msg-fb')).toContainText(/saved as a draft/i);
      const saved = state.writes.at(-1); assert.deepEqual(saved.body.audience.cohort, ['FA22']); await page.locator(`[data-edit="${saved.id}"]`).click(); await expect(page.locator('[data-cohorts] .portal-chip[aria-pressed="true"]')).toHaveText(['FA22']);
    });
    await check('overlapping save and test performs one write', async ({ page, state }) => {
      await body(page).fill('One write only'); state.writeDelay = 350; await action(page, 'draft').click(); await expect(action(page, 'test-send')).toBeDisabled(); await action(page, 'test-send').evaluate(el => el.click()); await expect(page.locator('#msg-fb')).toContainText(/saved as a draft/i); assert.equal(state.writes.length, 1); assert.equal(state.calls.some(c => c.mode === 'test'), false);
    });
    await check('failed draft save retains content selection and re-enables action', async ({ page, state }) => {
      await compose(page); state.writeError = 'Fixture storage temporarily unavailable'; await action(page, 'draft').click(); await expect(page.locator('#msg-fb')).toContainText('temporarily unavailable'); await expect(action(page, 'draft')).toBeEnabled(); await expect(body(page)).not.toHaveValue(''); await expect(group(page)).toHaveAttribute('aria-pressed', 'true');
    });
    await check('failed self-test reports delivery error', async ({ page, state }) => { await body(page).fill('A test message'); state.functionError = 'Fixture sending temporarily unavailable'; await action(page, 'test-send').click(); await expect(page.locator('#msg-fb')).toContainText('temporarily unavailable'); await expect(action(page, 'test-send')).toBeEnabled(); });
    await check('history tabs and recorded SMS delivery expand correctly', async ({ page }) => {
      await page.locator('[data-msg-tabs] [data-value="sent"]').click(); await expect(page.locator('[data-msg-list] > li[data-state]:visible')).toHaveCount(1); await page.locator('[data-recipients-for="900003"]').click(); await expect(page.locator('[data-msg-list] .portal-recipients:visible')).toContainText('DELIVERED'); await expect(page.locator('[data-msg-list] .portal-recipients:visible')).toContainText('(213) 555-0172');
    });
    await check('legacy email history is read-only without accidental conversion', async ({ page }) => {
      await expect(page.locator('[data-msg-list]')).toContainText('Legacy email'); await expect(page.locator('[data-edit="900099"]')).toHaveCount(0); await expect(page.locator('[data-del="900099"]')).toBeVisible();
    }, { setup: state => state.messages.push({ ...state.messages[0], id: 900099, title: 'Legacy email', send_by: 'email' }) });
    await check('a picked template can be unpicked; untouched text goes, edited text stays', async ({ page }) => {
      const t0 = page.locator('[data-template="0"]'), t1 = page.locator('[data-template="1"]');
      await t0.click(); await expect(t0).toHaveAttribute('aria-pressed', 'true'); await expect(body(page)).not.toHaveValue('');
      await t0.click(); await expect(t0).toHaveAttribute('aria-pressed', 'false'); await expect(body(page)).toHaveValue(''); await expect(page.locator('#mc-ev-name')).toHaveValue(''); await expect(page.locator('[data-sms-preview]')).toBeHidden();
      await t1.click(); await body(page).fill('Reminder: Demo Night is tomorrow at 7 PM, Bovard. See you there!');
      await t1.click(); await expect(t1).toHaveAttribute('aria-pressed', 'false'); await expect(body(page)).toHaveValue('Reminder: Demo Night is tomorrow at 7 PM, Bovard. See you there!');
      await expect(page.locator('#msg-fb')).toContainText('edits are still');
    });
    await check('specific people show a photo, or initials without one', async ({ page }) => {
      await mode(page, 'people').click(); await page.locator('#mc-person-search').fill('Jamie');
      await expect(page.locator('.msg-person', { has: picker(page, 3) }).locator('.msg-person-photo img')).toHaveAttribute('src', /\/storage\/v1\/object\/public\/avatars\/00000000-0000-4000-8000-000000000003\/photo\.jpg/);
      await page.locator('#mc-person-search').fill('Alexandra');
      const row = page.locator('.msg-person', { has: picker(page, 2) }); await expect(row.locator('.msg-person-photo')).toHaveText('AL'); await expect(row).toContainText('Alexandra Longlastname'); await expect(row).toContainText('(213) 555-0172');
    });
    await check('cancel schedule then delete updates history', async ({ page, state }) => { await page.locator('[data-cancel="900002"]').click(); await expect(page.locator('#msg-fb')).toContainText('Cancelled'); assert.equal(state.messages.find(m => m.id === 900002).state, 'draft'); await page.locator('[data-del="900002"]').click(); await expect(page.locator('[data-edit="900002"]')).toHaveCount(0); assert.equal(state.messages.some(m => m.id === 900002), false); });
    await check('keyboard focus is visible on groups people and disclosure', async ({ page }) => {
      await page.keyboard.press('Tab'); await group(page).focus(); assert.equal(await group(page).evaluate(el => getComputedStyle(el).outlineStyle), 'solid'); await mode(page, 'people').click(); await page.keyboard.press('Tab'); await picker(page, 2).focus(); assert.equal(await picker(page, 2).evaluate(el => el.matches(':focus-visible')), true); await page.locator('.msg-automatic > summary').focus(); assert.equal(await page.locator('.msg-automatic > summary').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    });
    await check('roster-load failure visibly blocks saves and sends', async ({ page, state, base }) => {
      state.failLoads = true; await page.goto(`${base}/alumni-portal/admin/messages`); await expect(page.locator('#msg-fb')).toContainText(/couldn.t|unable|unavailable|failed/i, { timeout: 20000 }); for (const name of ['send', 'draft', 'test-send']) await expect(action(page, name)).toBeDisabled();
    });
  }
  for (const width of [320, 390, 768, 1024, 1440]) await check(`responsive SMS composer and custom people ${width}px`, async ({ page }) => {
    await page.locator('[data-template="2"]').click(); await body(page).fill('Join fellow TroyLabs alumni for Demo Night this Thursday at 7 PM. Bring a friend!'); await group(page).click(); await group(page, 'BUILD').click(); await page.locator('[data-who-head]').click();
    const overflow = async () => page.evaluate(() => [...document.querySelectorAll('.portal-col *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.right > innerWidth + 1 || r.left < -1); }).map(el => ({ class: el.className, text: el.textContent.slice(0, 60) })));
    assert.deepEqual(await overflow(), []); mkdirSync(out, { recursive: true }); await page.screenshot({ path: `${out}/messages-${width}.png`, fullPage: true });
    await mode(page, 'people').click(); await picker(page, 2).check(); await picker(page, 3).check(); await count(page, 2); await page.locator('#mc-person-search').fill('Jamie'); assert.deepEqual(await overflow(), []); await page.screenshot({ path: `${out}/people-${width}.png`, fullPage: true });
    await page.locator('[data-when] [data-value="later"]').click(); await page.locator('#mc-when').fill('2030-10-08T10:00'); await page.locator('.msg-delivery-panel').screenshot({ path: `${out}/send-${width}.png` });
    await page.locator('.msg-automatic > summary').click(); await expect(page.locator('[data-auto-texts]')).toBeVisible(); assert.deepEqual(await overflow(), []);
  }, { viewport: { width, height: 900 } });
} finally { await browser.close(); }
assert.deepEqual(failures, [], 'Messages UI regression failures');
console.log('PASS: all external requests mocked; no live deliveries, accounts or database writes.');
