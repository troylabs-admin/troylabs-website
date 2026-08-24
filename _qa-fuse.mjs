import { chromium, devices } from '@playwright/test';
const b=await chromium.launch(); const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage();
await p.goto('https://troylabs-mobile-v2.vercel.app/ignite',{waitUntil:'load',timeout:45000}); await p.waitForTimeout(1500);
console.log(JSON.stringify(await p.evaluate(()=>{
  const sparks=[...document.querySelectorAll('.fuse-spark')].map(s=>({cls:String(s.className),display:getComputedStyle(s).display,offsetParentNull:s.offsetParent===null,inM:!!s.closest('.m'),rangeStartInline:s.style.animationRangeStart||null}));
  const nodes=[...document.querySelectorAll('.m-feat .m-node, .m-node')].map(n=>({frac:n.dataset.frac, ig0:n.style.getPropertyValue('--ig0')||'(unset)', ig1:n.style.getPropertyValue('--ig1')||'(unset)', cs0:getComputedStyle(n).getPropertyValue('animation-range-start'), cs1:getComputedStyle(n).getPropertyValue('animation-range-end'), timeline:getComputedStyle(n).animationTimeline, op:getComputedStyle(n).opacity}));
  return {sparks,nodes};
},null),null,1));
await b.close();
