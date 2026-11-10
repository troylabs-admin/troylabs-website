// The LOCATION box's suggestions and the signed-out handling (2026-10-26), in Safari's engine on an iPhone and in Chrome
// on a laptop, against the local stack: TL_SUPABASE=local, the site built with PUBLIC_SUPABASE_URL/KEY pointing at it and
// served on PORTAL_URL. The geocoder answers from a fixture (Open-Meteo matches from the start of a name); the database
// and the sign-in service are real (local). Nothing here touches the live project.
// node qa/portal/location-suggest.mjs
import assert from 'node:assert/strict';
import { chromium, webkit, devices, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { adminClient, client, local, makeUser, url as projectUrl } from './helpers.mjs';
assert.ok(local, 'run with TL_SUPABASE=local: this test adds cities and signs people out');
const portal = process.env.PORTAL_URL || 'http://127.0.0.1:4399';
const out = 'test-results/location-suggest'; mkdirSync(out, { recursive: true });
const KEY = `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token`;
const admin = adminClient(); const made = [];
const place = (name, admin1, country, country_code, latitude, longitude) => ({ name, admin1, country, country_code, latitude, longitude });
const WORLD = [
  place('San Francisco', 'California', 'United States', 'US', 37.77493, -122.41942), place('San Francisco', 'Caraga', 'Philippines', 'PH', 8.53556, 125.95),
  place('Boise', 'Idaho', 'United States', 'US', 43.6135, -116.20345), place('Portland', 'Oregon', 'United States', 'US', 45.52345, -122.67621),
  place('Portland', 'Maine', 'United States', 'US', 43.66147, -70.25533), place('Tacoma', 'Washington', 'United States', 'US', 47.25288, -122.44429),
  place('Pasadena', 'California', 'United States', 'US', 34.14778, -118.14452),
];
const cityOf = async (id) => (await admin.from('profiles').select('city:cities(name, region, country)').eq('id', id).single()).data?.city;
const signInContext = async (browser, engine, session) => {
  const ctx = await browser.newContext(engine === 'webkit' ? { ...devices['iPhone 13'], reducedMotion: 'reduce' } : { viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(({ key, session }) => { if (session && !sessionStorage.getItem('tl-qa-seeded')) { localStorage.setItem(key, JSON.stringify(session)); sessionStorage.setItem('tl-qa-seeded', '1'); } }, { key: KEY, session });
  // Open-Meteo: 2 letters exact, 3+ from the start of a name; "tac" answers slowly (a weak signal) to test late answers
  await ctx.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('name').toLowerCase();
    if (q.startsWith('tac')) await new Promise((r) => setTimeout(r, 1500));
    const results = WORLD.filter((p) => q.length < 3 ? p.name.toLowerCase() === q : p.name.toLowerCase().startsWith(q));
    return route.fulfill({ contentType: 'application/json', json: results.length ? { results } : {} });
  });
  return ctx;
};
const freshSession = async (email) => {   // what clicking a new sign-in link gives the same account
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email }); if (error) throw error;
  const { data: auth, error: e2 } = await client().auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'email' }); if (e2) throw e2;
  return auth.session;
};

// a clean slate for the cities this test adds (the starting 30 include San Francisco and Portland, OR): before each
// browser, since the first one adds Boise and the second must find it new again
const cleanSlate = async () => {
  const added = (await admin.from('cities').select('id').or('name.eq.Boise,name.eq.Tacoma,and(name.eq.Portland,region.eq.ME)')).data?.map((c) => c.id) ?? [];
  if (added.length) { await admin.from('profiles').update({ city_id: null }).in('city_id', added); await admin.from('cities').delete().in('id', added); }
};

