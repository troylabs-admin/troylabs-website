import { chromium, expect } from '@playwright/test';
const b=await chromium.launch();
try {
 const ctx=await b.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await ctx.addInitScript(()=>localStorage.setItem('sb-ackmhqxyxnceoarbhcrp-auth-token',JSON.stringify({access_token:'local-visual-fixture',refresh_token:'local-visual-fixture',expires_at:4102444800,user:{id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.com'}})));
 await ctx.route('https://ackmhqxyxnceoarbhcrp.supabase.co/**',async r=>{
  const u=new URL(r.request().url());const profile={full_name:'Visual Fixture',approved:true,divisions:['TECH']};
  await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(u.pathname.endsWith('/profiles')&&u.searchParams.has('id')?[profile]:[])});
 });
 const p=await ctx.newPage();p.on('pageerror',e=>console.log('ERROR',e.message));
 await p.goto('http://localhost:4321/alumni-portal/home?sample=1');await expect(p.locator('.portal-globe-wrap')).toHaveAttribute('data-ready','true',{timeout:20000});await p.waitForTimeout(1500);
 await p.locator('.portal-globe-wrap').scrollIntoViewIfNeeded();const s=p.locator('.tl-star').filter({visible:true}).first();await s.hover();console.log(await s.locator('.tl-pin-name').evaluate(e=>({lineHeight:getComputedStyle(e).lineHeight,height:e.getBoundingClientRect().height,text:e.textContent})));await p.screenshot({path:'/tmp/globe-after-label.png'});await s.click();await p.waitForTimeout(1300);await p.screenshot({path:'/tmp/globe-after-card.png'});console.log(await p.locator('.portal-globe-pop').boundingBox());
} finally {await b.close();}
