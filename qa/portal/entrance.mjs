// Page entrance (2026-10-05, Bryan: "everything else is animating in except THE NETWORK, FIND A CITY, BRYAN R., the
// logo"). Measured per frame with motion on, like a real visitor: nothing may pop in (every element fades over
// ≥ 100 ms), and the header comes in before the page content. Four portal pages, desktop and phone.
// Causes found: the logo's animation matched it by its label (renamed on portal pages); the name was never animated and
// its own transition was overridden; the header waited for the marketing hero (content at 0.45 s, links at 1.05 s).
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { adminClient, makeUser } from './helpers.mjs';

const admin = adminClient(); const base = process.env.PORTAL_URL || 'http://127.0.0.1:4321'; let b; const u = await makeUser(admin, 'Entrance QA');
const SIZES = { desktop: { width: 1440, height: 1000, header: { logo: 'header.section .nav-mark', links: 'header.section nav a', name: 'header.section .nav-who', signout: 'header.section .apply' } },
                phone: { width: 390, height: 844, header: { logo: 'header.m-nav .nav-mark', links: 'header.m-nav nav a', signout: 'header.m-nav .m-apply' } } };
const CONTENT = { '/alumni-portal/home': '.portal-head', '/alumni-portal/profile': '.portal-page-title', '/alumni-portal/companies': '.portal-page-title', [`/alumni-portal/members/?id=${u.id}`]: '.portal-member-head' };
try {
  b = await chromium.launch();
  for (const [size, cfg] of Object.entries(SIZES)) for (const [path, content] of Object.entries(CONTENT)) {
    const ctx = await b.newContext({ viewport: { width: cfg.width, height: cfg.height } });
    await ctx.addInitScript(({ key, session }) => { localStorage.setItem(key, JSON.stringify(session)); }, { key: 'sb-ackmhqxyxnceoarbhcrp-auth-token', session: u.session });
    await ctx.addInitScript((SEL) => {
      const T = {}; window.__anim = T; const t0 = performance.now();
      const vis = (el) => { let o = 1, n = el; while (n && n !== document.documentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none') return 0; o *= Number(cs.opacity); n = n.parentElement; } return o; };
      const tick = () => { const t = performance.now() - t0; for (const [k, s] of Object.entries(SEL)) { const el = document.querySelector(s); if (!el) continue; const o = vis(el); T[k] ??= { first: null, full: null }; if (o > 0.05 && T[k].first === null) T[k].first = t; if (o >= 0.95 && T[k].full === null) T[k].full = t; } if (t < 3500) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { ...cfg.header, content });
    const page = await ctx.newPage(); await page.goto(`${base}${path}`); await page.waitForTimeout(3700);
    const T = await page.evaluate(() => window.__anim);
    console.log(size, path, JSON.stringify(Object.fromEntries(Object.entries(T).map(([k, v]) => [k, [Math.round(v.first), Math.round(v.full)]]))));
    for (const [k, v] of Object.entries(T)) { assert.ok(v.full !== null, `${size} ${path}: ${k} never showed`); assert.ok(v.full - v.first >= 100, `${size} ${path}: ${k} pops in (${Math.round(v.first)} → ${Math.round(v.full)} ms)`); }
    assert.ok(T.logo && T.content, `${size} ${path}: the logo or the content never rendered (${JSON.stringify(T)})`);
    assert.ok(T.logo.first < T.content.first, `${size} ${path}: the header comes in first (logo ${Math.round(T.logo.first)} ms, content ${Math.round(T.content.first)} ms)`);
    await ctx.close();
  }
  console.log('PASS: entrance — home, profile, companies, a member page at 1440 and 390: nothing pops in; the header comes first');
} finally { await b?.close(); await u.cleanup(); }
