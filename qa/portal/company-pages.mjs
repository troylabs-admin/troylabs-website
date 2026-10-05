// Company pages (2026-10-05): the list counts approved members per company (LinkedIn jobs + a typed current company),
// searches by name, and a company's page lists who's there now and who was, each linking to their member page and
// back; people waiting for approval never appear; names from LinkedIn can't inject HTML; it fits a phone.
// Bryan's saved scrape stands in for LinkedIn (company ids prefixed tl-qa-, so real companies are never touched).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';

const admin = adminClient(); const serviceKey = admin.supabaseKey; const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321';
const FN = 'https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/linkedin-sync';
const bryan = JSON.parse(readFileSync(new URL('./fixtures/linkedin-bryanrg22.json', import.meta.url), 'utf8'));
const call = async (body) => { const r = await fetch(FN, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); };
const handle = () => `https://www.linkedin.com/in/tl-qa-${crypto.randomUUID().slice(0, 8)}`;
const users = []; const started = new Date().toISOString(); let browser;
const make = async (name, approved, extra = {}) => { const u = await makeUser(admin, name, approved); users.push(u); await admin.from('profiles').update({ current_title: null, current_company: null, ...extra }).eq('id', u.id); return u; };
const sync = async (u, link, scrape) => { await call({ mode: 'request', profile_id: u.id }); const w = await call({ mode: 'worker', fixture: { [link]: { ...scrape, originalQuery: { url: link } } } }); assert.equal(w.done, 1, JSON.stringify(w)); };
/** every image on the page loaded (they're lazy), so screenshots show what a person sees */
const images = async (pg) => { await pg.evaluate(async () => { for (const i of document.images) { i.loading = 'eager'; if (!i.complete) await new Promise((ok) => { i.onload = i.onerror = ok; setTimeout(ok, 8000); }); } }); };
/** gaps between stacked blocks, measured (Bryan: the subtitle sat on the search bar — never again by eye) */
const gaps = (pg) => pg.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(); return { subToSearch: r('#co-q').top - r('.portal-page-sub').bottom, searchToCount: r('.co-count').top - r('#co-q').bottom, countToGrid: r('.co-grid').top - r('.co-count').bottom }; });
const roomy = (g, min, where) => { for (const [k, v] of Object.entries(g)) assert.ok(v >= min, `${where}: ${k} is ${Math.round(v)}px (want ≥ ${min})`); };
const NV = 'tl-qa-3608', EVIL = `tl-qa-evil-${crypto.randomUUID().slice(0, 6)}`;

