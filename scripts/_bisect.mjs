import { chromium, webkit } from '@playwright/test';
const TOGGLES = {
  baseline: '',
  'no-nebula': '.nebula{display:none!important}',
  'no-grain': '.grain::after{display:none!important}',
  'no-sky': 'canvas.sky{display:none!important}',
  'no-swarm': '.swarm{display:none!important}',
  'no-twinkle': '.star{animation:none!important}',
  'no-zerog': '.zg{animation:none!important}',
  'no-scrolldriven': '.swarm-dot,.flyer-img,.flyer-backers,.fuse-spark,.fuse-node,.planet{animation:none!important}',
};
for (const [engineName, engine] of [['webkit', webkit], ['chromium', chromium]]) {
  const b = await engine.launch({ headless: false, args: engineName === 'chromium' ? ['--window-position=2200,2200'] : [] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  for (const [name, css] of Object.entries(TOGGLES)) {
    await p.goto('http://localhost:4332/', { waitUntil: 'networkidle' });
    if (css) await p.addStyleTag({ content: css });
    await p.waitForTimeout(900);
    const frames = await p.evaluate(() => new Promise((res) => {
      const d = []; let last = performance.now(); let y = 0;
      const step = () => { const n = performance.now(); d.push(n - last); last = n; y += 24; window.scrollTo(0, y);
        if (y < document.body.scrollHeight - innerHeight && d.length < 320) requestAnimationFrame(step); else res(d.slice(5)); };
      requestAnimationFrame(step);
    }));
    const s = [...frames].sort((a, c) => a - c);
    const avg = frames.reduce((a, c) => a + c, 0) / frames.length;
    console.log(`${engineName.padEnd(9)} ${name.padEnd(16)} avg ${avg.toFixed(1).padStart(5)}ms  p95 ${s[Math.floor(s.length * 0.95)].toFixed(1).padStart(6)}ms  >25ms ${String(frames.filter((x) => x > 25).length).padStart(3)}/${frames.length}`);
  }
  await b.close();
}
