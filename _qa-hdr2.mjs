import { chromium, devices } from '@playwright/test';
const b=await chromium.launch(); const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage();
await p.goto('https://troylabs-mobile-v2.vercel.app/',{waitUntil:'load',timeout:45000});
for (const t of [500,1500,3000,6000]) {
  await p.waitForTimeout(t===500?500:t-  (t===1500?500:t===3000?1500:3000));
  console.log('t~'+t+'ms', JSON.stringify(await p.evaluate(()=>{
    const h=document.querySelector('header.m');
    const a=h.querySelector('a[href="/build"]'); const cs=getComputedStyle(a);
    return {hdrClasses:h.className, hdrAwake:h.classList.contains('awake'), inMain: !!h.closest('main'), parent: h.parentElement.tagName,
      opacity:cs.opacity, playState:cs.animationPlayState, anim:cs.animationName, dur:cs.animationDuration, delay:cs.animationDelay, fill:cs.animationFillMode};
  })));
}
// scroll down and back — does it ever wake?
await p.evaluate(()=>scrollTo(0,2000)); await p.waitForTimeout(1200); await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(1500);
console.log('after scroll cycle', JSON.stringify(await p.evaluate(()=>{const h=document.querySelector('header.m');const a=h.querySelector('a[href="/build"]');const cs=getComputedStyle(a);return {awake:h.classList.contains('awake'),opacity:cs.opacity,playState:cs.animationPlayState};})));
// footer too
console.log('footer', JSON.stringify(await p.evaluate(()=>{const f=document.querySelector('footer.m, footer .m, footer');if(!f)return null;const a=f.querySelector('a');const cs=a?getComputedStyle(a):null;return {tag:f.tagName,cls:String(f.className).slice(0,50),inMain:!!f.closest('main'),linkOpacity:cs?cs.opacity:null,anim:cs?cs.animationName:null,play:cs?cs.animationPlayState:null};})));
await p.screenshot({path:'/tmp/ref-slices/_qb-hdr-after.png', clip:{x:0,y:0,width:390,height:70}});
await b.close();
