// The LinkedIn pages (2026-10-05): a member page draws design B (timeline, same-company roles grouped, logos from our
// storage) and the other sections (honors, publications, certifications, organizations, schools other than USC); the
// profile's LinkedIn panel shows each state (waiting for approval, no link, importing, imported, failed) and SYNC NOW
// works end to end; links are checked and stored in one form; text from LinkedIn can't inject HTML.
// Bryan's saved scrape stands in for LinkedIn (qa/portal/fixtures). Temporary example.com accounts only; all removed.
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
const make = async (name, approved, link) => { const u = await makeUser(admin, name, approved); users.push(u); await admin.from('profiles').update({ linkedin_url: link ?? null, bio: null }).eq('id', u.id); return u; };
const syncAs = async (u, link, scrape) => { await call({ mode: 'request', profile_id: u.id }); const w = await call({ mode: 'worker', fixture: { [link]: { ...scrape, originalQuery: { url: link } } } }); assert.equal(w.done, 1, JSON.stringify(w)); };

try {
  const L1 = handle(), L2 = handle();
  const mem = await make('History Member QA', true, L1); await syncAs(mem, L1, bryan);
  const stanford = { ...bryan, education: [...bryan.education, { schoolName: 'Stanford University', degree: 'MBA', schoolId: '1792' }, { schoolName: 'Saratoga High School', startDate: { year: 2019 }, endDate: { year: 2023 } }], honorsAndAwards: [{ title: '<img src=x onerror=alert(1)>Hacked', issuedBy: '<b>bold</b>', issuedAt: 'Jan 2025' }] };
  const alum = await make('History Alum QA', true, L2); await syncAs(alum, L2, stanford);
  const viewer = await make('History Viewer QA', true);
  browser = await chromium.launch(); const errors = []; const dialogs = [];

  // ── a member page ─────────────────────────────────────────────────────────────────────────────
  const { page } = await signInPage(browser, viewer); page.on('pageerror', (e) => errors.push(e.message)); page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await page.goto(`${base}/alumni-portal/members/?id=${mem.id}`); await page.locator('.wh-rail').waitFor();
  assert.equal(await page.locator('.wh-group').count(), 12, '14 jobs less TroyLabs (everyone here was in it) = 13, the two USC ISI roles under one logo');
  assert.equal(await page.locator('.wh-role').count(), 13);
  assert.equal(await page.locator('.wh-rail').getByText('TroyLabs', { exact: true }).count(), 0, 'TroyLabs isn\'t listed as experience');
  const lava = page.locator('.wh-group', { hasText: 'LavaLab' }); await expect(lava).toHaveCount(1); assert.equal(await lava.locator('.wh-co-link').count(), 0, 'a student club shows, but has no company page to link to');
  await expect(page.locator('.wh-group').first()).toContainText('Software Engineering Intern'); await expect(page.locator('.wh-group').first().locator('.wh-now')).toHaveText('NOW');
  const isi = page.locator('.wh-group', { hasText: 'USC Information Sciences Institute' });
  await expect(isi.locator('.wh-title').first()).toContainText(/USC Information Sciences Institute · \d+ yrs? ?\d* ?mos?/); assert.equal(await isi.locator('.wh-role.is-sub').count(), 2);
  await expect(isi.locator('.wh-bullets li').first()).toContainText('First open research platform');
  await page.waitForFunction(() => { const shown = [...document.querySelectorAll('.wh-logo img')].filter((i) => i.offsetParent !== null); return shown.length >= 5 && shown.every((i) => i.complete && i.naturalWidth > 0); }, null, { timeout: 15000 });   // the five companies shown (the rest wait behind SHOW ALL) have their logos
  assert.ok(await page.locator('.wh-logo img').first().evaluate((i) => i.src.includes('/storage/v1/object/public/company-logos/')), 'logos come from our storage');
  for (const [h, n] of [['Honors & awards', 7], ['Publications', 1], ['Certifications', 1], ['Organizations', 3]]) assert.equal(await page.locator(`h2:has-text("${h}") + .wh-collapse .wh-item`).count(), n, h);
  const pub = page.locator('h2:has-text("Publications") + .wh-collapse a'); await expect(pub).toHaveAttribute('href', 'https://arxiv.org/abs/2505.02250'); await expect(pub).toHaveAttribute('target', '_blank'); await expect(pub).toHaveAttribute('rel', /noopener/);
  assert.equal(await page.locator('h2:has-text("Other schools")').count(), 0, 'USC alone → no schools section');
  await expect(page.locator('[data-m-bio]')).toContainText('curl -I www.bryanram.com', { timeout: 5000 });   // no bio typed → their LinkedIn About
  const order = await page.locator('[data-member-body] h2').allTextContents();
  assert.deepEqual(order.slice(0, 2), ['About', 'Experience'], `About, then Experience (${order})`);
  await page.screenshot({ path: 'test-results/portal/linkedin-member.png', fullPage: true });
  // LinkedIn-style trimming: five companies, two bullets, three of each section
  const visible = (sel) => page.locator(sel).evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length);
  assert.equal(await visible('.wh-group'), 5, 'five companies at first');
  const more = page.locator('.wh-collapse:has(.wh-rail) > [data-wh-all]'); await expect(more).toHaveText('SHOW ALL 13 EXPERIENCES ↓');
  await more.click(); assert.equal(await visible('.wh-group'), 12); await expect(more).toHaveText('SHOW FEWER ↑');
  await more.click(); assert.equal(await visible('.wh-group'), 5, 'and back to five');
  const edtok = page.locator('.wh-role', { hasText: 'EDTok' }); await more.click();
  assert.equal(await edtok.locator('.wh-bullets li').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length), 2, 'two bullets at first');
  await edtok.locator('[data-wh-lines]').click(); assert.equal(await edtok.locator('.wh-bullets li').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length), 3); await expect(edtok.locator('[data-wh-lines]')).toHaveText('see less');
  const honors = page.locator('h2:has-text("Honors & awards") + .wh-collapse');
  assert.equal(await honors.locator('.wh-item').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length), 3, 'three honors at first');
  await expect(honors.locator('[data-wh-all]')).toHaveText('SHOW ALL 7 HONORS AND AWARDS ↓'); await honors.locator('[data-wh-all]').click();
  assert.equal(await honors.locator('.wh-item').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length), 7);
  assert.equal(await page.locator('h2:has-text("Publications") + .wh-collapse [data-wh-all]').count(), 0, 'one publication: no button');
  await expect(page.locator('.wh-co-link', { hasText: 'NVIDIA' }).first()).toHaveAttribute('href', '/alumni-portal/companies/?id=tl-qa-3608');
  console.log('PASS: member page — 12 timeline groups / 13 roles (no TroyLabs; LavaLab unlinked as a club), USC ISI grouped, NOW, bullets, our logos, 7 honors / 1 publication (opens safely) / 1 certification / 3 organizations, no USC school, LinkedIn About as the bio');

  await page.goto(`${base}/alumni-portal/members/?id=${alum.id}`); await page.locator('.wh-rail').waitFor();
  await expect(page.locator('h2:has-text("Other schools") + .wh-collapse')).toContainText('Stanford University'); await expect(page.locator('h2:has-text("Other schools") + .wh-collapse')).not.toContainText('Southern California'); await expect(page.locator('h2:has-text("Other schools") + .wh-collapse')).not.toContainText('High School');
  const honor = page.locator('h2:has-text("Honors & awards") + .wh-collapse .wh-item').first();
  await expect(honor).toContainText('<img src=x onerror=alert(1)>Hacked'); await expect(honor).toContainText('<b>bold</b>');
  assert.equal(await honor.locator('img, b').count(), 0, 'LinkedIn text is shown as text, never as HTML');
  console.log('PASS: other schools — Stanford shown, USC not; LinkedIn text can\'t inject HTML');

  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/alumni-portal/members/?id=${mem.id}`); await page.locator('.wh-rail').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll at 390');
  const col = await page.locator('.portal-col').evaluate((c) => c.getBoundingClientRect().right);
  assert.equal(await page.locator('.wh-rail *').evaluateAll((els, right) => els.filter((e) => e.getBoundingClientRect().right > right + 1).length, col), 0, 'nothing pokes out of the column on a phone');
  await page.screenshot({ path: 'test-results/portal/linkedin-member-390.png', fullPage: true });
  console.log('PASS: phone — the timeline fits at 390');

  // ── the profile's LinkedIn panel ─────────────────────────────────────────────────────────────
  const panel = async (u) => { const { page: p } = await signInPage(browser, u); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(`${base}/alumni-portal/profile`); await p.locator('.portal-profile:not([inert])').waitFor(); await expect(p.locator('[data-li-status]')).not.toHaveText('Loading…'); return p; };
  const pm = await panel(mem);
  await expect(pm.locator('[data-li-status]')).toContainText('Imported from LinkedIn on');
  await expect(pm.locator('[data-li-sync]')).toBeDisabled(); await expect(pm.locator('[data-li-fb]')).toHaveText('You can sync again tomorrow.');
  assert.equal(await pm.locator('[data-li-preview] .wh-group').count(), 12, 'their history as members see it');
  await pm.locator('#pf-linkedin').screenshot({ path: 'test-results/portal/linkedin-panel.png' });

  const pending = await make('History Pending QA', false, handle());
  await expect((await panel(pending)).locator('[data-li-status]')).toHaveText('Your LinkedIn imports when leadership approves you.');
  const failed = await make('History Failed QA', true, handle()); await admin.from('linkedin_sync_queue').delete().eq('profile_id', failed.id); await admin.from('profiles').update({ linkedin_sync_error: 'LinkedIn didn’t return this profile. Is it public?' }).eq('id', failed.id);   // (adding the link queued it; this one already tried and failed)
  const pf = await panel(failed); await expect(pf.locator('[data-li-status]')).toContainText('The last import didn’t work: LinkedIn didn’t return this profile'); await expect(pf.locator('[data-li-sync]')).toBeEnabled();

  const fresh = await make('History Fresh QA', true);
  const p3 = await panel(fresh);
  await expect(p3.locator('[data-li-status]')).toHaveText('Add your LinkedIn link above and press SAVE, then sync.'); await expect(p3.locator('[data-li-sync]')).toBeHidden();
  await p3.locator('#pf-li').fill('https://www.linkedin.com/company/nvidia'); await p3.locator('.portal-save [data-action="save"]').click();
  await expect(p3.locator('.portal-save .portal-feedback')).toContainText('That isn’t a LinkedIn profile link'); await expect(p3.locator('#pf-li')).toHaveClass(/portal-needs/);
  const L3 = handle();
  await p3.locator('#pf-li').fill(`${L3.replace('https://www.', '').toUpperCase().replace('LINKEDIN.COM/IN/', 'linkedin.com/in/')}/?utm_source=share`); await p3.locator('.portal-save [data-action="save"]').click();
  await expect(p3.locator('.portal-save .portal-feedback')).toContainText('Saved');
  assert.equal((await admin.from('profiles').select('linkedin_url').eq('id', fresh.id).single()).data.linkedin_url, L3, 'any spelling is stored in one form');
  // adding a link imports it on its own (after a 2-minute pause so quick edits become one import): no SYNC NOW needed
  await expect(p3.locator('[data-li-status]')).toHaveText('Importing from LinkedIn… this takes a minute or two.'); await expect(p3.locator('[data-li-sync]')).toBeHidden();
  assert.ok(Date.parse((await admin.from('linkedin_sync_queue').select('next_try_at').eq('profile_id', fresh.id).single()).data.next_try_at) > Date.now() + 60_000);
  await admin.from('linkedin_sync_queue').update({ next_try_at: new Date().toISOString() }).eq('profile_id', fresh.id);   // skip the pause
  assert.equal((await call({ mode: 'worker', fixture: { [L3]: { ...bryan, originalQuery: { url: L3 } } } })).done, 1);
  await expect(p3.locator('[data-li-status]')).toContainText('Imported from LinkedIn on', { timeout: 20000 });
  assert.equal(await p3.locator('[data-li-preview] .wh-group').count(), 12, 'the history appears without reloading');
  console.log('PASS: profile panel — imported (sync again tomorrow), waiting for approval, a failed import with SYNC NOW, no link → bad link refused → saved in one form → imports on its own → imported');

  // ── the current job is LinkedIn's (the profile has no job boxes) ───────────────────────────────────
  const job = async (u) => (await admin.from('profiles').select('current_title, current_company, current_job_source').eq('id', u.id).single()).data;
  const typed = await make('Job Typed QA', true, handle());   // makeUser typed Founder at Luma Health (as before this change)
  const Lt = (await admin.from('profiles').select('linkedin_url').eq('id', typed.id).single()).data.linkedin_url;
  await call({ mode: 'request', profile_id: typed.id }); await call({ mode: 'worker', fixture: { [Lt]: { ...bryan, originalQuery: { url: Lt } } } });
  assert.deepEqual(await job(typed), { current_title: 'Software Engineering Intern', current_company: 'NVIDIA', current_job_source: 'linkedin' }, 'an old typed job is replaced by LinkedIn\'s current one');
  await call({ mode: 'request', profile_id: typed.id }); await call({ mode: 'worker', fixture: { [Lt]: { ...bryan, experience: bryan.experience.filter((e) => e.endDate?.year || /troy\s?labs/i.test(e.companyName)), originalQuery: { url: Lt } } } });
  assert.deepEqual(await job(typed), { current_title: null, current_company: null, current_job_source: 'linkedin' }, 'no current job on LinkedIn (TroyLabs doesn\'t count) → cleared');
  const pj = await panel(typed);
  assert.equal(await pj.locator('#pf-title, #pf-co, [data-li-job]').count(), 0, 'the profile has no job boxes and no "LinkedIn says" hint');
  console.log('PASS: current job — always LinkedIn\'s current one (an old typed job replaced; none → cleared; TroyLabs never); no job boxes on the profile');

  // ── applying: a personal email is required (USC addresses expire) ──────────────────────────────
  const uscApplicant = await make('Usc Applicant QA', false); await admin.from('profiles').update({ personal_email: null, usc_email: `tl-qa-${crypto.randomUUID().slice(0, 6)}@usc.edu` }).eq('id', uscApplicant.id);
  const pu = await panel(uscApplicant);
  await expect(pu.locator('[data-onboard-missing]')).toContainText('a personal email (not your USC one)');
  console.log('PASS: applying — without a personal email, "a personal email (not your USC one)" is still needed');

  assert.deepEqual(errors, []); assert.deepEqual(dialogs, [], 'no script ran from LinkedIn text');
  console.log('PASS: no page errors, no injected scripts');
} finally {
  if (browser) await browser.close();
  await admin.from('linkedin_sync_queue').delete().in('profile_id', users.map((u) => u.id));
  for (const u of users) await u.cleanup().catch(() => {});
  await admin.from('linkedin_scrapes').delete().gte('at', started);
  { const { data: cos } = await admin.from('companies').select('linkedin_id, logo_path').like('linkedin_id', 'tl-qa-%'); const files = (cos ?? []).map((c) => c.logo_path).filter(Boolean); if (files.length) await admin.storage.from('company-logos').remove(files); await admin.from('companies').delete().like('linkedin_id', 'tl-qa-%'); }   // test companies and their logos
  console.log(`Cleaned up ${users.length} temporary accounts.`);
}
