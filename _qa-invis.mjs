import { chromium, devices } from '@playwright/test';
const BASE='https://troylabs-mobile-v2.vercel.app';
const b=await chromium.launch(); const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage();
for(const path of ['/','/build','/demo','/ignite','/apply']){
  await p.goto(BASE+path,{waitUntil:'load',timeout:45000}); await p.waitForTimeout(2000);
  // full scroll sweep to give reveals every chance
  const H=await p.evaluate(()=>document.documentElement.scrollHeight);
  for(let y=0;y<H;y+=350){await p.evaluate(v=>scrollTo(0,v),y);await p.waitForTimeout(120);}
  await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(1200);
  const r=await p.evaluate(()=>{
    // .m blocks outside main
    const outside=[...document.querySelectorAll('.m')].filter(e=>!e.closest('main')).map(e=>({cls:String(e.className).slice(0,40),tag:e.tagName,awake:e.classList.contains('awake'),parent:e.parentElement.tagName}));
    // invisible content inside mobile trees
    const invis=[];
    document.querySelectorAll('.m, .m *').forEach(e=>{
      const cs=getComputedStyle(e);
      if(cs.display==='none'||cs.visibility==='hidden') return;
      const r=e.getBoundingClientRect(); if(r.width<2||r.height<2) return;
      if(parseFloat(cs.opacity)<0.02){
        const txt=(e.innerText||'').replace(/\s+/g,' ').trim().slice(0,40);
        invis.push({tag:e.tagName,cls:String(e.className).slice(0,45),txt,anim:cs.animationName,play:cs.animationPlayState,blockAwake:!!(e.closest('.m')&&e.closest('.m').classList.contains('awake')), inMain:!!e.closest('main')});
      }
    });
    return {outsideMainM:outside, invisibleCount:invis.length, invisible:invis.slice(0,25)};
  });
  console.log('### '+path); console.log(' .m outside <main>:',JSON.stringify(r.outsideMainM));
  console.log(' invisible (opacity<0.02) count='+r.invisibleCount); r.invisible.forEach(i=>console.log('   ',JSON.stringify(i)));
}
await b.close();
