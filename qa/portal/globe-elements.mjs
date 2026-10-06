/** Local visual regression: mocked accounts, real globe renderer; no live data changes.
 * Run with the dev server: node qa/portal/globe-elements.mjs
 */
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const root=process.env.PORTAL_URL || 'http://localhost:4321';
const out='test-results/globe-elements';mkdirSync(out,{recursive:true});
const fixtureId='00000000-0000-4000-8000-000000000001';
const session={access_token:'local-visual-fixture',refresh_token:'local-visual-fixture',expires_at:4102444800,user:{id:fixtureId,email:'fixture@example.com'}};
const rows=Array.from({length:4},(_,i)=>({id:`fixture-${i}`,full_name:`Fixture Member ${i+1}`,approved:true,status:i?'student':'alum',divisions:['TECH'],current_title:'Founder',current_company:'Sample Company',city:{name:'Los Angeles',region:'CA',lat:34.0522,lng:-118.2437}}));
const browser=await chromium.launch();
const errors=[];
try {
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await ctx.addInitScript(session=>localStorage.setItem('sb-ackmhqxyxnceoarbhcrp-auth-token',JSON.stringify(session)),session);
 await ctx.route('https://ackmhqxyxnceoarbhcrp.supabase.co/**',async r=>{
  const u=new URL(r.request().url());let data=[];
  if(u.pathname.endsWith('/profiles')) data=u.searchParams.has('id')?[{...rows[0],id:fixtureId}]:rows;
  await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
 const wrap=p.locator('.portal-globe-wrap'),pop=p.locator('.portal-globe-pop');
 const settle=async()=>{await p.waitForTimeout(1100);};
 const open=async(sample=false)=>{await p.goto(`${root}/alumni-portal/home${sample?'?sample=1':''}`);await expect(wrap).toHaveAttribute('data-ready','true',{timeout:20000});await settle();await wrap.scrollIntoViewIfNeeded();};
 const contained=async()=>{
  const w=await wrap.boundingBox(),c=await pop.boundingBox();
  expect(c.x).toBeGreaterThanOrEqual(w.x-1);expect(c.y).toBeGreaterThanOrEqual(w.y-1);
  expect(c.x+c.width).toBeLessThanOrEqual(w.x+w.width+1);expect(c.y+c.height).toBeLessThanOrEqual(w.y+w.height+1);
  expect(await pop.evaluate(e=>e.scrollWidth-e.clientWidth)).toBe(0);
  const z=await p.locator('.portal-globe-zoom').count()?await p.locator('.portal-globe-zoom').boundingBox():null;   // zoom controls were removed (Bryan, 2026-10-05); the check stays for if they return
  if(z && z.x<c.x+c.width && c.x<z.x+z.width && z.y<c.y+c.height && c.y<z.y+z.height){console.log({w,c,z});await p.screenshot({path:`${out}/overlap.png`});throw new Error('zoom controls overlap the card');}
  expect(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
 };
 for(const width of (process.env.GLOBE_WIDTHS || '1440,1001,768,390,320').split(',').map(Number)){
  await p.setViewportSize({width,height:width>=768?1000:844});await open();
  const star=p.locator('.tl-star');await expect(star).toHaveCount(1);await expect(star).toHaveAttribute('data-count','4');
  await star.hover();const label=await star.locator('.tl-pin-name').evaluate(e=>({height:e.getBoundingClientRect().height,line:parseFloat(getComputedStyle(e).lineHeight),font:parseFloat(getComputedStyle(e).fontSize)}));
  expect(label.line).toBeGreaterThan(label.font);expect(label.height).toBeGreaterThanOrEqual(label.line+11);
  await p.screenshot({path:`${out}/label-${width}.png`});
  await star.click();await settle();await contained();await expect(pop.locator('h3')).toHaveText('LOS ANGELES, CA');
  await expect(p.locator('.portal-results-count')).toContainText('4 people');
  await p.screenshot({path:`${out}/city-${width}.png`});
  // A keyboard user can reach and invoke the action; closing keeps the selected counts correct.
  await pop.locator('.portal-globe-view').focus();await expect(pop.locator('.portal-globe-view')).toBeFocused();await p.keyboard.press('Enter');await expect(p.locator('.portal-card')).toHaveCount(4);
  await p.getByRole('button',{name:'Clear the selection',exact:true}).click();await expect(pop).toHaveCount(0);
  await open(true);await p.locator('#globe-city').selectOption('san francisco|ca');await settle();await contained();
  await p.screenshot({path:`${out}/cluster-${width}.png`});
  await p.locator('#search-q').fill('Sample Alum 463');await expect(p.locator('.tl-star')).toHaveCount(1);await p.locator('#globe-city').selectOption('mexico city|mx');await settle();await contained();await expect(pop).toContainText('Sample Alum 463');
  await p.screenshot({path:`${out}/person-${width}.png`});
  console.log(`PASS ${width}px: readable label, four-person city, merged cities, single person, contained cards, list action, no page overflow`);
 }
 // Long real-world content wraps, including strings with no spaces. It remains text.
 rows.splice(1);rows[0].full_name='Alexandria MontgomeryWorthingtonSutherland van der Meer <img src=x onerror=alert(1)>';rows[0].current_title='A long research and development title';rows[0].city.name='A very long city name with several words';
 await p.setViewportSize({width:320,height:844});await open();await p.locator('.tl-star').click();await settle();await contained();expect(await pop.locator('img').count()).toBe(0);await p.screenshot({path:`${out}/long-person-320.png`});
 await p.setViewportSize({width:1440,height:1000});await settle();await contained();
 const c=await pop.boundingBox(),s=await p.locator('.tl-star.is-selected').boundingBox();expect(Math.abs(c.x+c.width/2-s.x-s.width/2),'resized card stays above its marker').toBeLessThan(1);
 await p.screenshot({path:`${out}/long-person-1440.png`});
 expect(errors).toEqual([]);console.log('PASS long content, resizing an open card, literal text, no JavaScript errors');
}finally{await browser.close();}
