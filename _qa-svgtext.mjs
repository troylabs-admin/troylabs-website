import { chromium, devices } from '@playwright/test';
const BASE='https://troylabs-mobile-v2.vercel.app';
const b=await chromium.launch(); const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage();
for(const path of ['/','/build','/demo','/ignite','/apply']){
  await p.goto(BASE+path,{waitUntil:'load',timeout:45000}); await p.waitForTimeout(1200);
  const H=await p.evaluate(()=>document.documentElement.scrollHeight);
  for(let y=0;y<H;y+=400){await p.evaluate(v=>scrollTo(0,v),y);await p.waitForTimeout(80);}
  await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(800);
  const r=await p.evaluate(()=>{
    const IW=innerWidth;
    const els=[...document.querySelectorAll('.m svg text, .m text, .m tspan')].filter(t=>{
      const cs=getComputedStyle(t); if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.05) return false;
      const r=t.getBoundingClientRect(); return r.width>1&&r.height>1;
    }).map(t=>{const r=t.getBoundingClientRect();return {txt:(t.textContent||'').trim().slice(0,40),l:r.left+scrollX,t:r.top+scrollY,r:r.right+scrollX,b:r.bottom+scrollY,w:+r.width.toFixed(1),h:+r.height.toFixed(1),fs:getComputedStyle(t).fontSize};});
    const overlaps=[]; const offscreen=[];
    for(const e of els){ if(e.l<-1) offscreen.push({txt:e.txt,left:+e.l.toFixed(1),cut:+(0-e.l).toFixed(1),side:'left'}); if(e.r>IW+1) offscreen.push({txt:e.txt,right:+e.r.toFixed(1),cut:+(e.r-IW).toFixed(1),side:'right'}); }
    for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const A=els[i],B=els[j];const ox=Math.min(A.r,B.r)-Math.max(A.l,B.l);const oy=Math.min(A.b,B.b)-Math.max(A.t,B.t);if(ox>2&&oy>2)overlaps.push({a:A.txt,b:B.txt,ox:+ox.toFixed(1),oy:+oy.toFixed(1)});}
    return {count:els.length, overlaps, offscreen, sample:els.slice(0,3)};
  });
  console.log('### '+path+' svgTextCount='+r.count);
  console.log('  OFFSCREEN('+r.offscreen.length+'):',JSON.stringify(r.offscreen));
  console.log('  OVERLAPS('+r.overlaps.length+'):',JSON.stringify(r.overlaps));
}
await b.close();
