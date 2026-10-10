/** Responsive sign-in checks. Every remote request is intercepted; no email is sent. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,webkit,expect} from '@playwright/test';
const base=process.env.PORTAL_URL||'http://localhost:4399',out='test-results/portal-mobile';
mkdirSync(out,{recursive:true});
let checks=0;
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch();
 try{
  for(const width of [320,390,430,768,1440]){
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,deviceScaleFactor:1,reducedMotion:'reduce'});
   const requests=[],errors=[];let mode='success';
   await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===new URL(base).origin)return route.continue();
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    requests.push({path:url.pathname,body:request.postData()});
    if(url.pathname.endsWith('/functions/v1/account-email'))return route.fulfill({status:mode==='success'?200:429,json:mode==='success'?{sent:true}:{error:'Wait a moment before requesting another link.'},headers});
    return route.fulfill({status:200,json:{},headers});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`${base}/alumni-portal`);await expect(page.locator('#portal-auth')).toHaveAttribute('data-ready','1');
   await expect(page.locator('.portal-gate-steps li')).toHaveCount(3);
   assert.ok((await page.locator('meta[name="viewport"]').getAttribute('content')).includes('viewport-fit=cover'));
   const metrics=await page.evaluate(()=>{
    const form=document.querySelector('#portal-auth'),steps=document.querySelector('.portal-gate-steps'),email=document.querySelector('#portal-email'),button=form.querySelector('button');
    const r=e=>e.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,form:r(form).width,steps:r(steps).width,inputFont:parseFloat(getComputedStyle(email).fontSize),buttonHeight:r(button).height,cardWidths:[...steps.children].map(e=>r(e).width),grainPosition:getComputedStyle(document.body,'::after').position,grainHeight:parseFloat(getComputedStyle(document.body,'::after').height),bodyHeight:r(document.body).height,skyPosition:getComputedStyle(document.querySelector('.nebula')).position};
   });
   assert.equal(metrics.overflow,false);
   if(width<768){assert.ok(Math.abs(metrics.form-metrics.steps)<1);assert.ok(metrics.cardWidths.every(w=>w>=width-49));assert.ok(metrics.inputFont>=16);assert.ok(metrics.buttonHeight>=48);assert.equal(metrics.grainPosition,'absolute');assert.ok(Math.abs(metrics.grainHeight-metrics.bodyHeight)<1);}
   else assert.equal(metrics.grainPosition,'fixed');
   assert.equal(metrics.skyPosition,'fixed');
   await page.screenshot({path:`${out}/signin-${name}-${width}.png`,fullPage:true});
   await page.locator('button[type="submit"]').click();await expect(page.locator('#portal-msg')).toHaveText('Enter your email.');assert.equal(requests.length,0);
   await page.locator('#portal-email').fill('not an email');await page.locator('button[type="submit"]').click();await expect(page.locator('#portal-msg')).toContainText('does not look like an email');assert.equal(requests.length,0);
   await page.locator('#portal-email').fill('mobile-qa@example.com');await page.locator('button[type="submit"]').click();await expect(page.locator('#portal-msg')).toContainText('Check your inbox at mobile-qa@example.com');await expect(page.locator('button[type="submit"]')).toBeEnabled();assert.equal(requests.filter(r=>r.path.endsWith('account-email')).length,1);
   mode='limited';await page.locator('button[type="submit"]').click();await expect(page.locator('#portal-msg')).toContainText('Wait a moment');await expect(page.locator('button[type="submit"]')).toBeEnabled();
   await page.screenshot({path:`${out}/signin-feedback-${name}-${width}.png`,fullPage:true});
   if(width<768){for(const height of [700,820,900]){await page.setViewportSize({width,height});await page.locator('.portal-gate-steps').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}}
   assert.deepEqual(errors,[]);console.log(`PASS: ${name} sign-in ${width}px layout, validation, mocked success and rate-limit recovery`);checks++;await context.close();
  }
 }finally{await browser.close();}
}
console.log(`PASS: ${checks} responsive cases; no real authentication or messages.`);
