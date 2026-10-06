// Local fixtures only: no account creation, messages, scraping or database writes.
// Regression coverage for overlapping nav, company CTA spacing and unreadable tablet controls.
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const root = process.env.PORTAL_URL || 'http://localhost:4321';
const out = 'test-results/responsive-ui'; mkdirSync(out, { recursive: true });
const id = '00000000-0000-4000-8000-000000000001';
const profile = { id, full_name: 'Alexandria Montgomery-Worthington', approved: true, status: 'alum', divisions: ['TECH'], bio: 'A readable biography that can use the available width on a phone.', grad_year: 2024, join_year: 2022, join_term: 'FA', city_id: 1, city: { name: 'Los Angeles', region: 'CA', lat: 34, lng: -118 } };
const company = { linkedin_id: 'fixture', name: 'Universal Pictures', logo_path: 'fixture.svg', linkedin_url: 'https://www.linkedin.com/company/universal-pictures', is_club: false };
const session = { access_token: 'local-visual-fixture', refresh_token: 'local-visual-fixture', expires_at: 4102444800, user: { id, email: 'fixture@example.com' } };
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ reducedMotion: 'reduce', hasTouch: true });
  await context.addInitScript(s => localStorage.setItem('sb-ackmhqxyxnceoarbhcrp-auth-token', JSON.stringify(s)), session);
  let brokenLogo = false;
  await context.route('https://ackmhqxyxnceoarbhcrp.supabase.co/**', async route => {
    const u = new URL(route.request().url()); let data = [];
    if (u.pathname.includes('/company-logos/')) return brokenLogo ? route.abort() : route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="white"/><text x="10" y="28" font-size="20">LOGO</text></svg>' });
    if (u.pathname.endsWith('/profiles')) data = u.searchParams.has('current_company') ? [] : [profile];
    if (u.pathname.endsWith('/admins')) data = [{ user_id: id }];
    if (u.pathname.endsWith('/companies')) data = u.searchParams.has('is_club') ? [] : [company];
    if (u.pathname.endsWith('/company_directory')) data = [{ ...company, people: 1, current_people: 0 }];
    if (u.pathname.endsWith('/work_experiences')) data = [{ title: 'Digital Intern', company: company.name, company_linkedin_id: 'fixture', company_logo: 'fixture.svg', start_year: 2025, start_month: 6, end_year: 2025, end_month: 8, sort: 0, profile }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const p = await context.newPage(), errors = []; p.on('pageerror', e => errors.push(e.message));
  const settled = () => p.waitForFunction(() => !document.documentElement.hasAttribute('data-astro-transition'));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    await p.goto(`${root}/alumni-portal/companies/?id=fixture`);
    await expect(p.locator('[data-co-name]')).toHaveText(company.name);
    await expect(p.locator('[data-co-logo] img')).toBeVisible();
    const measurements = await p.evaluate(() => {
      const box = q => document.querySelector(q).getBoundingClientRect();
      const nav = [...document.querySelectorAll('header a')].filter(e => e.getBoundingClientRect().width && getComputedStyle(e).visibility !== 'hidden');
      const boxes = nav.map(e => e.getBoundingClientRect());
      return {
        overlap: boxes.some((a, i) => boxes.slice(i + 1).some(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)),
        overflow: document.documentElement.scrollWidth - innerWidth,
        gap: box('[data-co-linkedin]').top - box('[data-co-meta]').bottom,
        buttonHeight: box('[data-co-linkedin]').height,
        metaFont: parseFloat(getComputedStyle(document.querySelector('.co-role')).fontSize),
        logoFit: getComputedStyle(document.querySelector('[data-co-logo] img')).objectFit,
      };
    });
    expect(measurements.overlap, `nav at ${width}`).toBe(false);
    expect(measurements.overflow).toBe(0);
    expect(measurements.gap).toBeGreaterThanOrEqual(12);
    expect(measurements.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(measurements.metaFont).toBeGreaterThanOrEqual(11.9);
    expect(measurements.logoFit).toBe('contain');
    await p.locator('.co-person').tap();
    await expect(p.locator('[data-m-name]')).toHaveText(profile.full_name);
    await settled();
    if (width < 768) {
      const bio = await p.locator('.portal-member-bio').boundingBox();
      expect(bio.width).toBeGreaterThanOrEqual(width - 50);
    }
    await p.locator('[data-back]').click(); await expect(p.locator('[data-co-name]')).toHaveText(company.name); await settled();
    await p.locator('[data-co-back]').click(); await p.locator('#co-q').fill('does-not-exist'); await settled();
    await expect(p.locator('[data-co-grid]')).toContainText('No company matches');
    await p.locator('#co-q').fill('Universal'); await p.locator('.co-tile').click();
    await expect(p.locator('[data-co-name]')).toHaveText(company.name); await settled();
    await p.screenshot({ path: `${out}/company-${width}.png`, fullPage: true });
    console.log(`PASS ${width}: nav separated, CTA spaced and reachable, readable metadata, logo contained, member and back, company search`);
  }
  brokenLogo = true; await p.reload();
  await expect(p.locator('[data-co-logo] img')).toHaveCount(0);
  await expect(p.locator('[data-co-logo] b')).toHaveText('UP');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${root}/alumni-portal/home`);
  const globe = p.locator('.portal-globe-wrap');
  await expect(globe).toHaveAttribute('data-ready', 'true');
  await globe.scrollIntoViewIfNeeded();
  await p.locator('.tl-star').tap();
  await expect(p.locator('.portal-globe-pop')).toContainText(profile.full_name);
  await p.locator('.portal-globe-x').tap();
  // Real touch events exercise OrbitControls and native page scrolling, not mouse emulation.
  const cdp = await context.newCDPSession(p);
  const swipe = async (x, y, dx, dy) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 12, y: y + dy * i / 12 }] });
      await p.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await p.waitForTimeout(1300);
  await globe.scrollIntoViewIfNeeded();
  const box = await globe.boundingBox(), before = await globe.getAttribute('data-view');
  await swipe(box.x + box.width * .35, box.y + box.height * .65, box.width * .3, 0);
  await expect(globe).not.toHaveAttribute('data-view', before);
  const scroll = await p.evaluate(() => scrollY);
  await swipe(8, 700, 0, -300);
  await expect.poll(() => p.evaluate(() => scrollY)).toBeGreaterThan(scroll);
  const down = await p.evaluate(() => scrollY);
  await swipe(8, 250, 0, 300);
  await expect.poll(() => p.evaluate(() => scrollY)).toBeLessThan(down);
  console.log('PASS mobile touch: marker tap, close, globe rotation, page swipe down and up');
  expect(errors).toEqual([]);
  console.log('PASS broken logo falls back to initials; no JavaScript errors');
} finally { await browser.close(); }
