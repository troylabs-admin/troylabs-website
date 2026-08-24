import { chromium, devices } from '@playwright/test';
const BASE='https://troylabs-mobile-v2.vercel.app';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
await p.goto(BASE+'/', {waitUntil:'load', timeout:45000}); await p.waitForTimeout(1500);

// full error text
try { await p.tap('a[href="/build"]', { timeout: 6000 }); } catch(e){ console.log('FULL ERR:\n'+String(e).slice(0,1500)); }
console.log('url after tap attempt:', p.url());

// is the element moving? sample its box over frames
const boxes = [];
for (let i=0;i<6;i++){ boxes.push(await p.evaluate(()=>{const a=document.querySelector('a[href="/build"]'); const r=a.getBoundingClientRect(); const cs=getComputedStyle(a); const par=a.closest('header,nav'); const pcs=par?getComputedStyle(par):null; return {x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2), tf:cs.transform, anim:cs.animationName, parentAnim: pcs?pcs.animationName:null, parentTf: pcs?pcs.transform:null, ptag: par?par.tagName+'.'+String(par.className).slice(0,40):null};})); await p.waitForTimeout(120); }
console.log('BOX SAMPLES:', JSON.stringify(boxes,null,1));

// elementFromPoint at center
console.log('EFP:', JSON.stringify(await p.evaluate(()=>{const a=document.querySelector('a[href="/build"]');const r=a.getBoundingClientRect();const cx=r.x+r.width/2,cy=r.y+r.height/2;const el=document.elementFromPoint(cx,cy);const chain=[];let n=el;while(n&&n!==document.body){chain.push(n.tagName+'.'+String(n.className).slice(0,30));n=n.parentElement;}return {cx,cy,chain, isSelfOrChild: el===a||a.contains(el), pointerEvents:getComputedStyle(a).pointerEvents};})));

// try raw touchscreen tap at coordinates
const c = await p.evaluate(()=>{const a=document.querySelector('a[href="/build"]');const r=a.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
await p.touchscreen.tap(c.x, c.y);
await p.waitForTimeout(3000);
console.log('after touchscreen.tap url:', p.url());

// back home, try force tap
await p.goto(BASE+'/', {waitUntil:'load'}); await p.waitForTimeout(1200);
try { await p.tap('a[href="/demo"]', { timeout: 5000, force: true }); } catch(e){ console.log('FORCE ERR', String(e).split('\n')[0]); }
await p.waitForTimeout(3000);
console.log('after force tap url:', p.url());

// click (mouse) test
await p.goto(BASE+'/', {waitUntil:'load'}); await p.waitForTimeout(1200);
try { await p.click('a[href="/ignite"]', { timeout: 5000 }); } catch(e){ console.log('CLICK ERR', String(e).split('\n')[0]); }
await p.waitForTimeout(3000);
console.log('after click url:', p.url());
await b.close();
