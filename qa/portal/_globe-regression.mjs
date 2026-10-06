import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage, ref } from './helpers.mjs';
import { mkdirSync } from 'node:fs';

/* ── zoom (Bryan, 2026-10-05: "there's no button to zoom in") ──────────────────────────────────────────────────
   Reads the settled camera from [data-view] ("km/px · alt · lat,lng · #n"; #n bumps on every re-cluster). */
const camera=async(p)=>{const v=await p.locator('.portal-globe-wrap').getAttribute('data-view');const m=/([\d.]+) km\/px · alt ([\d.]+) · (-?\d+),(-?\d+) · #(\d+)/.exec(v);return {kmPx:+m[1],alt:+m[2],lat:+m[3],lng:+m[4],n:+m[5],raw:v};};
/** wait until the camera has stopped moving: [data-view] unchanged for 500 ms */
const settle=async(p)=>{let last='',same=0;for(let i=0;i<60&&same<5;i++){await p.waitForTimeout(100);const v=await p.locator('.portal-globe-wrap').getAttribute('data-view');same=v===last?same+1:0;last=v;}return camera(p);};
/** stars a person can actually see: rendered, and their centre inside the round frame */
const starsInFrame=(p)=>p.evaluate(()=>{const w=document.querySelector('.portal-globe-wrap').getBoundingClientRect();const R=Math.min(w.width,w.height)/2;return [...document.querySelectorAll('.portal-globe-wrap .tl-star')].filter(el=>{if(!el.checkVisibility())return false;const r=el.getBoundingClientRect();return r.width>0&&Math.hypot(r.left+r.width/2-w.left-w.width/2,r.top+r.height/2-w.top-w.height/2)<=R;}).map(el=>`${el.dataset.seed}#${el.dataset.count}`);});
/** a point on the bare globe (the canvas itself, not a star or a control), for drags */
const bareSpot=(p)=>p.evaluate(()=>{const r=document.querySelector('.portal-globe-wrap').getBoundingClientRect();for(const [fx,fy] of [[.4,.62],[.35,.5],[.45,.4],[.3,.4],[.5,.3],[.4,.7]]){const x=r.left+r.width*fx,y=r.top+r.height*fy;if(document.elementFromPoint(x,y)?.tagName==='CANVAS')return {x,y};}return null;});
const overlaps=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
/** the controls sit inside the frame and never on the card, the FIND A CITY box, the hint line or the count */
async function controlsClear(p,label){
 const z=await p.locator('.portal-globe-zoom').boundingBox(),w=await p.locator('.portal-globe-wrap').boundingBox();
 expect(z.x>=w.x&&z.y>=w.y&&z.x+z.width<=w.x+w.width+0.5&&z.y+z.height<=w.y+w.height+0.5,`${label}: controls inside the frame`).toBe(true);
 const hits=[];for(const sel of ['.portal-globe-pop','.portal-globe-tools','.portal-explore-count','.portal-globe-count']){const l=p.locator(sel).first();if(await l.count()&&await l.isVisible()){const b=await l.boundingBox();if(b&&overlaps(z,b))hits.push(sel);}}
 expect(hits,`${label}: controls overlap`).toEqual([]);
}
async function zoomSuite(page,alt0){
 const zin=page.getByRole('button',{name:'Zoom in'}),zout=page.getByRole('button',{name:'Zoom out'}),zreset=page.getByRole('button',{name:'Reset view'});
 const center=()=>page.evaluate(()=>document.querySelector('.portal-globe-wrap').scrollIntoView({block:'center'}));
 await center();
 // back to the opening view (the drag above turned the globe): reset, then the opening state of the buttons
 await zreset.click();let c=await settle(page);expect([c.alt,c.lat,c.lng]).toEqual([alt0,30,-80]);
 await expect(zreset).toBeDisabled();await expect(zout).toBeDisabled();await expect(zin).toBeEnabled();
 const zbox=await page.locator('.portal-globe-zoom').boundingBox(),wbox=await page.locator('.portal-globe-wrap').boundingBox();
 expect(zbox.x+zbox.width/2,'controls in the right half').toBeGreaterThan(wbox.x+wbox.width*0.75);expect(zbox.y+zbox.height/2,'controls in the bottom half').toBeGreaterThan(wbox.y+wbox.height*0.75);
 await controlsClear(page,'1440 opening');await page.screenshot({path:`${out}/zoom-1440-open.png`});
 // keyboard: Tab reaches + (after the stars), the focus ring is orange, Enter zooms; at the limit focus stays on the button
 await page.locator('#globe-city').focus();let tabs=0;while(tabs<80&&await page.evaluate(()=>document.activeElement?.getAttribute('aria-label'))!=='Zoom in'){await page.keyboard.press('Tab');tabs++;}
 expect(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Tab reaches Zoom in').toBe('Zoom in');
 expect(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineColor)).toBe('rgb(255, 125, 44)');
 const ladder=[c.alt];for(let i=0;i<4;i++){await page.keyboard.press('Enter');c=await settle(page);ladder.push(c.alt);expect([c.lat,c.lng],'zooms toward the centre: lat/lng kept').toEqual([30,-80]);}
 console.log('zoom-in ladder (altitude)',ladder.join(' → '));for(let i=1;i<ladder.length;i++)expect(ladder[i],'+ lowers the altitude').toBeLessThan(ladder[i-1]);
 expect(c.alt).toBeCloseTo(0.25,2);await expect(zin).toBeDisabled();expect(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'focus kept at the limit').toBe('Zoom in');
 await page.keyboard.press('Enter');await zin.dispatchEvent('click');expect((await settle(page)).alt,'a disabled + does nothing').toBeCloseTo(0.25,2);
 await page.screenshot({path:`${out}/zoom-1440-in.png`});await controlsClear(page,'1440 zoomed in');
 // − raises it again, step by step, up to the opening altitude, where − disables
 const up=[c.alt];for(let i=0;i<4;i++){await zout.click();c=await settle(page);up.push(c.alt);}
 console.log('zoom-out ladder (altitude)',up.join(' → '));for(let i=1;i<up.length;i++)expect(up[i],'− raises the altitude').toBeGreaterThan(up[i-1]);
 expect(c.alt).toBeCloseTo(alt0,2);await expect(zout).toBeDisabled();await zout.dispatchEvent('click');expect((await settle(page)).alt,'a disabled − does nothing').toBeCloseTo(alt0,2);
 // reset: zoomed in and turned away, it returns to the opening view and disables itself
 await zin.click();await zin.click();await center();await settle(page);const wb=await page.locator('.portal-globe-wrap').boundingBox();const g=await bareSpot(page);expect(g,'a bare patch of globe to drag').not.toBeNull();await page.mouse.move(g.x,g.y);await page.mouse.down();await page.mouse.move(g.x+wb.width*.25,g.y,{steps:12});await page.mouse.up();
 c=await settle(page);expect(c.alt).toBeLessThan(alt0);expect(c.lng,'the drag turned the globe').not.toBe(-80);await expect(zreset).toBeEnabled();
 await zreset.click();c=await settle(page);expect([c.alt,c.lat,c.lng],'reset = the opening view').toEqual([alt0,30,-80]);await expect(zreset).toBeDisabled();
 // the plain wheel still scrolls the PAGE while zoomed in; the camera doesn't move
 await zin.click();await center();c=await settle(page);const gb=await page.locator('.portal-globe-wrap').boundingBox();await page.mouse.move(gb.x+gb.width/2,gb.y+gb.height/2);
 const y0=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,200);await page.waitForTimeout(600);expect(await page.evaluate(()=>scrollY),'wheel scrolls the page').toBeGreaterThan(y0);expect((await camera(page)).raw,'wheel leaves the globe alone').toBe(c.raw);
 // a trackpad pinch (ctrl + wheel) zooms the globe instead, and does not scroll
 await center();await page.mouse.move(gb.x+gb.width/2,(await page.locator('.portal-globe-wrap').boundingBox()).y+gb.height/2);const y1=await page.evaluate(()=>scrollY);
 await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');const pinched=await settle(page);
 expect(pinched.alt,'trackpad pinch zooms in').toBeLessThan(c.alt);expect(await page.evaluate(()=>scrollY)).toBe(y1);await expect(zout).toBeEnabled();
 await zreset.click();await settle(page);
 // re-clustering: the New York star holds 5 cities at the opening zoom; zoomed in they split, and more stars show
 await page.locator('#globe-city').selectOption('new york|ny');await expect(page.locator('.portal-globe-place h3')).toHaveText('NEW YORK, NY');
 await page.getByRole('button',{name:'Clear the selection'}).click();await center();c=await settle(page);
 const before=await starsInFrame(page),nyBefore=Number(await page.locator('.tl-star[data-seed="new york|ny"]').getAttribute('data-count'));
 for(let i=0;i<4;i++){await zin.click();await settle(page);}
 const after=await starsInFrame(page),zoomed=await camera(page);
 console.log('stars in frame at',c.alt,before.join(' '),'\n          at',zoomed.alt,after.join(' '));
 expect(nyBefore,'New York is merged at the opening zoom').toBeGreaterThan(25);expect(zoomed.n,'clusters re-ran').toBeGreaterThan(c.n);
 // (the whole frame shows fewer stars zoomed in — the rest of the world is out of view — so count the stars that hold New York's neighbourhood)
 const hood=['new york|ny','philadelphia|pa','boston|ma','washington|dc','toronto|on'],local=(list)=>list.filter(s=>hood.includes(s.split('#')[0])),people=(list)=>list.reduce((n,s)=>n+Number(s.split('#')[1]),0);
 expect(local(before).length,'one merged star at the opening zoom').toBe(1);expect(local(after).length,'zooming in shows more stars: one per city').toBe(5);expect(people(local(after)),'same people').toBe(people(local(before)));
 for(const [seed,n] of [['new york|ny',25],['philadelphia|pa',3],['boston|ma',6],['washington|dc',5]])expect(after,`${seed} has its own star`).toContain(`${seed}#${n}`);
 // a tap while zoomed in keeps the zoom; the card and the controls don't collide
 await page.locator('.tl-star[data-seed="philadelphia|pa"]').click();await expect(page.locator('.portal-globe-place h3')).toHaveText('PHILADELPHIA, PA');c=await settle(page);
 expect(c.alt,'a tap keeps the zoom').toBeCloseTo(0.25,2);await controlsClear(page,'1440 zoomed, card open');await page.screenshot({path:`${out}/zoom-1440-card.png`});
 // drag the card's star down into the lower half: the controls move to the top corner, still clear of the card
 const db=await page.locator('.portal-globe-wrap').boundingBox();const dg=await bareSpot(page);await page.mouse.move(dg.x,dg.y);await page.mouse.down();await page.mouse.move(dg.x,dg.y+db.height*.1,{steps:12});await page.mouse.up();await settle(page);
 await expect(page.locator('.portal-globe-pop'),'the card follows its star down').toBeVisible();await expect(page.locator('.portal-globe-zoom'),'controls moved to the top corner').toHaveClass(/is-top/);await controlsClear(page,'1440 card low in the frame');
 await page.screenshot({path:`${out}/zoom-1440-card-low.png`});
 // reset with a selected city on the far side: no card pointing at nothing, but the selection (the list) stays
 await page.locator('#globe-city').selectOption('singapore|');await expect(page.locator('.portal-globe-place h3')).toHaveText('SINGAPORE');await settle(page);
 await zreset.click();await settle(page);await expect(page.locator('.portal-globe-pop')).toHaveCount(0);await expect(page.locator('.portal-results-count')).toContainText('3 people');
 await page.getByRole('button',{name:'Remove the place'}).click();await expect(page.locator('#globe-city')).toHaveValue('');
 // animated, unless the visitor asked for reduced motion: ~600 ms with in-between altitudes, versus a jump
 const trace=async()=>{const t0=Date.now(),seen=[];let last='';while(Date.now()-t0<1400){const v=(await camera(page)).alt;if(v!==last){seen.push([Date.now()-t0,v]);last=v;}await page.waitForTimeout(25);}return seen;};
 await page.emulateMedia({reducedMotion:'no-preference'});const from=(await settle(page)).alt;await zin.click();const anim=await trace();
 await page.emulateMedia({reducedMotion:'reduce'});await zout.click();const jump=await trace();
 console.log('animated + (ms, alt)',JSON.stringify(anim),' reduced-motion − (ms, alt)',JSON.stringify(jump));
 const to=anim.at(-1)[1];expect(to).toBeLessThan(from);expect(anim.some(([,a])=>a<from&&a>to),'in-between altitudes while it flies').toBe(true);expect(anim.at(-1)[0],'the flight takes ~600 ms').toBeGreaterThan(400);
 expect(jump.filter(([,a])=>a!==to&&a!==from),'no in-between altitudes with reduced motion').toEqual([]);expect(jump.at(-1)[1]).toBeCloseTo(alt0,2);expect(jump.at(-1)[0],'jumps at once').toBeLessThan(400);
 console.log('PASS zoom: + / − step the altitude and keep lat/lng, limits disable (focus kept), reset returns to the opening view, Tab/Enter work with an orange ring, wheel still scrolls the page, trackpad pinch zooms, stars split when zoomed in, taps keep the zoom, controls clear of card/tools, reduced motion jumps');
}
async function phoneSuite(browser,user,errors){
 // 390 × 844, a touch phone: two-finger pinch zooms (within the same limits); one finger on the disc turns the globe, in the frame's corners it scrolls the page
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
 try{
  await ctx.addInitScript(({key,session})=>{if(!sessionStorage.getItem('tl-qa-seeded')){localStorage.setItem(key,JSON.stringify(session));sessionStorage.setItem('tl-qa-seeded','1');}},{key:`sb-${ref}-auth-token`,session:user.session});
  const p=await ctx.newPage();p.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR (phone)',e.message);});
  await p.goto(`${root}/alumni-portal/home?sample=1`);await expect(p.locator('.portal-globe-wrap')).toHaveAttribute('data-ready','true',{timeout:15000});
  const center=()=>p.evaluate(()=>document.querySelector('.portal-globe-wrap').scrollIntoView({block:'center'}));await center();let c=await settle(p);const alt0=c.alt;
  const btn=await p.getByRole('button',{name:'Zoom in'}).boundingBox();expect([Math.round(btn.width),Math.round(btn.height)],'44 px touch targets').toEqual([44,44]);
  await controlsClear(p,'390 opening');await p.screenshot({path:`${out}/zoom-390-open.png`});
  const cdp=await ctx.newCDPSession(p);
  const bare=async(fy)=>p.evaluate((fy)=>{const r=document.querySelector('.portal-globe-wrap').getBoundingClientRect();const y=r.top+r.height*fy;for(const d of [60,50,40,70]){const xs=[r.left+r.width/2-d,r.left+r.width/2+d];if(xs.every(x=>document.elementFromPoint(x,y)?.tagName==='CANVAS'))return {cx:r.left+r.width/2,y};}return null;},fy);
  const pinch=async(at,d0,d1)=>{const pts=(d)=>[{x:at.cx-d,y:at.y,id:0},{x:at.cx+d,y:at.y,id:1}];await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pts(d0)});for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pts(d0+(d1-d0)*i/12)});await p.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return settle(p);};
  let at=null;for(const fy of [.78,.7,.62,.3])if(!at)at=await bare(fy);expect(at,'two bare spots on the disc for a pinch').not.toBeNull();
  const y0=await p.evaluate(()=>scrollY);c=await pinch(at,20,110);console.log('phone pinch out → altitude',alt0,'→',c.alt);
  expect(c.alt,'two-finger pinch zooms in').toBeLessThan(alt0);expect(await p.evaluate(()=>scrollY),'a pinch does not scroll').toBe(y0);await expect(p.getByRole('button',{name:'Zoom out'})).toBeEnabled();
  for(let i=0;i<3;i++){at=null;await center();for(const fy of [.78,.7,.62,.3])if(!at)at=await bare(fy);if(at)c=await pinch(at,15,140);}
  expect(c.alt,'pinch stops at the closest zoom').toBeGreaterThanOrEqual(0.245);
  await center();at=null;for(const fy of [.78,.7,.62,.3,.5])if(!at)at=await bare(fy);c=await pinch(at,140,10);c=await pinch(at,140,10);
  expect(c.alt,'pinch stops at the opening zoom').toBeLessThanOrEqual(alt0+0.01);
  // one finger
  const swipe=async(x,y)=>{const s0=await p.evaluate(()=>scrollY),v0=(await camera(p)).raw;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:0}]});for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*10,id:0}]});await p.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(p);return {scrolled:(await p.evaluate(()=>scrollY))-s0,turned:(await camera(p)).raw!==v0};};
  await center();let r=await p.locator('.portal-globe-wrap').boundingBox();const corner=await swipe(r.x+8,r.y+r.height-8);
  await center();r=await p.locator('.portal-globe-wrap').boundingBox();at=null;for(const fy of [.78,.7,.62,.3])if(!at)at=await bare(fy);const disc=await swipe(at.cx-40,at.y);
  console.log('phone one-finger swipe: corner',JSON.stringify(corner),'disc',JSON.stringify(disc));
  expect(corner.scrolled,'one finger in a corner scrolls the page').toBeGreaterThan(0);expect(disc.turned,'one finger on the disc turns the globe').toBe(true);
  // taps on the buttons; then a card (a bottom sheet here) sends the controls to the top corner
  await p.getByRole('button',{name:'Reset view'}).tap();c=await settle(p);expect(c.alt).toBeCloseTo(alt0,2);
  await p.getByRole('button',{name:'Zoom in'}).tap();await p.getByRole('button',{name:'Zoom in'}).tap();c=await settle(p);expect(c.alt).toBeLessThan(alt0);
  await center();await p.screenshot({path:`${out}/zoom-390-in.png`});await controlsClear(p,'390 zoomed in');
  await p.locator('#globe-city').selectOption('austin|tx');await expect(p.locator('.portal-globe-place h3')).toHaveText('AUSTIN, TX');await center();await settle(p);
  const zb=await p.locator('.portal-globe-zoom').boundingBox(),wb=await p.locator('.portal-globe-wrap').boundingBox();expect(zb.y-wb.y,'controls at the top while the bottom sheet is open').toBeLessThan(20);
  await controlsClear(p,'390 card open');await p.screenshot({path:`${out}/zoom-390-card.png`});
  console.log('PASS phone zoom: 44 px buttons, pinch zooms within the limits without scrolling, one finger turns the disc and scrolls in the corners, taps zoom/reset, controls clear of the card');
 }finally{await ctx.close();}
}

