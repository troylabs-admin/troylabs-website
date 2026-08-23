import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })).newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto('http://localhost:4321/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
await p.mouse.move(700, 450);
for (const [name, tick, pause] of [['slow', 120, 90], ['medium', 300, 60], ['fast', 700, 35]]) {
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(900);
  const rec = await p.evaluate(() => { window.__rec = []; const f = document.querySelector('.home-flyer'); const loop = (ts) => { const r = f.getBoundingClientRect(); window.__rec.push([scrollY, r.x + r.width / 2, r.y + r.height / 2 + scrollY, ts]); if (!window.__stop) requestAnimationFrame(loop); }; window.__stop = false; requestAnimationFrame(loop); });
  const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  while (await p.evaluate(() => scrollY) < max - 4) { await p.mouse.wheel(0, tick); await p.waitForTimeout(pause); }
  await p.waitForTimeout(1200); await p.evaluate(() => { window.__stop = true; });
  const stats = await p.evaluate(() => { const rec = window.__rec; const sp = []; for (let i = 1; i < rec.length; i++) { const dt = Math.max(1, (rec[i][3] - rec[i - 1][3]) / 16.7); sp.push({ s: rec[i][0], v: Math.hypot(rec[i][1] - rec[i - 1][1], rec[i][2] - rec[i - 1][2]) / dt }); } const cruise = sp.filter(x => x.s > 1000 && x.s < 6000).map(x => x.v).sort((a, b) => a - b); const med = cruise[Math.floor(cruise.length / 2)] || 1; const tail = sp.filter(x => x.s > 6800); const mx = Math.max(...sp.map(x => x.v)); const mxTail = tail.length ? Math.max(...tail.map(x => x.v)) : 0; return { medianCruise: med.toFixed(1), maxAnywhere: mx.toFixed(1), maxAtEnding: mxTail.toFixed(1) }; });
  console.log(name.padEnd(7), JSON.stringify(stats));
}
console.log('final:', await p.evaluate(() => [document.querySelector('.home-flyer').style.offsetDistance, document.documentElement.classList.contains('landed')]));
await b.close();
