/** Offline 500-member UI regression. All remote requests and mutations are mocked. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
import {createApprovalsFixture} from './approvals-ui-fixture.mjs';
const browser=await chromium.launch(),failures=[],out='test-results/member-pagination';
const rows=p=>p.locator('[data-members] tbody tr[data-id]');
const next=p=>p.locator('[data-member-next]').first(),prev=p=>p.locator('[data-member-prev]').first();
const check=async(name,work,options={})=>{const f=await createApprovalsFixture(browser,{members:500,pending:0,...options});try{
 if(options.setup)options.setup(f.state);await f.page.goto(`${f.base}/alumni-portal/admin/users`);await expect(rows(f.page)).toHaveCount(options.viewport?.width<768?10:20,{timeout:15000});await work(f);assert.deepEqual(f.state.errors,[]);console.log(`PASS: ${name}`);
}catch(e){failures.push(`${name}: ${e.message}`);console.error(`FAIL: ${name}: ${e.message}`);}finally{await f.context.close();}};
try{
 await check('500 members load only20 with admins first and bounded pending fetch',async({page,state})=>{
  await expect(page.locator('[data-members-count]')).toContainText('1–20 of 500');await expect(page.locator('[data-page-label]').first()).toHaveText('Page 1 of 25');await expect(prev(page)).toBeDisabled();
  assert.deepEqual((await page.locator('[data-members] .portal-name-link').allTextContents()).slice(0,3),['Morgan Admin','Zoe Admin','Aaron Member']);assert.equal(state.memberCalls.length,1);assert.equal(state.memberCalls[0].p_page_size,20);assert.ok(state.queueCalls.every(c=>c.approved==='eq.false'&&Number(c.limit)<=100));
 });
 await check('Next Previous change server page without repeated or missing rows',async({page,state})=>{
  const first=await rows(page).evaluateAll(es=>es.map(e=>e.dataset.id));await next(page).click();await expect(page.locator('[data-page-label]').first()).toHaveText('Page 2 of 25');const second=await rows(page).evaluateAll(es=>es.map(e=>e.dataset.id));assert.equal(first.filter(id=>second.includes(id)).length,0);assert.equal(state.memberCalls.at(-1).p_page,2);await prev(page).click();await expect(page.locator('[data-page-label]').first()).toHaveText('Page 1 of 25');assert.deepEqual(await rows(page).evaluateAll(es=>es.map(e=>e.dataset.id)),first);
 });
 await check('search finds member500 beyond firstpage and clears to firstpage',async({page,state})=>{
  await next(page).click();await expect(page.locator('[data-page-label]').first()).toContainText('Page 2');await page.locator('#members-q').fill('Last Company');await expect(rows(page)).toHaveCount(1);await expect(rows(page)).toContainText('Member 500');assert.equal(state.memberCalls.at(-1).p_search,'Last Company');assert.equal(state.memberCalls.at(-1).p_page,1);await expect(next(page)).toBeDisabled();await page.locator('#members-q').fill('');await expect(rows(page)).toHaveCount(20);await expect(page.locator('[data-members-count]')).toContainText('of 500');
 });
 await check('status cohort division filters run server-side and clear together',async({page,state})=>{
  await page.locator('.member-filter-fold > summary').click();await page.locator('[data-filter="status"] [data-value="STUDENT"]').click();await expect(page.locator('[data-members-count]')).toContainText('of 249');await page.locator('[data-filter="cohort"] [data-value="SP24"]').click();await page.locator('[data-filter="division"] [data-value="BUILD"]').click();await expect(page.locator('[data-members-count]')).toContainText('of 83');
  const args=state.memberCalls.at(-1);assert.deepEqual(args.p_statuses,['student']);assert.deepEqual(args.p_cohorts,['SP24']);assert.deepEqual(args.p_divisions,['BUILD']);await expect(rows(page).locator('.m-status')).toHaveText(Array(20).fill('STUDENT'));
  await page.locator('[data-member-clear]').click();await expect(page.locator('[data-members-count]')).toContainText('of 500');await expect(page.locator('[data-member-query] [aria-pressed="true"]')).toHaveCount(0);
 });
 await check('no results leaves an honest empty state and disabled paging',async({page})=>{await page.locator('#members-q').fill('Absolutely nobody');await expect(rows(page)).toHaveCount(0);await expect(page.locator('[data-members-count]')).toContainText('No members match');await expect(next(page)).toBeDisabled();await expect(prev(page)).toBeDisabled();});
 await check('late search response cannot replace a newer result',async({page,state})=>{
  state.memberDelay['Member']=800;await page.locator('#members-q').fill('Member');await expect.poll(()=>state.memberCalls.some(c=>c.p_search==='Member')).toBe(true);await page.locator('#members-q').fill('Last Company');await expect(rows(page)).toHaveCount(1);await expect(rows(page)).toContainText('Member 500');await page.waitForTimeout(900);await expect(rows(page)).toHaveCount(1);await expect(rows(page)).toContainText('Member 500');
 });
 await check('export fetches all500 filtered rows instead of onlythe current20',async({page,state})=>{
  const result=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const dl=await result;const csv=readFileSync(await dl.path(),'utf8');assert.equal(csv.trim().split('\n').length,501);assert.ok(csv.includes('Member 500'));await expect(page.locator('#members-fb')).toContainText('Exported 500');assert.equal(state.memberCalls.filter(c=>c.p_page_size===100).length,5);
 });
 await check('search export contains onlymatchingmember and escapes CSV',async({page,state})=>{
  await page.locator('#members-q').fill('Last Company');await expect(rows(page)).toHaveCount(1);const download=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const csv=readFileSync(await(await download).path(),'utf8');assert.equal(csv.trim().split('\n').length,2);assert.ok(csv.includes('Member 500'));assert.equal(state.memberCalls.at(-1).p_search,'Last Company');
 });
 await check('leaving and returning during export cannot disable or update the new page',async({page,state})=>{
  const downloads=[];page.on('download',d=>downloads.push(d));state.memberExportDelay=1800;
  await page.evaluate(()=>window.__membersNavigationMarker=true);await page.locator('[data-action="export"]').click();await expect.poll(()=>state.memberCalls.some(c=>c.p_page_size===100)).toBe(true);
  await page.getByRole('link',{name:'SEARCH',exact:true}).click();await expect(page).toHaveURL(/\/alumni-portal\/home\/?$/);await page.goBack();await expect(rows(page)).toHaveCount(20);assert.equal(await page.evaluate(()=>window.__membersNavigationMarker),true);
  await page.waitForTimeout(2000);await expect(page.locator('[data-action="export"]')).toBeEnabled();await expect(page.locator('#members-fb')).toHaveText('');assert.equal(downloads.length,0);
  state.memberExportDelay=0;await page.locator('#members-q').fill('Last Company');await expect(rows(page)).toHaveCount(1);const download=page.waitForEvent('download');await page.locator('[data-action="export"]').click();await download;await expect(page.locator('#members-fb')).toContainText('Exported 1 member');
 });
 await check('export rejects a roster count change without downloading a partial file',async({page,state})=>{
  const downloads=[];page.on('download',d=>downloads.push(d));state.beforeMemberPage=args=>{if(args.p_page_size===100&&args.p_page===2)state.profiles.at(-1).approved=false;};await page.locator('[data-action="export"]').click();await expect(page.locator('#members-fb')).toContainText('Couldn’t export all matching members');await expect(page.locator('[data-action="export"]')).toBeEnabled();assert.equal(downloads.length,0);
 });
 await check('export rejects duplicate page rows caused by changed ordering',async({page,state})=>{
  const downloads=[];page.on('download',d=>downloads.push(d));state.beforeMemberPage=args=>{if(args.p_page_size===100&&args.p_page===2)state.profiles.at(-1).full_name='AA changed member';};await page.locator('[data-action="export"]').click();await expect(page.locator('#members-fb')).toContainText('Couldn’t export all matching members');await expect(page.locator('[data-action="export"]')).toBeEnabled();assert.equal(downloads.length,0);
 });
 await check('loadfailure cannot looklike emptydatabase and Retry recovers',async({page,state})=>{
  state.memberError=true;await next(page).click();await expect(page.locator('[data-member-retry]')).toBeVisible();await expect(page.locator('[data-action="export"]')).toBeDisabled();state.memberError=false;await page.locator('[data-member-retry]').click();await expect(rows(page)).toHaveCount(20);await expect(page.locator('[data-page-label]').first()).toContainText('Page 2');
 });
 await check('member edit and eboardroles work on laterpages',async({page})=>{
  await next(page).click();await expect(page.locator('[data-page-label]').first()).toContainText('Page 2');const row=rows(page).first(),id=await row.getAttribute('data-id');await expect(row.locator('a').last()).toHaveAttribute('href',`/alumni-portal/profile?id=${id}`);await row.locator('[data-roles-for]').click();await expect(page.locator('.portal-row-detail')).toContainText(await row.locator('.portal-name-link').innerText());await row.locator('[data-roles-for]').click();await expect(page.locator('.portal-row-detail')).toHaveCount(0);
 });
 await check('application load failure does not block the member directory',async({page,state})=>{
  await expect(page.locator('#requests-list')).toContainText('Couldn’t load applications');await expect(page.locator('[data-q-bar]')).toBeHidden();await expect(page.locator('[data-members-count]')).toContainText('of 500');
 },{setup:s=>s.queueError=true});
 await check('later-page admin promotion sorts globally and roles persist after paging',async({page,state})=>{
  await next(page).click();await expect(page.locator('[data-page-label]').first()).toContainText('Page 2');const row=rows(page).first(),id=await row.getAttribute('data-id');await row.locator('[data-admin-toggle]').click();await expect.poll(()=>state.adminWrites.length).toBe(1);await expect(page.locator('[data-page-label]').first()).toContainText('Page 2');await prev(page).click();await expect(page.locator('[data-page-label]').first()).toContainText('Page 1');
  const promoted=page.locator(`[data-members] tr[data-id="${id}"]`);await expect(promoted).toBeVisible();await expect(promoted.locator('[data-admin-toggle]')).toHaveText('REMOVE ADMIN');await promoted.locator('[data-roles-for]').click();await page.locator('.portal-row-detail [data-field="eboard"] button').first().click();await page.locator('.portal-row-detail input[aria-label="Year"]').fill('2026');await page.locator('.portal-row-detail [data-action="save-roles"]').click();await expect.poll(()=>state.roleWrites.length).toBe(1);assert.equal(state.roleWrites[0].target_profile,id);
  await next(page).click();await expect(page.locator('[data-page-label]').first()).toContainText('Page 2');await prev(page).click();await expect(promoted).toBeVisible();await promoted.locator('[data-roles-for]').click();await expect(page.locator('.portal-row-detail input[aria-label="Year"]')).toHaveValue('2026');
 });
 await check('removing the only last-page member clamps back to a valid page',async({page,state})=>{
  await next(page).click();await expect(rows(page)).toHaveCount(1);const id=await rows(page).getAttribute('data-id');await rows(page).locator('[data-remove]').click();await expect(page.locator('[data-page-label]').first()).toHaveText('Page 1 of 1');await expect(rows(page)).toHaveCount(20);assert.equal(state.profiles.find(p=>p.id===id).approved,false);assert.equal(state.dialogs.length,1);await expect(next(page)).toBeDisabled();
 },{members:21});
 await check('resizing between tablet and phone requests the right page size',async({page,state})=>{
  await next(page).click();await expect(page.locator('[data-page-label]').first()).toContainText('Page 2');await page.setViewportSize({width:390,height:900});await expect(rows(page)).toHaveCount(10);await expect(page.locator('[data-page-label]').first()).toHaveText('Page 1 of 50');assert.equal(state.memberCalls.at(-1).p_page_size,10);await page.setViewportSize({width:768,height:900});await expect(rows(page)).toHaveCount(20);await expect(page.locator('[data-page-label]').first()).toHaveText('Page 1 of 25');
 });
 await check('role editor remains usable at 320px',async({page})=>{
  await rows(page).nth(2).locator('[data-roles-for]').click();await page.locator('.portal-row-detail [data-field="eboard"] button').first().click();await page.locator('.portal-row-detail input[aria-label="Year"]').fill('2026');await page.locator('.portal-row-detail [data-action="save-roles"]').click();await expect(page.locator('.portal-row-detail .portal-feedback')).toContainText('Saved: 1 semester');const bad=await page.locator('.portal-row-detail *').evaluateAll(es=>es.filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left<0||r.right>innerWidth+1)}).map(e=>e.className));assert.deepEqual(bad,[]);
 },{viewport:{width:320,height:900}});
 for(const width of [320,390,768,1024,1440])await check(`500-member layout and paging ${width}px`,async({page})=>{
  const size=width<768?10:20;await expect(page.locator('[data-members-count]')).toContainText(`1–${size} of 500`);await expect(page.locator('.member-filter-fold')).not.toHaveAttribute('open','');
  const overflow=()=>page.evaluate(()=>[...document.querySelectorAll('.portal-member-admin *')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left< -1||r.right>innerWidth+1);}).map(el=>({class:el.className,text:el.textContent.slice(0,40)})));
  assert.deepEqual(await overflow(),[]);mkdirSync(out,{recursive:true});await page.screenshot({path:`${out}/members-${width}.png`,fullPage:true});await page.locator('#members').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:`${out}/directory-${width}.png`});
  await page.locator('.member-filter-fold > summary').click();assert.deepEqual(await overflow(),[]);await page.screenshot({path:`${out}/filters-${width}.png`});await next(page).click();await expect(page.locator('[data-page-label]').first()).toContainText('Page 2');await expect(rows(page)).toHaveCount(size);
 },{viewport:{width,height:900},pending:2});
}finally{await browser.close();}
assert.deepEqual(failures,[]);console.log('PASS: all23 checks use synthetic data and mocked writes only.');
