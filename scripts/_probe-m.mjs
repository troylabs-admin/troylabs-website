import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const route = process.argv[2] || '/';
await p.goto('http://localhost:4332' + route, { waitUntil: 'load' });
await p.waitForTimeout(800);
const h = await p.evaluate(() => document.body.scrollHeight);
const shots = Math.min(7, Math.ceil(h / 844));
for (let i = 0; i < shots; i++) {
  await p.evaluate((y) => window.scrollTo(0, y), (h - 844) * (i / Math.max(1, shots - 1)));
  await p.waitForTimeout(350);
  await p.screenshot({ path: `/tmp/ref-slices/_m${i}.png` });
}
console.log('docH', h, 'shots', shots);
await b.close();
