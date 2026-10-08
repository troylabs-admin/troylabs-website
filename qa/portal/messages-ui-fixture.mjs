/** Fully offline browser fixture. Every external request is fulfilled locally, including auth, SMS,
 * welcome-backlog, analytics and message mutations. No accounts, sends or database writes are made. */
const REF = 'ackmhqxyxnceoarbhcrp';
const id = '00000000-0000-4000-8000-000000000001';
const user = { id, email: 'messages-admin@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:id,role:'authenticated',aud:'authenticated',exp:4102444800})).toString('base64url'),'fixture-signature'].join('.');
const session = { access_token:token,refresh_token:'fixture-refresh',expires_in:3600000,expires_at:4102444800,token_type:'bearer',user };
const person = (n,name,patch={}) => ({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,full_name:name,approved:true,is_test:true,status:'alum',grad_year:2024,join_year:2022,join_term:'FA',divisions:['TECH'],industries:['AI'],city_id:1,city:{id:1,name:'Los Angeles',region:'CA',country:'US',lat:34,lng:-118},linkedin_url:'https://www.linkedin.com/in/fixture',phone:`+121355501${String(70+n).padStart(2,'0')}`,phone_opt_in:true,personal_email:`person${n}@example.com`,email_opt_in:true,created_at:'2026-01-01T00:00:00Z',...patch});
export async function createMessagesFixture(browser, { base=process.env.PORTAL_URL||'http://localhost:4399', viewport={width:390,height:844}, failLoads=false }={}) {
 const context=await browser.newContext({viewport,reducedMotion:'reduce',timezoneId:'America/Los_Angeles'});
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${REF}-auth-token`,session});
 const profile=person(1,'Morgan Admin',{personal_email:user.email,phone_opt_in:false});
 const people=[profile,
  person(2,'Alexandra Longlastname',{divisions:['TECH','BUILD','PRODUCT MANAGEMENT']}),
  person(3,'Jamie Student',{status:'student',grad_year:2029,divisions:['BUILD'],join_term:'SP',join_year:2026,industries:['Climate']}),
  person(4,'Taylor Opted Out',{phone_opt_in:false,email_opt_in:false}),
  person(5,'Robin Shared Phone',{divisions:['BUILD'],phone:'+12135550172'}),
  person(6,'Casey No Number',{phone:null}),
  person(7,'Unapproved Applicant',{approved:false}),
  person(8,'Production Member',{is_test:false}),
  person(9,'Riley Build Alum',{divisions:['BUILD'],industries:['Climate']}),
 ];
 const shape={send_by:'text',audience:{mode:'groups',profile_ids:[],cells:[{group:'TECH',who:'alumni'}]},event:null,state:'draft',scheduled_for:null,sent_at:null,updated_at:'2026-10-06T10:00:00Z',sent_count:0,failed_count:0,last_error:null};
 const state={people,calls:[],writes:[],errors:[],dialogs:[],failLoads,functionError:null,writeError:null,writeDelay:0,functionDelay:0,textConfigured:true,nextId:900004,messages:[{...shape,id:900001,title:'Ordinary saved draft',body:'An announcement for our alumni.'},{...shape,id:900002,title:'Tomorrow invitation',body:'Come to Demo Night.',state:'scheduled',scheduled_for:'2030-10-08T17:00:00Z'},{...shape,id:900003,title:'Past text',body:'Thanks for coming.',state:'sent',sent_count:1,sent_at:'2026-10-06T10:00:00Z'}]};
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin===new URL(base).origin)return route.continue();
  const json=(body,status=200,extra={})=>route.fulfill({status,json:body,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',...extra}});
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'}});
  if(url.pathname.startsWith('/auth/v1'))return json(url.pathname.endsWith('/user')?user:session);
  if(url.pathname.endsWith('/functions/v1/send-message')){
   const body=req.postDataJSON();state.calls.push(body);
   if(body.mode==='status')return json({email:{configured:true,testMode:false,from:'TroyLabs'},text:{configured:state.textConfigured,from:'+12135550100',trial:false,error:null,hoursOpen:true}});
   if(body.mode==='welcome-backlog')return json({people:[],sent:0});
   if(state.functionDelay)await new Promise(resolve=>setTimeout(resolve,state.functionDelay));
   if(state.functionError)return json({error:state.functionError},503);
   if(body.mode==='test')return json({text:profile.phone});
   if(body.mode==='send'){const msg=state.messages.find(m=>m.id===body.messageId);if(msg){msg.state='sent';msg.sent_at=new Date().toISOString();msg.sent_count=1;}}
   return json({sent:1,failed:0});
  }
  if(url.pathname.endsWith('/rest/v1/profiles')){
   if(req.method()==='HEAD')return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-range':'0-0/0'}});
   if(req.method()!=='GET')return json(profile);
   if(url.searchParams.has('id'))return json(profile);
   if(state.failLoads)return json({message:'Fixture roster unavailable',code:'XX000'},503);
   return json(people);
  }
  if(url.pathname.endsWith('/rest/v1/admins'))return json({user_id:id});
  if(url.pathname.endsWith('/rest/v1/rpc/viewer_is_test'))return json(true);
  if(url.pathname.endsWith('/rest/v1/messages')){
   if(req.method()==='GET')return json(state.messages);
   if(state.writeDelay)await new Promise(resolve=>setTimeout(resolve,state.writeDelay));
   if(state.writeError)return json({message:state.writeError,code:'XX000'},503);
   const body=req.method()==='DELETE'?{}:req.postDataJSON(),key=Number(url.searchParams.get('id')?.replace('eq.',''))||state.nextId++;
   state.writes.push({method:req.method(),body,id:key});const old=state.messages.find(m=>m.id===key)||shape,row={...old,...body,id:key};state.messages=state.messages.filter(m=>m.id!==key);if(req.method()!=='DELETE')state.messages.push(row);return json(row);
  }
  if(url.pathname.endsWith('/rest/v1/message_recipients'))return json([{message_id:900003,profile_id:people[1].id,channel:'text',phone:people[1].phone,email:null,status:'delivered',delivered_at:'2026-10-06T10:00:01Z',error:null}]);
  if(url.pathname.endsWith('/rest/v1/eboard_roles'))return json([]);
  return json({});
 });
 const page=await context.newPage();page.on('pageerror',e=>state.errors.push(e.message));page.on('dialog',d=>{state.dialogs.push(d.message());return d.accept();});
 return {page,context,state,base};
}
