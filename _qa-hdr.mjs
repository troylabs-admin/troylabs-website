import { chromium, devices } from '@playwright/test';
const b=await chromium.launch(); const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage();
for(const path of ['/','/build','/apply']){
await p.goto('https://troylabs-mobile-v2.vercel.app'+path,{waitUntil:'load',timeout:45000}); await p.waitForTimeout(2500);
console.log(path, JSON.stringify(await p.evaluate(()=>{
  const h=document.querySelector('header.m, .m-nav');
  const cs=getComputedStyle(h); const r=h.getBoundingClientRect();
  const links=[...h.querySelectorAll('a')].map(a=>{const c=getComputedStyle(a);return {t:(a.innerText||'').trim(),op:c.opacity,color:c.color,anim:c.animationName,fs:c.fontSize};});
  return {hdrOpacity:cs.opacity, pos:cs.position, z:cs.zIndex, rect:{x:r.x,y:r.y,w:r.width,h:r.height}, bg:cs.backgroundColor, links};
})));
await p.screenshot({path:`/tmp/ref-slices/_qb-hdr${path.replace(/\//g,'_')}.png`, clip:{x:0,y:0,width:390,height:70}});
}
await b.close();
