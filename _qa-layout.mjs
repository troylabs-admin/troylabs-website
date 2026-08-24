import { chromium, devices } from '@playwright/test';
const BASE = 'https://troylabs-mobile-v2.vercel.app';
const PAGES = ['/', '/build', '/demo', '/ignite', '/apply'];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const report = {};
for (const p of PAGES) {
  await page.goto(BASE + p, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(1200);
  // scroll whole page to trigger reveals so everything is visible/settled
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 500) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(90); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const res = await page.evaluate(() => {
    const IW = window.innerWidth;
    const inM = el => !!el.closest('.m');
    const isVisible = el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const opacityChain = el => { let o = 1, n = el; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity || '1'); n = n.parentElement; } return o; };
    const docRect = el => { const r = el.getBoundingClientRect(); return { l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY, w: r.width, h: r.height }; };
    // ---- text leaves inside .m
    const textEls = [];
    document.querySelectorAll('.m *').forEach(el => {
      if (!isVisible(el)) return;
      if (['SCRIPT','STYLE','SVG','PATH','CANVAS','IMG','VIDEO'].includes(el.tagName)) return;
      if (el.closest('svg')) return;
      // direct text content only
      let txt = '';
      for (const n of el.childNodes) if (n.nodeType === 3) txt += n.textContent;
      txt = txt.replace(/\s+/g,' ').trim();
      if (!txt) return;
      if (opacityChain(el) < 0.05) return;
      textEls.push({ el, txt, r: docRect(el), tag: el.tagName, cls: String(el.className).slice(0,60) });
    });
    const ov = (a,b) => { const x = Math.min(a.r,b.r) - Math.max(a.l,b.l); const y = Math.min(a.b,b.b) - Math.max(a.t,b.t); return { x, y }; };
    const textOverlaps = [];
    for (let i=0;i<textEls.length;i++) for (let j=i+1;j<textEls.length;j++) {
      const A = textEls[i], B = textEls[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const o = ov(A.r, B.r);
      if (o.x > 4 && o.y > 4) textOverlaps.push({ a: A.txt.slice(0,45), aTag:A.tag+'.'+A.cls, b: B.txt.slice(0,45), bTag:B.tag+'.'+B.cls, ox: Math.round(o.x), oy: Math.round(o.y) });
    }
    // ---- text over img/.planet
    const arts = [];
    document.querySelectorAll('.m img, .m .planet, .m canvas, .m video').forEach(el => { if (isVisible(el) && opacityChain(el) > 0.05) arts.push({ el, r: docRect(el), tag: el.tagName, cls: String(el.className).slice(0,50) }); });
    const textArt = [];
    for (const T of textEls) for (const A of arts) {
      if (A.el.contains(T.el) || T.el.contains(A.el)) continue;
      const o = ov(T.r, A.r);
      if (o.x > 4 && o.y > 4) textArt.push({ txt: T.txt.slice(0,45), art: A.tag+'.'+A.cls, ox: Math.round(o.x), oy: Math.round(o.y), artW: Math.round(A.r.w), artH: Math.round(A.r.h) });
    }
    // ---- overflow
    const overflowers = [];
    document.querySelectorAll('body *').forEach(el => {
      if (!isVisible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.right > IW + 2 && r.width < 4000) {
        const cs = getComputedStyle(el);
        overflowers.push({ tag: el.tagName, cls: String(el.className).slice(0,60), right: Math.round(r.right), w: Math.round(r.width), left: Math.round(r.left), inM: !!el.closest('.m'), pos: cs.position, txt: (el.innerText||'').replace(/\s+/g,' ').trim().slice(0,30) });
      }
    });
    // ---- clipped text
    const clipped = [];
    document.querySelectorAll('.m *').forEach(el => {
      if (!isVisible(el)) return;
      const cs = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 2 && cs.overflowY !== 'visible' && el.clientHeight > 0) {
        clipped.push({ tag: el.tagName, cls: String(el.className).slice(0,60), sh: el.scrollHeight, ch: el.clientHeight, overflow: cs.overflowY, txt: (el.innerText||'').replace(/\s+/g,' ').trim().slice(0,40) });
      }
    });
    // ---- heading line counts
    const headings = [];
    document.querySelectorAll('.m h1, .m h2, .m h3, .m .t-hero, .m .t-title, .m [class*="t-h"]').forEach(el => {
      if (!isVisible(el)) return;
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize)*1.2;
      const lines = Math.round(el.getBoundingClientRect().height / lh);
      headings.push({ tag: el.tagName, cls: String(el.className).slice(0,40), txt: (el.innerText||'').replace(/\s+/g,' ').trim().slice(0,50), lines, fs: cs.fontSize, lh: cs.lineHeight, h: Math.round(el.getBoundingClientRect().height) });
    });
    // ---- tap targets
    const taps = [];
    document.querySelectorAll('.m a, .m button').forEach(el => {
      if (!isVisible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 30 || r.height < 30) taps.push({ tag: el.tagName, txt: (el.innerText||el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim().slice(0,30), href: el.getAttribute('href'), w: +r.width.toFixed(1), h: +r.height.toFixed(1), cls: String(el.className).slice(0,40) });
    });
    // body font sizes sample
    return {
      IW, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth,
      docHeight: document.documentElement.scrollHeight,
      textCount: textEls.length, textOverlaps, textArt, overflowers, clipped, headings, taps
    };
  });
  report[p] = res;
  console.error('done', p);
}
console.log(JSON.stringify(report));
await browser.close();
