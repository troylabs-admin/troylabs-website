import { chromium, devices } from '@playwright/test';
const BASE = 'https://troylabs-mobile-v2.vercel.app';
const pages = ['/', '/build', '/demo', '/ignite', '/apply'];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const out = [];
for (const p of pages) {
  await page.goto(BASE + p, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(600);
  // enumerate nav links in mobile tree
  const links = await page.evaluate(() => {
    const seen = [];
    document.querySelectorAll('a').forEach(a => {
      const r = a.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const cs = getComputedStyle(a);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;
      if (r.top > window.innerHeight || r.bottom < 0) return;
      seen.push({ text: (a.innerText||a.textContent||'').trim().slice(0,30), href: a.getAttribute('href'), x: r.x+r.width/2, y: r.y+r.height/2, w: Math.round(r.width), h: Math.round(r.height), cls: a.className });
    });
    return seen;
  });
  out.push({ page: p, visibleTopLinks: links });
  // try tapping each nav target by href
  for (const target of ['/', '/build', '/ignite', '/demo', '/apply']) {
    await page.goto(BASE + p, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(500);
    const hit = await page.evaluate((t) => {
      const as = [...document.querySelectorAll('a')].filter(a => {
        const h = a.getAttribute('href');
        return h === t || h === t.replace(/\/$/,'') || (t==='/' && (h==='/'||h==='./'||h===''));
      });
      for (const a of as) {
        const r = a.getBoundingClientRect();
        if (r.width>0 && r.height>0 && r.top < window.innerHeight && r.bottom > 0) {
          const cx = r.x+r.width/2, cy = r.y+r.height/2;
          const el = document.elementFromPoint(cx, cy);
          return { found: true, x: cx, y: cy, w: r.width, h: r.height, topEl: el ? el.tagName+'.'+String(el.className).slice(0,50) : null, topIsLinkOrChild: el ? (el===a || a.contains(el)) : false, txt: (a.innerText||'').trim() };
        }
      }
      return { found: as.length>0 ? 'offscreen' : false, count: as.length };
    }, target);
    if (hit.found === true) {
      let err = null;
      try { await page.tap(`a[href="${target}"]`, { timeout: 4000 }); }
      catch(e) { err = String(e).split('\n')[0]; }
      await page.waitForTimeout(2500);
      const url = new URL(page.url()).pathname;
      out.push({ from: p, tapTarget: target, hit, resultUrl: url, changed: url.replace(/\/$/,'') === target.replace(/\/$/,''), tapErr: err });
    } else {
      out.push({ from: p, tapTarget: target, hit, note: 'not tappable in initial viewport' });
    }
  }
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
