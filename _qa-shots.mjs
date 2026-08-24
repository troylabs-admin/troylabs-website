import { chromium, devices } from '@playwright/test';
const BASE='https://troylabs-mobile-v2.vercel.app';
const b=await chromium.launch(); const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage();
for (const [name, path] of [['home','/'],['build','/build'],['demo','/demo'],['ignite','/ignite'],['apply','/apply']]) {
  await p.goto(BASE+path,{waitUntil:'load',timeout:45000}); await p.waitForTimeout(1500);
  const H=await p.evaluate(()=>document.documentElement.scrollHeight);
  const VH=await p.evaluate(()=>innerHeight);
  const max=H-VH;
  // warm reveals by scrolling through first
  for(let y=0;y<H;y+=400){ await p.evaluate(v=>scrollTo(0,v),y); await p.waitForTimeout(70); }
  for (let i=0;i<6;i++){
    const y=Math.round(max*(i/5));
    await p.evaluate(v=>scrollTo(0,v),y); await p.waitForTimeout(900);
    await p.screenshot({path:`/tmp/ref-slices/_qb-${name}-${i}.png`});
  }
  // also find largest vertical gap of pure background in the .m tree
  const gaps = await p.evaluate(()=>{
    const els=[...document.querySelectorAll('.m > *, .m * ')].filter(e=>{const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden')return false; const r=e.getBoundingClientRect(); return r.width>2&&r.height>2;});
    const spans=els.map(e=>{const r=e.getBoundingClientRect();return [r.top+scrollY, r.bottom+scrollY];}).sort((a,b)=>a[0]-b[0]);
    let cur=-1, out=[];
    for(const [t,bm] of spans){ if(t>cur+1){ if(cur>0 && t-cur>200) out.push({from:Math.round(cur),to:Math.round(t),gap:Math.round(t-cur)}); } cur=Math.max(cur,bm); }
    return {docH:document.documentElement.scrollHeight, gaps: out};
  });
  console.log(name, JSON.stringify(gaps));
}
await b.close();
