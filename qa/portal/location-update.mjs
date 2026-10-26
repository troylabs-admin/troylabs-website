// The profile's LOCATION box in Safari's engine on an iPhone, against the local stack (TL_SUPABASE=local, the site built
// with PUBLIC_SUPABASE_URL/KEY pointing at it, served on PORTAL_URL). The geocoder answers from a fixture; the database
// is the real one. Covers: a city already listed, a city nobody has picked yet (San Francisco, 2026-10: "permission
// denied for table cities" on the phone), a state that doesn't match the only listed city of that name, a city the
// geocoder doesn't know, typing a city and pressing SAVE instead of UPDATE, and the keyboard's Go key.
// node qa/portal/location-update.mjs
import assert from 'node:assert/strict';
import { webkit, devices, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { adminClient, local, makeUser, url as projectUrl } from './helpers.mjs';
assert.ok(local, 'run with TL_SUPABASE=local: this test adds and removes cities');
const portal = process.env.PORTAL_URL || 'http://localhost:4321';
const out = 'test-results/location'; mkdirSync(out, { recursive: true });
const admin = adminClient(); let user, applicant, browser;
// what the geocoder (Open-Meteo) says, by the name searched
const place = (name, admin1, country_code, latitude, longitude) => ({ name, admin1, country_code, latitude, longitude });
const GEO = {
  'san francisco': [place('San Francisco', 'California', 'US', 37.77493, -122.41942), place('San Francisco', 'Caraga', 'PH', 8.53556, 125.95)],
  'portland': [place('Portland', 'Oregon', 'US', 45.52345, -122.67621), place('Portland', 'Maine', 'US', 43.66147, -70.25533)],
  'boise': [place('Boise', 'Idaho', 'US', 43.6135, -116.20345)],
  'tacoma': [place('Tacoma', 'Washington', 'US', 47.25288, -122.44429)],   // answered slowly: a phone on a weak signal
};
const cityOf = async (id) => (await admin.from('profiles').select('city:cities(name, region, country)').eq('id', id).single()).data?.city;
try {
  // a fresh city each run: no listed San Francisco (production had none), Portland ME or Boise
  await admin.from('profiles').update({ city_id: null }).in('city_id', (await admin.from('cities').select('id').or('name.eq.San Francisco,name.eq.Boise,name.eq.Tacoma,and(name.eq.Portland,region.eq.ME)')).data?.map((c) => c.id) ?? []);
  await admin.from('cities').delete().or('name.eq.San Francisco,name.eq.Boise,name.eq.Tacoma,and(name.eq.Portland,region.eq.ME)');
  user = await makeUser(admin, 'Location QA');
  browser = await webkit.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  await context.addInitScript(({ key, session }) => { if (!sessionStorage.getItem('tl-qa-seeded')) { localStorage.setItem(key, JSON.stringify(session)); sessionStorage.setItem('tl-qa-seeded', '1'); } }, { key: `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token`, session: user.session });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  let geoDown = false;
  await page.route('https://geocoding-api.open-meteo.com/**', async (route) => { const name = new URL(route.request().url()).searchParams.get('name').toLowerCase(); if (name === 'tacoma') await new Promise((r) => setTimeout(r, 1500)); return geoDown ? route.abort() : route.fulfill({ contentType: 'application/json', json: { results: GEO[name] ?? undefined } }); });
  const load = async () => { await page.goto(`${portal}/alumni-portal/profile`); await expect(page.locator('.portal-profile')).not.toHaveAttribute('inert', ''); };
  const box = page.locator('#pf-loc'), update = page.locator('[data-action="update"]'), said = page.locator('#pf-loc').locator('xpath=ancestor::div[contains(@class,"portal-inline")]/following-sibling::p[contains(@class,"portal-feedback")][1]');
  // each UPDATE starts from an empty message, so a check can't pass on the previous one's
  const updateTo = async (text) => { await expect(update).toBeEnabled(); await said.evaluate((p) => { p.textContent = ''; }); await box.fill(text); await update.tap(); };
  await load();

  await updateTo('Los Angeles, CA');
  await expect(said).toHaveText('Pin placed: Los Angeles, CA.');
  console.log('PASS: a listed city (Los Angeles)');

  await updateTo('San Francisco, CA');
  await expect(said).toHaveText('Pin placed: San Francisco, CA.');
  await expect(page.locator('#pf-loc-note')).toHaveText('San Francisco, CA · pin on the globe');
  assert.deepEqual(await cityOf(user.id), { name: 'San Francisco', region: 'CA', country: 'US' });
  console.log('PASS: a city nobody has picked yet (San Francisco) is added and pinned');

  await updateTo('san francisco, california');
  await expect(said).toHaveText('Pin placed: San Francisco, CA.');
  assert.equal((await admin.from('cities').select('id').eq('name', 'San Francisco')).data.length, 1, 'picking it again reuses the row');
  console.log('PASS: the same city typed differently reuses it');

  await updateTo('Portland, ME');
  await expect(said).toHaveText('Pin placed: Portland, ME.');
  assert.deepEqual(await cityOf(user.id), { name: 'Portland', region: 'ME', country: 'US' });
  console.log('PASS: Portland, ME is not taken to be the listed Portland, OR');

  await updateTo('Atlantis, ZZ');
  await expect(said).toContainText('We couldn\'t find "Atlantis"');
  geoDown = true; await updateTo('Boise, ID');
  await expect(said).toContainText('connection'); geoDown = false;
  assert.deepEqual(await cityOf(user.id), { name: 'Portland', region: 'ME', country: 'US' }, 'a city that can\'t be found changes nothing');
  console.log('PASS: an unknown city and an unreachable geocoder say so and change nothing');

  // a second tap while the first is still working doesn't start another
  let saves = 0; const count = (r) => { if (r.method() === 'PATCH' && r.url().includes('/rest/v1/profiles')) saves++; }; page.on('request', count);
  await updateTo('Tacoma, WA'); await expect(said).toHaveText('Looking up that city…'); await update.tap({ force: true });
  await expect(said).toHaveText('Pin placed: Tacoma, WA.'); await page.waitForTimeout(500); page.off('request', count);
  assert.equal(saves, 1, 'one save for a double tap');
  console.log('PASS: a double tap saves once');

  // typed but never UPDATEd: SAVE places it rather than saying "Saved" and dropping it
  await box.fill('Boise, ID'); await page.locator('[data-action="save"]').tap();
  await expect(page.locator('.portal-save .portal-feedback')).toContainText('Saved.');
  assert.deepEqual(await cityOf(user.id), { name: 'Boise', region: 'ID', country: 'US' });
  await expect(page.locator('#pf-loc-note')).toHaveText('Boise, ID · pin on the globe');
  console.log('PASS: SAVE places a typed city');

  // the keyboard's Go key in the box places the city (it's UPDATE for this box, not the whole form)
  await box.fill('New York, NY'); await box.press('Enter');
  await expect(said).toHaveText('Pin placed: New York, NY.');
  assert.deepEqual(await cityOf(user.id), { name: 'New York', region: 'NY', country: 'US' });
  console.log('PASS: Go on the keyboard places the city');

  await load(); await expect(box).toHaveValue('New York, NY');
  assert.deepEqual(errors, []); console.log('PASS: kept after a reload; no browser errors');

  // someone still applying (SUBMIT FOR APPROVAL, like the 2026-10-26 report) places a new city the same way
  await admin.from('profiles').update({ city_id: null }).eq('id', user.id); await admin.from('cities').delete().eq('name', 'San Francisco');
  applicant = await makeUser(admin, 'Location Applicant QA', false);
  const other = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  await other.addInitScript(({ key, session }) => { localStorage.setItem(key, JSON.stringify(session)); }, { key: `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token`, session: applicant.session });
  const p2 = await other.newPage(); await p2.route('https://geocoding-api.open-meteo.com/**', (route) => route.fulfill({ contentType: 'application/json', json: { results: GEO['san francisco'] } }));
  await p2.goto(`${portal}/alumni-portal/profile`); await expect(p2.locator('.portal-profile')).not.toHaveAttribute('inert', '');
  await expect(p2.locator('[data-action="save"]')).toContainText('SUBMIT');
  await p2.locator('#pf-loc').fill('San Francisco, CA'); await p2.locator('[data-action="update"]').tap();
  await expect(p2.locator('#pf-loc-note')).toHaveText('San Francisco, CA · pin on the globe');
  assert.deepEqual(await cityOf(applicant.id), { name: 'San Francisco', region: 'CA', country: 'US' });
  await p2.locator('#pf-loc').scrollIntoViewIfNeeded(); await p2.screenshot({ path: `${out}/applicant-san-francisco.png` });
  console.log('PASS: an applicant adds a new city (San Francisco)');
} finally { await browser?.close(); await user?.cleanup(); await applicant?.cleanup(); }
