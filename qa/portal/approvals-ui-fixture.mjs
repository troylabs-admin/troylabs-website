/** Offline Members/approvals fixture: every remote request is answered locally. Never creates
 * accounts or invokes real approval RPCs, notification functions, or database mutations. */
const REF = 'ackmhqxyxnceoarbhcrp';
const idOf = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const adminId = idOf(1);
const user = { id: adminId, email: 'approvals-admin@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: adminId, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })).toString('base64url'), 'fixture-signature'].join('.');
const session = { access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600000, expires_at: 4102444800, token_type: 'bearer', user };
const person = (n, name, patch = {}) => ({ id: idOf(n), full_name: name, approved: true, declined_at: null, submitted_at: '2026-10-01T09:00:00Z', is_test: true, status: 'alum', grad_year: 2024, join_year: 2022, join_term: 'FA', divisions: ['TECH'], industries: [], startups: [], claimed_roles: [], city_id: 1, city: { id: 1, name: 'Los Angeles', region: 'CA', country: 'US', lat: 34, lng: -118 }, linkedin_url: 'https://www.linkedin.com/in/fixture', phone: '+12135550171', phone_opt_in: false, personal_email: `person${n}@example.com`, usc_email: null, email_opt_in: true, avatar_path: null, current_title: 'Designer', current_company: 'Example Studio', request_note: null, created_at: `2026-10-01T09:${String(n % 60).padStart(2, '0')}:00Z`, updated_at: '2026-10-01T09:00:00Z', ...patch });
export async function createApprovalsFixture(browser, { base = process.env.PORTAL_URL || 'http://localhost:4399', viewport = { width: 1440, height: 1000 }, pending = 30, members = 3 } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${REF}-auth-token`, session });
  const profiles = [person(1, 'Morgan Admin', { personal_email: user.email }), person(2, 'Zoe Admin', { city: null, city_id: null, phone: null, linkedin_url: null }), person(3, 'Aaron Member')];
  for (let i = 0; i < pending; i++) profiles.push(person(100 + i, `${i % 2 ? 'Build' : 'Tech'} Applicant ${String(i + 1).padStart(2, '0')}`, { approved: false, divisions: [i % 2 ? 'BUILD' : 'TECH'], request_note: i === 0 ? 'I helped organize our autumn showcase and would love to reconnect.' : null, claimed_roles: i === 0 ? [{ role: 'DIRECTOR OF TECH', term: 'FA', year: 2022 }] : [] }));
  for(let n=3;n<members;n++)profiles.push(person(1000+n,`Member ${String(n+1).padStart(3,'0')}`,{status:n%2?'student':'alum',join_term:n%2?'SP':'FA',join_year:n%2?2024:2022,divisions:[n%3?'TECH':'BUILD'],current_company:n===members-1?'Last Company':'Example Studio'}));
  const adminIds = [adminId, idOf(2)];
  const state = { profiles, adminIds, approvals: [], declines: [], notifications: [], writes: [], dialogs: [], errors: [], memberCalls: [], queueCalls: [], memberDelay: {}, memberExportDelay: 0, beforeMemberPage: null, memberError: false, queueError: false, roleWrites: [], roleRows: [], adminWrites: [], rpcDelay: 0, rpcCount: null, notifyDelay: 0, rpcError: null, notifyError: null };
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === new URL(base).origin) return route.continue();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
    const json = (body, status = 200) => route.fulfill({ status, json: body, headers });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.startsWith('/auth/v1')) return json(url.pathname.endsWith('/user') ? user : session);
    if (url.pathname.endsWith('/rest/v1/profiles')) {
      if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { ...headers, 'content-range': `0-0/${profiles.filter(p => !p.approved && !p.declined_at).length}` } });
      if (req.method() === 'GET') {
        if(url.searchParams.has('id'))return json(profiles.find(p=>p.id===url.searchParams.get('id').replace('eq.','')));
        state.queueCalls.push(Object.fromEntries(url.searchParams));if(state.queueError)return json({message:'Fixture applications unavailable'},503);const from=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
        return json(profiles.filter(p=>url.searchParams.get('approved')==='eq.false'?!p.approved:true).slice(from,from+limit));
      }
      const body = req.postDataJSON(), filter = url.searchParams.get('id') || ''; state.writes.push({ body, filter });
      for (const p of profiles) if (filter === `eq.${p.id}` || filter.includes(p.id)) Object.assign(p, body);
      return json(null);
    }
    if(url.pathname.endsWith('/rest/v1/rpc/admin_member_page')){
      const args=req.postDataJSON();state.memberCalls.push(args);if(state.memberDelay[args.p_search])await new Promise(r=>setTimeout(r,state.memberDelay[args.p_search]));
      if(args.p_page_size===100&&state.memberExportDelay)await new Promise(r=>setTimeout(r,state.memberExportDelay));
      state.beforeMemberPage?.(args);
      if(state.memberError)return json({message:'Fixture members unavailable'},503);
      const approved=profiles.filter(p=>p.approved),cohort=p=>`${p.join_term}${String(p.join_year).slice(-2)}`;
      const filtered=approved.filter(p=>(!args.p_statuses?.length||args.p_statuses.includes(p.status))&&(!args.p_cohorts?.length||args.p_cohorts.includes(cohort(p)))&&(!args.p_divisions?.length||p.divisions.some(d=>args.p_divisions.includes(d)))&&(!args.p_search||`${p.full_name} ${p.personal_email||''} ${p.usc_email||''} ${p.current_company||''} ${p.city?.name||''} ${p.city?.region||''} ${p.divisions.join(' ')}`.toLowerCase().includes(args.p_search.toLowerCase()))).sort((a,b)=>Number(adminIds.includes(b.id))-Number(adminIds.includes(a.id))||a.full_name.toLowerCase().localeCompare(b.full_name.toLowerCase())||a.id.localeCompare(b.id));
      const size=Math.max(1,Math.min(100,args.p_page_size||25)),page=Math.max(1,Math.min(args.p_page||1,Math.max(1,Math.ceil(filtered.length/size))));
      return json({rows:filtered.slice((page-1)*size,page*size).map(p=>({...p,is_admin:adminIds.includes(p.id),roles:state.roleRows.filter(r=>r.profile_id===p.id)})),total:filtered.length,page,page_size:size,cohorts:[...new Set(approved.map(cohort))]});
    }
    if (url.pathname.endsWith('/rest/v1/admins')) {
      if(req.method()==='POST'){const body=req.postDataJSON();state.adminWrites.push(body);if(!adminIds.includes(body.user_id))adminIds.push(body.user_id);return json(null);}
      if(req.method()==='DELETE'){const id=url.searchParams.get('user_id').replace('eq.','');state.adminWrites.push({removed:id});adminIds.splice(adminIds.indexOf(id),1);return json(null);}
      return json(url.searchParams.has('user_id') ? { user_id: adminId } : adminIds.map(user_id => ({ user_id })));
    }
    if(url.pathname.endsWith('/rest/v1/rpc/replace_eboard_roles')){const body=req.postDataJSON();state.roleWrites.push(body);state.roleRows=state.roleRows.filter(r=>r.profile_id!==body.target_profile).concat(body.new_roles.map(r=>({...r,profile_id:body.target_profile})));return json(null);}
    if (url.pathname.endsWith('/rest/v1/eboard_roles')) return json([]);
    if (url.pathname.endsWith('/rest/v1/rpc/approve_members') || url.pathname.endsWith('/rest/v1/rpc/decline_members')) {
      const { ids } = req.postDataJSON(), approve = url.pathname.endsWith('/approve_members');
      (approve ? state.approvals : state.declines).push([...ids]);
      if (state.rpcDelay) await new Promise(resolve => setTimeout(resolve, state.rpcDelay));
      if (state.rpcError) return json({ message: state.rpcError, code: 'P0001' }, 400);
      const changedIds = ids.slice(0, state.rpcCount ?? ids.length);
      for (const p of profiles) if (changedIds.includes(p.id)) { p.approved = approve; p.declined_at = approve ? null : new Date().toISOString(); }
      return json(changedIds.length);
    }
    if (url.pathname.endsWith('/functions/v1/send-message')) {
      const body = req.postDataJSON(); state.notifications.push(body);
      if (state.notifyDelay) await new Promise(resolve => setTimeout(resolve, state.notifyDelay));
      if (state.notifyError) return json({ sent: 0, texted: 0, error: state.notifyError }, 400);
      return json({ sent: body.ids?.length || 0, texted: 0 });
    }
    return json({});
  });
  const page = await context.newPage();
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('dialog', async dialog => { state.dialogs.push(dialog.message()); await dialog.accept(); });
  return { context, page, state, base };
}
