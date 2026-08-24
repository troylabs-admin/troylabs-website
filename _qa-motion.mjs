import { chromium, devices } from '@playwright/test';
const BASE = 'https://troylabs-mobile-v2.vercel.app';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const R = {};
const goto = async p => { await page.goto(BASE+p, {waitUntil:'load', timeout:45000}); await page.waitForTimeout(1200); };

// ---- 5a: reveals, 5 per page
R.reveals = {};
for (const p of ['/', '/build', '/demo', '/ignite', '/apply']) {
  await goto(p);
  const cands = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.m [data-reveal]').forEach((el,i) => {
      const r = el.getBoundingClientRect();
      const top = r.top + scrollY;
      if (top > window.innerHeight) out.push({ i, top: Math.round(top), tag: el.tagName, cls: String(el.className).slice(0,45), txt:(el.innerText||'').replace(/\s+/g,' ').trim().slice(0,25) });
    });
    const step = Math.max(1, Math.floor(out.length/5));
    return out.filter((_,k)=>k%step===0).slice(0,5);
  });
  const rows = [];
  for (const c of cands) {
    const before = await page.evaluate(i => { const el = document.querySelectorAll('.m [data-reveal]')[i]; return { op: getComputedStyle(el).opacity, cls: el.className.includes('is-in') }; }, c.i);
    await page.evaluate(t => window.scrollTo(0, t - window.innerHeight*0.4), c.top);
    await page.waitForTimeout(1400);
    const after = await page.evaluate(i => { const el = document.querySelectorAll('.m [data-reveal]')[i]; const r=el.getBoundingClientRect(); return { op: getComputedStyle(el).opacity, isIn: el.className.includes('is-in'), tf: getComputedStyle(el).transform, vis: r.top < innerHeight && r.bottom>0 }; }, c.i);
    rows.push({ ...c, beforeOpacity: before.op, afterOpacity: after.op, isIn: after.isIn, onScreen: after.vis });
    await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(400);
  }
  R.reveals[p] = { total: cands.length, rows };
}

// ---- 5b BUILD rocket
await goto('/build');
{
  const info = await page.evaluate(()=>{ const el=document.querySelector('.m-tl-rocket'); if(!el) return null; const r=el.getBoundingClientRect(); return {exists:true, docTop: r.top+scrollY, h:r.height}; });
  const samples = [];
  if (info) {
    const H = await page.evaluate(()=>document.documentElement.scrollHeight);
    // find the rail container
    for (const frac of [0.15,0.3,0.45,0.6,0.75]) {
      await page.evaluate(f=>window.scrollTo(0, (document.documentElement.scrollHeight-innerHeight)*f), frac);
      await page.waitForTimeout(700);
      samples.push(await page.evaluate(f=>{ const el=document.querySelector('.m-tl-rocket'); const cs=getComputedStyle(el); const r=el.getBoundingClientRect(); return {frac:f, top:cs.top, offsetDistance: cs.offsetDistance, transform: cs.transform.slice(0,60), docY: Math.round(r.top+scrollY), scrollY: Math.round(scrollY)};}, frac));
    }
  }
  R.buildRocket = { info, samples };
}

// ---- 5c ignite fuse
await goto('/ignite');
{
  const samples = [];
  const exists = await page.evaluate(()=>({ spark: !!document.querySelector('.m-feat .fuse-spark'), nodes: document.querySelectorAll('.m-feat .m-node').length, anyNode: document.querySelectorAll('.m-node').length, anySpark: document.querySelectorAll('.fuse-spark').length }));
  const featTop = await page.evaluate(()=>{ const f=document.querySelector('.m-feat'); if(!f) return null; const r=f.getBoundingClientRect(); return {top: Math.round(r.top+scrollY), h: Math.round(r.height)};});
  if (featTop) for (const f of [0,0.2,0.4,0.6,0.8,1.0]) {
    await page.evaluate(({t,h,f})=>window.scrollTo(0, t - innerHeight*0.8 + h*f), {t:featTop.top,h:featTop.h,f});
    await page.waitForTimeout(700);
    samples.push(await page.evaluate(f=>{ const s=document.querySelector('.m-feat .fuse-spark')||document.querySelector('.fuse-spark'); const cs=s?getComputedStyle(s):null; const nodes=[...document.querySelectorAll('.m-feat .m-node, .m-node')].map(n=>+getComputedStyle(n).opacity.slice(0,5)); return {f, sparkTop: cs?cs.top:null, sparkOpacity: cs?cs.opacity:null, nodes, scrollY:Math.round(scrollY)};}, f));
  }
  R.igniteFuse = { exists, featTop, samples };
}

// ---- 6 cold idle
R.coldIdle = {};
for (const p of ['/','/build']) {
  await goto(p);
  const at = [];
  for (const f of [0, 0.5]) {
    await page.evaluate(f=>window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f), f);
    await page.waitForTimeout(900);
    at.push(await page.evaluate(f=>{
      const bs=[...document.querySelectorAll('main .m')];
      let awakeNear=0, awakeFar=0, sleepNear=0, sleepFar=0;
      const detail=[];
      bs.forEach((b,i)=>{ const r=b.getBoundingClientRect(); const near = r.top < innerHeight*2 && r.bottom > -innerHeight; const aw=b.classList.contains('awake');
        if(near&&aw)awakeNear++; else if(near&&!aw)sleepNear++; else if(!near&&aw)awakeFar++; else sleepFar++;
        detail.push({i, cls:String(b.className).slice(0,40), near, awake:aw, top:Math.round(r.top)});
      });
      // find a .star in a non-awake block
      let paused=null;
      for(const b of bs){ if(!b.classList.contains('awake')){ const s=b.querySelector('.star, .dot, [class*="twink"]'); if(s){ const cs=getComputedStyle(s); paused={sel:String(s.className).slice(0,30), playState: cs.animationPlayState, name: cs.animationName}; break; } } }
      let running=null;
      for(const b of bs){ if(b.classList.contains('awake')){ const s=b.querySelector('.star, .dot, [class*="twink"]'); if(s){ const cs=getComputedStyle(s); running={sel:String(s.className).slice(0,30), playState: cs.animationPlayState, name: cs.animationName}; break; } } }
      return {f, total:bs.length, awakeNear, sleepNear, awakeFar, sleepFar, pausedSample:paused, awakeSample:running, detail};
    }, f));
  }
  R.coldIdle[p] = at;
}

// ---- 7 perf
async function fps(scroll) {
  await goto('/');
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async (doScroll) => {
    return await new Promise(res => {
      const ts=[]; let last=performance.now(); let n=0; let y=0;
      function tick(now){ ts.push(now-last); last=now; n++;
        if (doScroll) { y += 8; if (y > document.documentElement.scrollHeight - innerHeight) y = 0; window.scrollTo(0,y); }
        if (n<250) requestAnimationFrame(tick); else {
          const s=ts.slice(10).sort((a,b)=>a-b);
          const avg=s.reduce((a,b)=>a+b,0)/s.length;
          res({ avg:+avg.toFixed(2), median:+s[Math.floor(s.length/2)].toFixed(2), p95:+s[Math.floor(s.length*0.95)].toFixed(2), max:+s[s.length-1].toFixed(2), fps:+(1000/avg).toFixed(1) });
        }
      }
      requestAnimationFrame(tick);
    });
  }, scroll);
  return r;
}
R.perfIdle = await fps(false);
R.perfScroll = await fps(true);

console.log(JSON.stringify(R));
await browser.close();
