import { chromium, devices } from '@playwright/test';
const b=await chromium.launch(); const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage();
await p.goto('https://troylabs-mobile-v2.vercel.app/',{waitUntil:'load',timeout:45000}); await p.waitForTimeout(1200);
const H=await p.evaluate(()=>document.documentElement.scrollHeight);
for(let y=0;y<H;y+=400){await p.evaluate(v=>scrollTo(0,v),y);await p.waitForTimeout(80);}
await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(600);
const r = await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('.m svg text, .m text').forEach(t=>{const r=t.getBoundingClientRect();out.push({txt:(t.textContent||'').trim(),l:+(r.left+scrollX).toFixed(1),r:+(r.right+scrollX).toFixed(1),t:+(r.top+scrollY).toFixed(1),b:+(r.bottom+scrollY).toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),fs:getComputedStyle(t).fontSize,anchor:t.getAttribute('text-anchor')});});
  return {IW:innerWidth,out};
});
console.log(JSON.stringify(r,null,1));
// screenshot of just the constellation
const box = await p.evaluate(()=>{const s=document.querySelector('.m .constellation, .m svg'); const r=s.getBoundingClientRect(); return {x:0,y:Math.max(0,r.top+scrollY-20),w:390,h:Math.min(700,r.height+40)};});
await p.evaluate(y=>scrollTo(0,y), box.y);
await p.waitForTimeout(600);
await p.screenshot({path:'/tmp/ref-slices/_qb-constellation.png'});
await b.close();
