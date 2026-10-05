// AI search (2026-10-05), against the real OpenAI embeddings: profiles are embedded by the database when approved or
// edited (and not when nothing relevant changed); a question finds the right person without sharing words with their
// profile; keyword matches still come first; an unrelated question finds nobody; only approved members can search
// and only approved profiles come back; names, emails and phone numbers are never part of what's embedded.
// Temporary accounts only; all removed.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';
import { profileText } from '../../supabase/functions/_shared/profile-text.ts';

const admin = adminClient(), users = []; let browser;
const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321';
const FN = 'https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/semantic';
const call = async (u, body) => { const r = await fetch(FN, { method: 'POST', headers: { ...(u ? { Authorization: `Bearer ${u.session.access_token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const waitFor = async (check, ms = 40000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await check()) return true; await new Promise((r) => setTimeout(r, 1500)); } return false; };

try {
  // ── what is embedded: work facts only ──────────────────────────────────────────────────────────
  const text = profileText({ id: 'x', status: 'alum', grad_year: 2022, join_term: 'FA', join_year: 2019, divisions: ['TECH'], current_title: 'Founder', current_company: 'VoltCell', industries: ['CLIMATE TECH'], startups: ['VoltCell'], bio: 'Grid batteries.', embedding_hash: null, city: { name: 'San Francisco', region: 'CA' }, full_name: 'Secret Name', personal_email: 'secret@example.com', phone: '+13105550101' });
  assert.equal(text, 'USC alum, class of 2022. Joined TroyLabs in Fall 2019. TroyLabs divisions: TECH. Works as Founder at VoltCell. Based in San Francisco, CA. Industries: CLIMATE TECH. Startups: VoltCell. Grid batteries.');
  for (const leak of ['Secret Name', 'secret@example.com', '3105550101']) assert.ok(!text.includes(leak), `never sent to OpenAI: ${leak}`);
  console.log('PASS: only work facts are embedded (no name, email or phone)');

  // ── the cast, embedded by the database when approved ──────────────────────────────────────────
  const cast = [
    ['Battery QA', { current_title: 'Founder & CEO', current_company: 'VoltCell', industries: ['CLIMATE TECH', 'HARDWARE'], bio: 'Building grid-scale battery storage from recycled lithium cells.', city_id: 2 }],
    ['Payments QA', { current_title: 'Product Manager', current_company: 'Stripe', industries: ['FINTECH'], bio: 'PM on Stripe Billing: subscriptions, invoicing and payment flows.', city_id: 2 }],
    ['Health QA', { current_title: 'Product Designer', current_company: 'One Medical', industries: ['HEALTHTECH', 'DESIGN'], bio: 'Designing patient apps for primary care; I care about accessible UX.', city_id: 1 }],
    ['Robot QA', { current_title: 'Robotics Engineer', current_company: 'Anduril', industries: ['ROBOTICS', 'HARDWARE'], bio: 'Autonomy and perception for unmanned systems. ROS, SLAM, computer vision.', city_id: 1 }],
    ['VC QA', { current_title: 'Associate', current_company: 'Andreessen Horowitz', industries: ['VC/FINANCE'], bio: 'Seed and Series A investing in developer tools and AI infrastructure.', city_id: 2 }],
  ];
  const who = {}; const name = {};
  for (const [n, f] of cast) { const u = await makeUser(admin, n); users.push(u); who[n] = u; name[u.id] = n; await admin.from('profiles').update({ ...f, submitted_at: new Date().toISOString() }).eq('id', u.id); }
  const ids = Object.keys(name);
  assert.ok(await waitFor(async () => (await admin.from('profiles').select('id').in('id', ids).not('embedding', 'is', null)).data.length === ids.length), 'every approved profile was embedded by the database');
  console.log('PASS: approved profiles are embedded automatically');

  // ── the right person first, without shared words ───────────────────────────────────────────────
  const asker = who['Payments QA'];
  for (const [q, want] of [['someone working on energy storage', 'Battery QA'], ['payments and billing', 'Payments QA'], ['who can help me with UX for a health app', 'Health QA'], ['drones and computer vision', 'Robot QA'], ['raise a seed round', 'VC QA']]) {
    const r = await call(asker, { mode: 'search', q }); assert.equal(r.status, 200, `${q}: ${r.body.error}`);
    const mine = r.body.hits.filter((h) => name[h.id]);
    assert.equal(name[mine[0].id], want, `"${q}" ranks ${want} first (got ${mine.map((h) => `${name[h.id]} ${h.similarity.toFixed(2)}`).join(', ')})`);
  }
  console.log('PASS: five questions, each ranks the right person first');

  // ── only when relevant facts change ────────────────────────────────────────────────────────────
  const robot = who['Robot QA'];
  const before = (await admin.from('profiles').select('embedding_hash').eq('id', robot.id).single()).data.embedding_hash;
  await admin.from('profiles').update({ phone: '+13105550199', phone_opt_in: true }).eq('id', robot.id); await new Promise((r) => setTimeout(r, 5000));
  assert.equal((await admin.from('profiles').select('embedding_hash').eq('id', robot.id).single()).data.embedding_hash, before, 'a phone change doesn’t re-embed');
  await admin.from('profiles').update({ bio: 'Now building surgical robots for minimally invasive procedures.' }).eq('id', robot.id);
  assert.ok(await waitFor(async () => (await admin.from('profiles').select('embedding_hash').eq('id', robot.id).single()).data.embedding_hash !== before), 'a bio change re-embeds');
  const surg = await call(asker, { mode: 'search', q: 'robot-assisted surgery' }); assert.equal(name[surg.body.hits.filter((h) => name[h.id])[0].id], 'Robot QA', 'the new bio is what’s searched');
  console.log('PASS: re-embedded when the bio changes, not when the phone does; searches see the new profile');

  // ── access ────────────────────────────────────────────────────────────────────────────────────
  const pending = await makeUser(admin, 'Pending Search QA', false); users.push(pending);
  assert.equal((await call(pending, { mode: 'search', q: 'battery storage' })).status, 403, 'someone waiting for approval can’t search');
  assert.equal((await call(null, { mode: 'search', q: 'battery storage' })).status, 403, 'nobody signed out can search');
  assert.equal((await call(asker, { mode: 'backfill' })).status, 403, 'members can’t run the backfill');
  assert.equal((await call(asker, { mode: 'embed', ids })).status, 403, 'members can’t trigger embeddings');
  await admin.from('profiles').update({ approved: false, declined_at: new Date().toISOString() }).eq('id', who['VC QA'].id);
  const seed = await call(asker, { mode: 'search', q: 'raise a seed round' });
  assert.ok(!seed.body.hits.some((h) => h.id === who['VC QA'].id), 'a declined profile never comes back');
  await admin.from('profiles').update({ approved: true, declined_at: null }).eq('id', who['VC QA'].id);
  console.log('PASS: only approved members can search; only approved profiles come back; admin-only modes refuse members');

  // ── the page ──────────────────────────────────────────────────────────────────────────────────
  browser = await chromium.launch(); const errors = [];
  const { page } = await signInPage(browser, asker); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/alumni-portal/home`); await expect(page.getByRole('heading', { name: 'WHO ARE YOU LOOKING FOR?' })).toBeVisible();
  await page.locator('#search-q').fill('someone working on energy storage');
  const battery = page.locator('.portal-card', { hasText: 'Battery QA' });
  await expect(battery).toBeVisible({ timeout: 15000 }); await expect(battery.locator('.portal-close-match')).toHaveText(/CLOSE MATCH/);
  await expect(page.locator('.portal-card')).toHaveCount(1);
  await page.locator('#search-q').fill('Stripe');
  await expect(page.locator('.portal-card', { hasText: 'Payments QA' }).locator('.portal-match')).toHaveText(/MATCHED STRIPE/);
  await expect(page.locator('.portal-card').first()).toContainText('Payments QA');
  await page.locator('#search-q').fill('baking sourdough bread'); await page.waitForTimeout(2500);
  await expect(page.locator('.portal-results-empty')).toContainText('Nobody matches');
  await page.screenshot({ path: 'test-results/portal/semantic.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: the page — a question shows the right person as a CLOSE MATCH; exact words still say MATCHED and come first; an unrelated question shows nobody');
} finally {
  if (browser) await browser.close();
  for (const u of users.reverse()) await u.cleanup();
  console.log(`Cleaned up ${users.length} temporary accounts.`);
}
