import { chromium, devices } from '@playwright/test';
const BASE='https://troylabs-mobile-v2.vercel.app';
const PAGES=['/','/build','/demo','/ignite','/apply'];
const b=await chromium.launch(); const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage();
const rows=[];
for (const from of PAGES){
  // inventory mobile-nav links once
  await p.goto(BASE+from,{waitUntil:'load',timeout:45000}); await p.waitForTimeout(1200);
  const inv = await p.evaluate(()=>[...document.querySelectorAll('header.m a, .m-nav a')].map(a=>{const r=a.getBoundingClientRect();return {txt:(a.innerText||'').trim(),href:a.getAttribute('href'),w:+r.width.toFixed(1),h:+r.height.toFixed(1),x:+r.x.toFixed(1),y:+r.y.toFixed(1)};}));
  rows.push({inventory:{from, inv}});
  for (const target of ['/','/build','/ignite','/demo','/apply']){
    await p.goto(BASE+from,{waitUntil:'load',timeout:45000}); await p.waitForTimeout(1200);
    const pt = await p.evaluate(t=>{
      const as=[...document.querySelectorAll('header.m a, .m-nav a, .m a')].filter(a=>{const h=a.getAttribute('href'); return h===t;});
      for(const a of as){const r=a.getBoundingClientRect(); if(r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0){const cx=r.x+r.width/2,cy=r.y+r.height/2;const el=document.elementFromPoint(cx,cy);
        return {ok:true,cx,cy,w:+r.width.toFixed(1),h:+r.height.toFixed(1),topEl:el?el.tagName+'.'+String(el.className).slice(0,40):null,hits:el?(el===a||a.contains(el)||el.contains(a)):false, txt:(a.innerText||'').trim()};}}
      return {ok:false,count:as.length};
    }, target);
    let after=null, err=null;
    if(pt.ok){ try{ await p.touchscreen.tap(pt.cx,pt.cy); }catch(e){err=String(e).split('\n')[0];}
      await p.waitForTimeout(3000); after=new URL(p.url()).pathname; }
    rows.push({from,target,pt,after,changed: after? after.replace(/\/$/,'')===target.replace(/\/$/,'') : null, err});
  }
}
console.log(JSON.stringify(rows,null,1));
await b.close();