try {
  // A: Bryan's history (NVIDIA now). B: NVIDIA in the past, plus a company with a hostile name and no logo. C: typed NVIDIA. P: waiting.
  const LA = handle(), LB = handle();
  const a = await make('Ada Company QA', true, { linkedin_url: LA }); await sync(a, LA, bryan);
  const bScrape = { ...bryan, experience: [
    { position: 'Founder', companyName: '<img src=x onerror=alert(1)>Evil Co', companyId: EVIL, startDate: { month: 'Jan', year: 2026 }, endDate: { text: 'Present' } },
    { position: 'GPU Intern', companyName: 'NVIDIA', companyId: NV, companyLinkedinUrl: 'https://www.linkedin.com/company/nvidia/', startDate: { month: 'Jun', year: 2023 }, endDate: { month: 'Aug', year: 2023 } },
  ] };
  const b = await make('Ben Company QA', true, { linkedin_url: LB }); await sync(b, LB, bScrape);
  const c = await make('Cy Company QA', true, { current_title: 'Engineer', current_company: 'nvidia' });   // typed, any case
  const p = await make('Pia Pending QA', false, { current_title: 'Engineer', current_company: 'NVIDIA' });
  const viewer = await make('Vic Viewer QA', true);
  // real approved members who typed NVIDIA as their company count too (they're really there)
  const { data: realNv } = await admin.from('profiles').select('id, full_name').eq('approved', true).ilike('current_company', 'nvidia');
  const real = (realNv ?? []).filter((r) => !users.some((u) => u.id === r.id)); const R = real.length;
  browser = await chromium.launch(); const errors = []; const dialogs = [];
  const { page } = await signInPage(browser, viewer); page.on('pageerror', (e) => errors.push(e.message)); page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });

  // ── the list ──────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${base}/alumni-portal/companies`); await page.locator('[data-co-grid] li').first().waitFor();
  await expect(page.locator('nav a[aria-current="page"]', { hasText: 'COMPANIES' }).first()).toBeVisible();
  roomy(await gaps(page), 16, 'companies at 1440');
  const tile = page.locator(`a.co-tile[href$="id=${NV}"]`);
  await expect(tile).toContainText('NVIDIA'); await expect(tile).toContainText(`${3 + R} members · ${2 + R} there now`);   // A now, B before, C typed (+ real members who typed NVIDIA) — not P
  await expect(page.locator(`a.co-tile[href$="id=${EVIL}"]`)).toContainText('<img src=x onerror=alert(1)>Evil Co');
  assert.equal(await page.locator(`a.co-tile[href$="id=${EVIL}"] img`).count(), 0, 'a hostile company name is text, and no logo means initials');
  await page.locator('#co-q').fill('jane street');
  assert.ok(await page.locator('a.co-tile').count() >= 1); assert.ok((await page.locator('a.co-tile').allTextContents()).every((t) => /jane street/i.test(t)), 'search keeps only matching companies');
  await expect(page).toHaveURL(/q=jane\+street/);
  await page.locator('#co-q').fill('zzzz-no-such-co'); await expect(page.locator('[data-co-grid]')).toContainText('No company matches');
  await page.locator('#co-q').fill('');
  await images(page); await page.screenshot({ path: 'test-results/portal/companies.png', fullPage: true });
  console.log('PASS: the list — NVIDIA: our 3 test members (+ real ones who typed NVIDIA), 2 there now (LinkedIn + typed; nobody waiting for approval); search by name, kept in the URL; hostile names are text');

  // ── one company ───────────────────────────────────────────────────────────────────────────────
  await tile.click(); await expect(page).toHaveURL(new RegExp(`companies/\\?id=${NV}`)); await page.locator('[data-co-people] h2').first().waitFor();
  await expect(page.locator('[data-co-name]')).toHaveText('NVIDIA');
  await expect(page.locator('[data-co-meta]')).toHaveText(`${3 + R} members of TroyLabs have worked here · ${2 + R} there now`);
  await expect(page.locator('[data-co-linkedin]')).toHaveAttribute('href', 'https://www.linkedin.com/company/nvidia/');
  const now = page.locator('h2:has-text("There now") + ul .co-person'), before = page.locator('h2:has-text("Worked here before") + ul .co-person');
  assert.deepEqual((await now.locator('.portal-card-name').allTextContents()).sort(), ['Ada Company QA', 'Cy Company QA', ...real.map((r) => r.full_name)].sort());
  assert.deepEqual(await before.locator('.portal-card-name').allTextContents(), ['Ben Company QA']);
  await expect(before.first()).toContainText('GPU Intern · Jun 2023 – Aug 2023 · 3 mos');
  await expect(now.filter({ hasText: 'Ada' })).toContainText('Software Engineering Intern · May 2026 – Present');
  await expect(now.filter({ hasText: 'Cy' })).toContainText('Engineer');
  assert.equal(await page.locator('[data-co-people]').getByText('Pia Pending QA').count(), 0, 'nobody waiting for approval');
  await images(page); assert.equal(await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).length), 0, 'every photo and logo loads'); await page.screenshot({ path: 'test-results/portal/company-nvidia.png', fullPage: true });
  // to a member and back
  await now.filter({ hasText: 'Ada' }).click(); await expect(page).toHaveURL(new RegExp(`members/\\?id=${a.id}&from=company&co=${NV}`));
  await expect(page.locator('[data-back]')).toHaveText('← BACK TO COMPANY'); await page.locator('[data-back]').click();
  await expect(page).toHaveURL(new RegExp(`companies/\\?id=${NV}`)); await expect(page.locator('[data-co-name]')).toHaveText('NVIDIA');
  // and from a member page's timeline to the company
  await page.goto(`${base}/alumni-portal/members/?id=${a.id}`); await page.locator('.wh-rail').waitFor();
  await page.locator('.wh-co-link', { hasText: 'NVIDIA' }).first().click(); await expect(page.locator('[data-co-name]')).toHaveText('NVIDIA');
  await page.goto(`${base}/alumni-portal/companies/?id=tl-qa-nope`); await expect(page.locator('[data-co-empty]')).toHaveText('This company isn’t in the network.');
  await expect(page.locator('[data-co-one]')).toBeHidden();   // an unknown company shows no stale header
  console.log('PASS: a company — header, members count, LinkedIn page; there now (LinkedIn + typed) vs before, with roles and dates; member page and back; timeline links here; unknown id explained');

  // ── student clubs aren't companies ────────────────────────────────────────────────────────────
  await page.goto(`${base}/alumni-portal/companies`); await page.locator('[data-co-grid] li').first().waitFor();
  const names = await page.locator('a.co-tile .portal-card-name').allTextContents();
  for (const club of ['TroyLabs', 'LavaLab', 'Quant SC']) assert.ok(!names.includes(club), `${club} isn't listed as a company`);
  const boss = await make('Boss Club QA', true); await admin.from('admins').insert({ user_id: boss.id });
  const { page: bp } = await signInPage(browser, boss); bp.on('pageerror', (e) => errors.push(e.message));
  await bp.goto(`${base}/alumni-portal/companies/?id=${NV}`); await bp.locator('[data-co-club]').waitFor();
  await expect(bp.locator('[data-co-admin]')).toContainText('A student club, not a company?');
  assert.ok((await (await page.context().request.get(`${base}/alumni-portal/companies`)).text()).length > 0);
  const { data: viewerTry } = await viewer.sb.from('companies').update({ is_club: true }).eq('linkedin_id', NV).select('linkedin_id');
  assert.equal(viewerTry?.length ?? 0, 0, 'a member can\'t mark a club');
  await bp.locator('[data-co-club]').click(); await expect(bp.locator('[data-co-admin]')).toContainText('Hidden from Companies: marked as a student club.');
  await page.goto(`${base}/alumni-portal/companies`); await page.locator('[data-co-grid] li').first().waitFor();
  assert.equal(await page.locator(`a.co-tile[href$="id=${NV}"]`).count(), 0, 'marked as a club → off the list');
  await page.goto(`${base}/alumni-portal/companies/?id=${NV}`); await expect(page.locator('[data-co-empty]')).toHaveText('This company isn’t in the network.');
  await bp.locator('[data-co-club]').click(); await expect(bp.locator('[data-co-admin]')).toContainText('A student club, not a company?');
  await page.goto(`${base}/alumni-portal/companies`); await expect(page.locator(`a.co-tile[href$="id=${NV}"]`)).toHaveCount(1);
  console.log('PASS: clubs — TroyLabs, LavaLab and Quant SC aren\'t companies; an admin marks a club (off the list, page closed to members) and back; members can\'t');

  // ── removing a job removes them from the company (Bryan: "these are the connections I'm talking about") ───
  const nvPeople = async () => { await page.goto(`${base}/alumni-portal/companies/?id=${NV}`); await page.locator('[data-co-people] h2').first().waitFor(); return (await page.locator('.co-person .portal-card-name').allTextContents()).filter((n) => /QA$/.test(n)).sort(); };
  // Ada deletes NVIDIA from her LinkedIn and syncs
  await sync(a, LA, { ...bryan, experience: bryan.experience.filter((e) => e.companyName !== 'NVIDIA') });
  assert.deepEqual(await nvPeople(), ['Ben Company QA', 'Cy Company QA'], 'Ada left the NVIDIA page after removing it from LinkedIn');
  await page.goto(`${base}/alumni-portal/members/?id=${a.id}`); await page.locator('.wh-rail').waitFor();
  assert.equal(await page.locator('.wh-rail').getByText('NVIDIA').count(), 0, 'and from her own timeline');
  // Cy changes the company typed on his profile
  await admin.from('profiles').update({ current_company: 'Stripe' }).eq('id', c.id);
  assert.deepEqual(await nvPeople(), ['Ben Company QA'], 'Cy left NVIDIA after changing his typed company');
  // Ben drops the hostile-named company: nobody's left there, so it leaves the list
  await sync(b, LB, { ...bScrape, experience: bScrape.experience.filter((e) => e.companyId !== EVIL) });
  await page.goto(`${base}/alumni-portal/companies`); await page.locator('[data-co-grid] li').first().waitFor();
  assert.equal(await page.locator(`a.co-tile[href$="id=${EVIL}"]`).count(), 0, 'a company with nobody left drops off the list');
  await expect(page.locator(`a.co-tile[href$="id=${NV}"]`)).toContainText(`${1 + R} member`);
  console.log('PASS: removals — a job deleted on LinkedIn leaves the company page and the timeline; a changed typed company leaves too; a company with nobody left drops off the list');

  // ── the edge cases (every way someone's place on a company page can change) ──────────────────────
  const section = async () => { await page.goto(`${base}/alumni-portal/companies/?id=${NV}`); await page.locator('[data-co-name]').waitFor({ state: 'visible' });
    const pick = async (h) => (await page.locator(`h2:has-text("${h}") + ul .co-person .portal-card-name`).allTextContents()).filter((n) => /QA$/.test(n)).sort();
    return { now: await pick('There now'), before: await pick('Worked here before'), name: await page.locator('[data-co-name]').textContent() }; };
  const nvJob = { position: 'Software Engineering Intern', companyName: 'NVIDIA', companyId: NV, startDate: { month: 'May', year: 2026 }, endDate: { month: 'Aug', year: 2026 } };
  await sync(a, LA, { ...bryan, experience: [nvJob] });
  assert.deepEqual((await section()).before, ['Ada Company QA', 'Ben Company QA'], 'a job that ended moves to "Worked here before"');
  await admin.from('profiles').update({ current_title: 'Intern', current_company: 'NVIDIA', current_job_source: 'manual' }).eq('id', a.id);
  { const s1 = await section(); assert.deepEqual([s1.now, s1.before], [['Ada Company QA'], ['Ben Company QA']], 'typed "NVIDIA" + an ended LinkedIn job → one card, there now'); }
  await admin.from('profiles').update({ current_title: null, current_company: null, current_job_source: null }).eq('id', a.id);
  assert.deepEqual((await section()).before, ['Ada Company QA', 'Ben Company QA'], 'typed company cleared → back to before');
  await sync(b, LB, { ...bScrape, experience: bScrape.experience.filter((e) => e.companyId === NV).map((e) => ({ ...e, companyName: 'NVIDIA Corporation' })) });
  assert.equal((await section()).name, 'NVIDIA Corporation', 'a company renamed on LinkedIn is renamed here');
  await admin.from('profiles').update({ current_company: 'LavaLab' }).eq('id', c.id);
  await page.goto(`${base}/alumni-portal/companies`); await page.locator('[data-co-grid] li').first().waitFor();
  assert.ok(!(await page.locator('a.co-tile .portal-card-name').allTextContents()).includes('LavaLab'), 'a typed club doesn\'t become a company');
  await admin.from('profiles').update({ approved: false, declined_at: new Date().toISOString() }).eq('id', b.id);
  assert.deepEqual((await section()).before, ['Ada Company QA'], 'a declined member leaves');
  await admin.from('profiles').update({ approved: true, declined_at: null }).eq('id', b.id);
  assert.deepEqual((await section()).before, ['Ada Company QA', 'Ben Company QA'], 'restored → back');
  await admin.from('profiles').update({ linkedin_url: null }).eq('id', b.id);
  assert.deepEqual((await section()).before, ['Ada Company QA'], 'removing their LinkedIn link removes what it brought in');
  await a.cleanup(); users.splice(users.indexOf(a), 1);
  await page.goto(`${base}/alumni-portal/companies/?id=${NV}`);
  await expect(page.locator('[data-co-meta]')).toHaveText('No approved members list this company yet.');   // Ada deleted; Ben unlinked; Cy at LavaLab (and real "NVIDIA" typists no longer match "NVIDIA Corporation")
  console.log('PASS: edge cases — ended job → before; typed + LinkedIn → one card; typed cleared; renamed on LinkedIn; a typed club; declined leaves, restored returns; LinkedIn link removed; account deleted');

  // ── phone, gate, errors ───────────────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['companies', `companies/?id=${NV}`]) {
    await page.goto(`${base}/alumni-portal/${path}`); await page.locator(path.includes('id=') ? '[data-co-name]' : '[data-co-grid] li').first().waitFor({ state: 'visible' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no sideways scroll: ${path}`);
    if (!path.includes('id=')) roomy(await gaps(page), 10, 'companies at 390');
    await page.screenshot({ path: `test-results/portal/${path.includes('id=') ? 'company-nvidia' : 'companies'}-390.png`, fullPage: true });
  }
  const { page: pp } = await signInPage(browser, p); await pp.goto(`${base}/alumni-portal/companies`);
  await expect(pp).toHaveURL(/alumni-portal\/(home|profile)/, { timeout: 10000 });
  assert.deepEqual(errors, []); assert.deepEqual(dialogs, []);
  console.log('PASS: phone fits; someone waiting for approval can\'t open Companies; no page errors, no injected scripts');
} finally {
  if (browser) await browser.close();
  await admin.from('linkedin_sync_queue').delete().in('profile_id', users.map((u) => u.id));
  for (const u of users) await u.cleanup().catch(() => {});
  await admin.from('linkedin_scrapes').delete().gte('at', started);
  { const { data: cos } = await admin.from('companies').select('linkedin_id, logo_path').like('linkedin_id', 'tl-qa-%'); const files = (cos ?? []).map((x) => x.logo_path).filter(Boolean); if (files.length) await admin.storage.from('company-logos').remove(files); await admin.from('companies').delete().like('linkedin_id', 'tl-qa-%'); }
  console.log(`Cleaned up ${users.length} temporary accounts and the test companies.`);
}
