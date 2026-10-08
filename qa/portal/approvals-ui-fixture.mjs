/** Offline Members/approvals fixture: every remote request is answered locally. Never creates
 * accounts or invokes real approval RPCs, notification functions, or database mutations. */
const REF = 'ackmhqxyxnceoarbhcrp';
const idOf = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const adminId = idOf(1);
const user = { id: adminId, email: 'approvals-admin@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: adminId, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })).toString('base64url'), 'fixture-signature'].join('.');
const session = { access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600000, expires_at: 4102444800, token_type: 'bearer', user };
const person = (n, name, patch = {}) => ({ id: idOf(n), full_name: name, approved: true, declined_at: null, submitted_at: '2026-10-01T09:00:00Z', is_test: true, status: 'alum', grad_year: 2024, join_year: 2022, join_term: 'FA', divisions: ['TECH'], industries: [], startups: [], claimed_roles: [], city_id: 1, city: { id: 1, name: 'Los Angeles', region: 'CA', country: 'US', lat: 34, lng: -118 }, linkedin_url: 'https://www.linkedin.com/in/fixture', phone: '+12135550171', phone_opt_in: false, personal_email: `person${n}@example.com`, usc_email: null, email_opt_in: true, avatar_path: null, current_title: 'Designer', current_company: 'Example Studio', request_note: null, created_at: `2026-10-01T09:${String(n % 60).padStart(2, '0')}:00Z`, updated_at: '2026-10-01T09:00:00Z', ...patch });
export async function createApprovalsFixture(browser, { base = process.env.PORTAL_URL || 'http://localhost:4399', viewport = { width: 1440, height: 1000 }, pending = 30 } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${REF}-auth-token`, session });
  const profiles = [person(1, 'Morgan Admin', { personal_email: user.email }), person(2, 'Zoe Admin', { city: null, city_id: null, phone: null, linkedin_url: null }), person(3, 'Aaron Member')];
  for (let i = 0; i < pending; i++) profiles.push(person(100 + i, `${i % 2 ? 'Build' : 'Tech'} Applicant ${String(i + 1).padStart(2, '0')}`, { approved: false, divisions: [i % 2 ? 'BUILD' : 'TECH'], request_note: i === 0 ? 'I helped organize our autumn showcase and would love to reconnect.' : null, claimed_roles: i === 0 ? [{ role: 'DIRECTOR OF TECH', term: 'FA', year: 2022 }] : [] }));
  const adminIds = [adminId, idOf(2)];
  const state = { profiles, adminIds, approvals: [], declines: [], notifications: [], writes: [], dialogs: [], errors: [], rpcDelay: 0, rpcCount: null, notifyDelay: 0, rpcError: null, notifyError: null };
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === new URL(base).origin) return route.continue();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
    const json = (body, status = 200) => route.fulfill({ status, json: body, headers });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.startsWith('/auth/v1')) return json(url.pathname.endsWith('/user') ? user : session);
    if (url.pathname.endsWith('/rest/v1/profiles')) {
      if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { ...headers, 'content-range': `0-0/${profiles.filter(p => !p.approved && !p.declined_at).length}` } });
      if (req.method() === 'GET') return json(url.searchParams.has('id') ? profiles.find(p => p.id === url.searchParams.get('id').replace('eq.', '')) : profiles);
      const body = req.postDataJSON(), filter = url.searchParams.get('id') || ''; state.writes.push({ body, filter });
      for (const p of profiles) if (filter === `eq.${p.id}` || filter.includes(p.id)) Object.assign(p, body);
      return json(null);
    }
    if (url.pathname.endsWith('/rest/v1/admins')) return json(url.searchParams.has('user_id') ? { user_id: adminId } : adminIds.map(user_id => ({ user_id })));
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
