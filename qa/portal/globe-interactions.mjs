import { chromium, expect } from '@playwright/test';
import { adminClient, makeUser, signInPage } from './helpers.mjs';
import { mkdirSync } from 'node:fs';
const admin=adminClient();let user,browser;const root=(process.env.PORTAL_URL || 'http://127.0.0.1:4321');const out='test-results/globe';mkdirSync(out,{recursive:true});
try {
 user=await makeUser(admin,'Globe Interaction QA');browser=await chromium.launch();const {page}=await signInPage(browser,user);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('requestfailed',r=>console.log('REQUEST FAILED',r.url().split('?')[0],r.failure()?.errorText));
 await page.goto(`${root}/alumni-portal/home?sample=1`);await expect(page.locator('.portal-globe-wrap')).toHaveAttribute('data-ready','true',{timeout:15000});
 await expect(page.locator('.portal-explore-stats')).toContainText('463 PEOPLE');
 await expect(page.locator('#globe-city option')).toHaveCount(21);
 // NYC, Boston, Philadelphia, Washington and Toronto form a 42-person cluster at this viewport.
 await expect(page.locator('.tl-star[data-seed="new york|ny"]')).toHaveAttribute('data-count','42');
 await expect(page.locator('.tl-star[data-seed="new york|ny"] .tl-star-n')).toHaveText('42');
 expect(await page.locator('#globe-city option').evaluateAll(xs=>xs.slice(1).reduce((n,x)=>n+Number(x.textContent.split(' · ').at(-1)),0))).toBe(463);
 await page.locator('#globe-city').selectOption('singapore|');await expect(page.locator('.portal-globe-place h3')).toHaveText('SINGAPORE');await expect(page.locator('.portal-results-count')).toContainText('3 people');
 await page.locator('#globe-city').selectOption('mexico city|mx');await expect(page.locator('.portal-globe-pop')).toContainText('Sample Alum 463');await expect(page.locator('.portal-results-count')).toContainText('1 person');
 await page.locator('[data-filter="division"] [data-value="TECH"]').click();await expect(page.locator('.portal-explore-stats')).toContainText('0 LEFT');await expect(page.getByRole('button',{name:'Remove the place'})).toBeVisible();
 await page.getByRole('button',{name:'Remove the place'}).click();await expect(page.locator('.portal-card').first()).toBeVisible();await page.getByRole('button',{name:'CLEAR ALL',exact:true}).click();
 await page.getByRole('button',{name:'BROWSE ALL MEMBERS'}).click();await expect(page.locator('.portal-card')).toHaveCount(24);await page.getByRole('button',{name:/SHOW 24 MORE/}).click();await expect(page.locator('.portal-card')).toHaveCount(48);
 await page.getByRole('button',{name:'CLEAR ALL',exact:true}).click();await page.locator('.portal-globe-wrap').scrollIntoViewIfNeeded();
 const before=await page.locator('.portal-globe-wrap').getAttribute('data-view');await page.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(page.locator('.portal-globe-wrap')).not.toHaveAttribute('data-view',before);
 const box=await page.locator('.portal-globe-wrap').boundingBox();const dragBefore=await page.locator('.portal-globe-wrap').getAttribute('data-view');await page.mouse.move(box.x+box.width*.6,box.y+box.height*.68);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.7,{steps:15});await page.mouse.up();await expect(page.locator('.portal-globe-wrap')).not.toHaveAttribute('data-view',dragBefore);
 await page.waitForTimeout(2500);const wheelBefore=await page.locator('.portal-globe-wrap').getAttribute('data-view');const scrollBefore=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,160);await page.waitForTimeout(500);expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(scrollBefore);expect(await page.locator('.portal-globe-wrap').getAttribute('data-view')).toBe(wheelBefore);
 // Failed texture must leave an actionable city directory, not a blank area.
 await page.route('**/maps/alumni-earth.png',r=>r.abort());await page.goto(`${root}/alumni-portal/home?sample=1`);await expect(page.getByRole('status')).toContainText('unavailable');await page.locator('#globe-city').selectOption('singapore|');await expect(page.locator('.portal-results-count')).toContainText('3 people');await page.screenshot({path:`${out}/fallback.png`,fullPage:true});await page.unroute('**/maps/alumni-earth.png');
 // Real profile strings must remain text in DOM markers.
 const name='<img src=x onerror="window.qaInjected=1">';await admin.from('profiles').update({full_name:name}).eq('id',user.id);await page.goto(`${root}/alumni-portal/home`);await expect(page.locator('.tl-star')).toBeAttached();expect(await page.locator('.tl-star img').count()).toBe(0);expect(await page.evaluate(()=>window.qaInjected)).toBeUndefined();
 // Empty search never widens a selected place; empty network and read failures have explicit states.
 await page.locator('#search-q').fill('no-such-member-qa');await expect(page.locator('.portal-explore-stats')).toContainText('0 LEFT');await expect(page.locator('.tl-star')).toHaveCount(0);
 await page.route('**/rest/v1/profiles?*',r=>r.request().url().includes('approved=eq.true')?r.fulfill({status:400,contentType:'application/json',body:'{"message":"QA unavailable"}'}):r.continue());await page.reload();await expect(page.getByRole('alert')).toContainText('Could not refresh');await page.unroute('**/rest/v1/profiles?*');await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByRole('alert')).toHaveCount(0);
 const noWebgl=await chromium.launch({args:['--disable-webgl']});try { const {page: fallback}=await signInPage(noWebgl,user);await fallback.goto(`${root}/alumni-portal/home?sample=1`);await expect(fallback.getByRole('status')).toContainText('unavailable',{timeout:15000});await fallback.locator('#globe-city').selectOption('tokyo|jp');await expect(fallback.locator('.portal-results-count')).toContainText('2 people');console.log('PASS WebGL-disabled city directory');}finally{await noWebgl.close();}
 expect(errors).toEqual([]);console.log('PASS: city navigation, counts, filtering, retained empty place, pagination, zoom, drag, wheel scrolling, texture fallback, safe labels, empty search, failed read/retry; no page errors.');
}finally{if(browser)await browser.close();if(user)await user.cleanup();}