let browser;
try {
  const sf = (await admin.from('cities').select('id').eq('name', 'San Francisco').eq('region', 'CA').single()).data;

  for (const engine of ['webkit', 'chromium']) {
    await cleanSlate();
    browser = await (engine === 'webkit' ? webkit : chromium).launch();
    const u = await makeUser(admin, `Suggest QA ${engine}`, false); made.push(u);
    const ctx = await signInContext(browser, engine, u.session); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => {
      // WebKit reports a request cancelled by leaving the page as "… due to access control checks." (home's own script is
      // still loading when the gate sends them back to their profile). A real failure would fail the step that needed it.
      if (engine === 'webkit' && /due to access control checks\.$/.test(e.message)) return;
      errors.push(e.message);
    });
    const box = page.locator('#pf-loc'), list = page.locator('#pf-loc-list'), opts = list.locator('li[role="option"]'), note = list.locator('li.is-note');
    const said = page.locator('#pf-loc').locator('xpath=ancestor::div[contains(@class,"portal-inline")]/following-sibling::p[contains(@class,"portal-feedback")][1]');
    const typeIn = async (text) => { await box.fill(''); await box.click(); await box.pressSequentially(text, { delay: 30 }); };
    const tapOrClick = (loc) => engine === 'webkit' ? loc.tap() : loc.click();
    await page.goto(`${portal}/alumni-portal/profile`); await expect(page.locator('.portal-profile')).not.toHaveAttribute('inert', '');

    // 1. a city already on the map: offered first, marked, and picking it reuses that row
    await typeIn('San Fr');
    await expect(opts.first()).toContainText('San Francisco, CA'); await expect(opts.first()).toContainText('Already on the map');
    await expect(opts).toHaveCount(2); await expect(opts.nth(1)).toContainText('San Francisco PH');
    await expect(box).toHaveAttribute('aria-expanded', 'true');
    await page.screenshot({ path: `${out}/${engine}-suggestions.png` });
    await tapOrClick(opts.first());
    await expect(said).toHaveText('Pin placed: San Francisco, CA.'); await expect(list).toBeHidden(); await expect(box).toHaveValue('San Francisco, CA');
    assert.equal((await admin.from('profiles').select('city_id').eq('id', u.id).single()).data.city_id, sf.id, 'the listed San Francisco, not a new one');
    console.log(`PASS [${engine}]: a city on the map is offered first and a ${engine === 'webkit' ? 'tap' : 'click'} places it`);

    // 2. a city nobody has picked: from the geocoder, chosen with the keyboard, added for everyone
    await typeIn('Boi'); await expect(opts.first()).toContainText('Boise, ID'); await expect(opts.first()).toContainText('Idaho, United States');
    await box.press('ArrowDown'); await expect(opts.first()).toHaveAttribute('aria-selected', 'true'); await expect(box).toHaveAttribute('aria-activedescendant', 'pf-loc-opt-0');
    await box.press('Enter');
    await expect(said).toHaveText('Pin placed: Boise, ID.'); assert.deepEqual(await cityOf(u.id), { name: 'Boise', region: 'ID', country: 'US' });
    console.log(`PASS [${engine}]: a new city from the suggestions (arrow keys + Enter) is added and placed`);

    // 3. a typed state narrows: Portland, ME offers Maine only
    await typeIn('Portland, ME'); await expect(opts).toHaveCount(1); await expect(opts.first()).toContainText('Portland, ME');
    await tapOrClick(opts.first()); await expect(said).toHaveText('Pin placed: Portland, ME.'); assert.deepEqual(await cityOf(u.id), { name: 'Portland', region: 'ME', country: 'US' });
    console.log(`PASS [${engine}]: "Portland, ME" offers only Maine`);

    // 4. nothing matches: the list says so; Enter then gives UPDATE's message; nothing changes
    await typeIn('Atlantis'); await expect(note).toContainText('No city called “Atlantis”'); await expect(opts).toHaveCount(0);
    await box.press('Enter'); await expect(said).toContainText('We couldn\'t find "Atlantis"'); assert.deepEqual(await cityOf(u.id), { name: 'Portland', region: 'ME', country: 'US' });
    // Escape closes an open list
    await typeIn('Pasa'); await expect(opts.first()).toContainText('Pasadena'); await box.press('Escape'); await expect(list).toBeHidden(); await expect(box).toHaveAttribute('aria-expanded', 'false');
    console.log(`PASS [${engine}]: no match is said plainly and changes nothing; Escape closes the list`);

    // 5. a slow answer for an older search never replaces the newer one
    await typeIn('Tac'); await page.waitForTimeout(400); await typeIn('Pasadena');
    await expect(opts.first()).toContainText('Pasadena'); await page.waitForTimeout(1800);
    await expect(opts).toHaveCount(1); await expect(opts.first()).toContainText('Pasadena');
    await box.press('Escape');
    console.log(`PASS [${engine}]: a late answer for an earlier search is dropped`);

    // 6. signed out while editing: the bar appears, a save says so in words, the typing is kept and comes back after signing in
    await page.locator('#pf-name').fill(`Changed Name ${engine}`); await box.fill('Boston, MA');
    const { error: soErr } = await admin.auth.admin.signOut(u.session.access_token, 'global'); if (soErr) throw soErr;   // the server ends the session
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // the phone brings the tab back
    const bar = page.locator('#signed-out-bar');
    await expect(bar).toBeVisible({ timeout: 10000 }); await expect(bar).toContainText('You’ve been signed out');
    await page.screenshot({ path: `${out}/${engine}-signed-out-bar.png` });
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('tl-profile-draft')));
    assert.equal(kept.patch.full_name, `Changed Name ${engine}`); assert.equal(kept.loc, 'Boston, MA');
    await page.locator('[data-action="update"]').click();
    await expect(said).toHaveText('You’ve been signed out. Sign in again to save. What you typed is kept on this device.');
    assert.notEqual((await admin.from('profiles').select('full_name').eq('id', u.id).single()).data.full_name, `Changed Name ${engine}`, 'nothing saved behind their back');
    await tapOrClick(bar.getByRole('link', { name: 'SIGN IN AGAIN' }));
    await expect(page).toHaveURL(/\/alumni-portal\/?\?again=1$/); assert.ok(!page.url().includes('@'), 'their email is never in the link');
    await expect(page.locator('#portal-email')).toHaveValue(u.email); await expect(page.locator('#portal-msg')).toContainText('You were signed out');
    const again = await freshSession(u.email);   // they tap the new link in their email
    await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: KEY, session: again });
    await page.goto(`${portal}/alumni-portal/home`);
    await expect(page).toHaveURL(/\/alumni-portal\/profile/); await expect(page.locator('.portal-profile')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#pf-name')).toHaveValue(`Changed Name ${engine}`); await expect(box).toHaveValue('Boston, MA');
    await expect(page.locator('.portal-save .portal-feedback')).toContainText('We kept what you typed before you were signed out');
    await expect(page.locator('.portal-save .portal-feedback')).toContainText(`then press ${(await page.locator('[data-action="save"]').innerText()).trim()}.`);   // the button as it reads (an applicant's says SUBMIT FOR APPROVAL)
    await expect(page.locator('#signed-out-bar')).toHaveCount(0);
    assert.equal(await page.evaluate(() => localStorage.getItem('tl-profile-draft')), null, 'put back once, then forgotten');
    console.log(`PASS [${engine}]: signed out mid-edit → bar, a plain "signed out" message, nothing saved; signing in again restores the typing`);

    // 7. SIGN OUT on purpose: no bar, nothing kept
    await page.locator('a[href="/alumni-portal"]', { hasText: /sign out/i }).first().evaluate((a) => a.click());
    await expect(page).toHaveURL(/\/alumni-portal\/?$/); await expect(page.locator('#signed-out-bar')).toHaveCount(0);
    console.log(`PASS [${engine}]: SIGN OUT on purpose shows no "you've been signed out" bar`);
    assert.deepEqual(errors, [], `no browser errors (${errors.join(' | ')})`);
    await ctx.close(); await browser.close(); browser = null;
  }

  // 8. Jared's case: the browser holds a sign-in the server doesn't know (here: an account deleted after signing in)
  browser = await webkit.launch();
  const ghost = await makeUser(admin, 'Ghost QA', false); const stale = ghost.session; await ghost.cleanup();
  const gctx = await signInContext(browser, 'webkit', stale); const gp = await gctx.newPage();
  await gp.goto(`${portal}/alumni-portal/profile`);
  await expect(gp).toHaveURL(/\/alumni-portal\/?$/, { timeout: 10000 }); await expect(gp.locator('#portal-email')).toBeVisible();
  assert.equal(await gp.evaluate((k) => localStorage.getItem(k), KEY), null, 'the dead sign-in is cleared from the phone');
  console.log('PASS: a stored sign-in the server rejects sends them to sign in instead of showing a form that can\'t save');
} finally {
  await browser?.close();
  for (const u of made) await u.cleanup().catch(() => {});
  await cleanSlate().catch(() => {});
}