const root='http://localhost:4321',out='test-results/globe-elements';mkdirSync(out,{recursive:true});
const user={session:{access_token:'local-visual-fixture',refresh_token:'local-visual-fixture',expires_at:4102444800,user:{id:'fixture',email:'fixture@example.com'}}};
const browser=await chromium.launch();const errors=[];
const originalContext=browser.newContext.bind(browser);
browser.newContext=async(...args)=>{const ctx=await originalContext(...args);await ctx.route('https://ackmhqxyxnceoarbhcrp.supabase.co/**',async r=>{const u=new URL(r.request().url());await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(u.pathname.endsWith('/profiles')?[{full_name:'Fixture',approved:true,divisions:['TECH']}]:[])});});return ctx;};
try {const {page}=await signInPage(browser,user);page.on('pageerror',e=>errors.push(e.message));await page.goto(`${root}/alumni-portal/home?sample=1`);await expect(page.locator('.portal-globe-wrap')).toHaveAttribute('data-ready','true',{timeout:20000});await settle(page);
// Turn away first so the original suite's reset click is enabled.
await page.locator('#globe-city').selectOption('singapore|');await settle(page);await page.getByRole('button',{name:'Clear the selection'}).click();await zoomSuite(page,1.9);await phoneSuite(browser,user,errors);expect(errors).toEqual([]);
}finally{await browser.close();}
