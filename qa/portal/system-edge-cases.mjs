import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
import { adminClient, makeUser, signInPage, client } from './helpers.mjs';
const admin=adminClient();let user,other,browser;const root=(process.env.PORTAL_URL || 'http://127.0.0.1:4321');const rosterEmail=`qa-roster-${crypto.randomUUID()}@usc.edu`;
const ok=(r)=>{if(r.error)throw r.error;return r.data;};
try{
 user=await makeUser(admin,'Portal Edge QA');other=await makeUser(admin,'Portal Role QA');ok(await admin.from('admins').insert({user_id:user.id}));
 const role={role:'DIRECTOR OF TECH',term:'FA',year:2025};ok(await user.sb.rpc('replace_eboard_roles',{target_profile:other.id,new_roles:[role]}));
 expect((await user.sb.rpc('replace_eboard_roles',{target_profile:other.id,new_roles:[role,role]})).error).toBeTruthy();expect(ok(await admin.from('eboard_roles').select('*').eq('profile_id',other.id))).toHaveLength(1);
 expect((await other.sb.rpc('replace_eboard_roles',{target_profile:other.id,new_roles:[]})).error).toBeTruthy();expect((await client().rpc('replace_eboard_roles',{target_profile:other.id,new_roles:[]})).error).toBeTruthy();
 expect((await user.sb.rpc('replace_eboard_roles',{target_profile:other.id,new_roles:[{...role,year:9999}]})).error).toBeTruthy();expect(ok(await admin.from('eboard_roles').select('*').eq('profile_id',other.id))).toHaveLength(1);
 console.log('PASS atomic role rollback, year validation, member/anonymous denial');
 browser=await chromium.launch();const {page}=await signInPage(browser,user);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('dialog',async d=>{console.log('DIALOG',d.message());await d.accept();});
 await page.goto(`${root}/alumni-portal/profile`);await expect(page.locator('.portal-profile [data-action="save"]')).toBeEnabled();await page.locator('#pf-bio').fill('Keep this unsaved draft while changing my picture or city.');
 await page.locator('#pf-photo').setInputFiles({name:'qa.png',mimeType:'image/png',buffer:await sharp({create:{width:120,height:80,channels:3,background:'#ff7d2c'}}).png().toBuffer()});await expect(page.locator('#pf-photo-preview')).toHaveAttribute('src', /https:.*storage.*avatar.webp/, {timeout:15000});await expect(page.locator('#pf-bio')).toHaveValue('Keep this unsaved draft while changing my picture or city.');
 const path=ok(await admin.from('profiles').select('avatar_path').eq('id',user.id).single()).avatar_path;expect(path).toBe(`${user.id}/avatar.webp`);expect((await other.sb.storage.from('avatars').upload(path,new Blob(['bad'],{type:'image/webp'}),{upsert:true})).error).toBeTruthy();
 await page.locator('#pf-loc').fill('Los Angeles, CA');await page.locator('[data-action="update"]').click();await expect(page.locator('#pf-loc-note')).toContainText('Los Angeles, CA');await expect(page.locator('#pf-bio')).toHaveValue('Keep this unsaved draft while changing my picture or city.');
 await page.locator('.portal-profile [data-action="save"]').click();await expect(page.locator('.portal-save .portal-feedback')).toContainText('Saved');await page.reload();await expect(page.locator('#pf-bio')).toHaveValue('Keep this unsaved draft while changing my picture or city.');console.log('PASS avatar upload/ownership, location update, unsaved draft preservation, profile reload');
 await page.goto(`${root}/alumni-portal/admin/users`);await expect(page.locator(`[data-roles-for="${other.id}"]`)).toBeVisible();
 await page.locator(`[data-admin-toggle="${other.id}"]`).click();await expect(page.locator(`[data-admin-toggle="${other.id}"]`)).toHaveText('REMOVE ADMIN');expect(ok(await admin.from('admins').select('*').eq('user_id',other.id))).toHaveLength(1);await page.locator(`[data-admin-toggle="${other.id}"]`).click();await expect(page.locator(`[data-admin-toggle="${other.id}"]`)).toHaveText('MAKE ADMIN');
 await page.locator(`[data-remove="${other.id}"]`).click();await expect(page.locator(`[data-members] tr[data-id="${other.id}"]`)).toHaveCount(0);expect(ok(await other.sb.from('profiles').select('id').eq('id',user.id))).toHaveLength(0);console.log('PASS admin grant/revoke, access removal enforced by RLS');
 // Simulate >5 sent messages without sending or writing any broadcast records.
 await page.route('**/rest/v1/messages?*',r=>r.request().method()==='HEAD'?r.fulfill({status:200,headers:{'content-range':'0-6/7','access-control-expose-headers':'content-range'},body:''}):r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(Array.from({length:5},()=>({title:'<img src=x onerror="window.qaInjected=1">',state:'sent',sent_at:new Date().toISOString(),updated_at:new Date().toISOString()})))}));
 await page.goto(`${root}/alumni-portal/admin`);await expect(page.locator('[data-stat="sentThisMonth"]')).toHaveText('7');expect(await page.locator('[data-recent] img').count()).toBe(0);await expect(page.locator('[data-recent]')).toContainText('<img src=x');expect(await page.evaluate(()=>window.qaInjected)).toBeUndefined();console.log('PASS full-month count independent of 5 recent messages, literal message titles');
 await page.unroute('**/rest/v1/messages?*');await page.getByRole('link',{name:'SIGN OUT',exact:true}).click();await expect(page).toHaveURL(/\/alumni-portal\/?$/);expect(await page.evaluate(()=>localStorage.getItem('sb-ackmhqxyxnceoarbhcrp-auth-token')===null)).toBe(true);
 expect(errors).toEqual([]);console.log('PASS sign out; no page errors');
}finally{
 if(browser)await browser.close();await admin.from('roster').delete().eq('usc_email',rosterEmail);if(user)await admin.storage.from('avatars').remove([`${user.id}/avatar.webp`]);for(const u of [other,user])if(u)await u.cleanup();
}
