// LinkedIn work history, end to end (2026-10-05): approval queues the import (never before), the worker replaces the
// history (re-syncing never duplicates), failures and empty scrapes keep what's saved, 30 people approved at once go
// through in batches with no one done twice even with two workers running, and only members can read it.
// Real Apify scrapes (Bryan's own public profile, ~$0.004 each) only with LINKEDIN_LIVE=1; otherwise his saved scrape
// (qa/portal/fixtures) stands in. Temporary example.com accounts only; all removed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminClient, makeUser } from './helpers.mjs';

const admin = adminClient(); const serviceKey = admin.supabaseKey;
const FN = 'https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/linkedin-sync';
const LIVE = process.env.LINKEDIN_LIVE === '1';
const BRYAN = 'https://www.linkedin.com/in/bryanrg22';
const bryanScrape = JSON.parse(readFileSync(new URL('./fixtures/linkedin-bryanrg22.json', import.meta.url), 'utf8'));
const call = async (body, bearer = serviceKey) => { const r = await fetch(FN, { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
const worker = (fixture) => call({ mode: 'worker', ...(fixture ? { fixture } : {}) });
const jobs = async (id) => (await admin.from('work_experiences').select('id, company, title, workplace_type, sort').eq('profile_id', id).order('sort')).data;
const queued = async (ids) => (await admin.from('linkedin_sync_queue').select('profile_id, reason, attempts, next_try_at, claimed_at').in('profile_id', ids)).data;
const started = new Date().toISOString(); const users = [];
/** an account without a session (no sign-in, so no auth rate limit): enough for people who only need a profile */
const plain = async (name, link) => { const { data, error } = await admin.auth.admin.createUser({ email: `tl-qa-${crypto.randomUUID()}@example.com`, email_confirm: true, user_metadata: { full_name: name } }); if (error) throw error; const id = data.user.id; users.push({ id, cleanup: async () => { await admin.auth.admin.deleteUser(id); } }); await admin.from('profiles').update({ full_name: name, status: 'alum', linkedin_url: link }).eq('id', id); return { id }; };
const make = async (name, approved, link) => { const u = await makeUser(admin, name, approved); users.push(u); if (link !== undefined) await admin.from('profiles').update({ linkedin_url: link }).eq('id', u.id); return u; };
const emptyQueue = async () => { await admin.from('linkedin_sync_queue').delete().in('profile_id', users.map((u) => u.id)); };

try {
  const { count: before } = await admin.from('linkedin_sync_queue').select('profile_id', { count: 'exact', head: true });
  assert.equal(before, 0, 'the queue starts empty (no worker is scheduled yet, so anything here would be left over)');

  // ── not before approval ───────────────────────────────────────────────────────────────────────
  const ana = await make('Ana LinkedIn QA', false, 'linkedin.com/in/BryanRG22/');
  assert.deepEqual(await queued([ana.id]), [], 'signing up with a link queues nothing');
  assert.equal((await call({ mode: 'request' }, ana.session.access_token)).status, 403, 'and they can\'t sync before approval');
  await admin.from('profiles').update({ approved: true }).eq('id', ana.id);
  assert.deepEqual((await queued([ana.id])).map((q) => q.reason), ['approved'], 'approving queues the first import');
  await admin.from('profiles').update({ approved: false }).eq('id', ana.id); await admin.from('profiles').update({ approved: true }).eq('id', ana.id);
  assert.equal((await queued([ana.id])).length, 1, 'approving again doesn\'t queue twice');
  console.log('PASS: nothing is read before approval; approving queues it once');
  await new Promise((ok) => setTimeout(ok, 6000));   // approval embeds the profile without LinkedIn facts first
  const hashBefore = (await admin.from('profiles').select('embedding_hash').eq('id', ana.id).single()).data.embedding_hash;

  // ── the import ────────────────────────────────────────────────────────────────────────────────
  const w1 = await worker(LIVE ? null : { [BRYAN]: bryanScrape });
  assert.equal(w1.done, 1, `worker: ${JSON.stringify(w1)}`);
  const first = await jobs(ana.id);
  assert.equal(first.length, 14, `14 jobs (got ${first.length})`); assert.equal(first.filter((j) => j.company === 'NVIDIA').length, 1, 'NVIDIA once');
  assert.equal(first.find((j) => j.company === 'NVIDIA').workplace_type, 'On-site');
  assert.deepEqual(await queued([ana.id]), [], 'done → off the queue');
  const p1 = (await admin.from('profiles').select('linkedin_synced_at, linkedin_sync_error').eq('id', ana.id).single()).data;
  assert.ok(p1.linkedin_synced_at && !p1.linkedin_sync_error);
  console.log(`PASS: the import${LIVE ? ' (live Apify scrape)' : ''} — 14 jobs, NVIDIA once with On-site, off the queue`);

  // ── everything else, stored ───────────────────────────────────────────────────────────────────
  const items = (await admin.from('linkedin_items').select('kind, title, is_usc').eq('profile_id', ana.id)).data;
  const n = (k) => items.filter((i) => i.kind === k).length;
  assert.deepEqual([n('honor'), n('publication'), n('certification'), n('organization'), n('education')], [7, 1, 1, 3, 1], 'honors, publications, certifications, organizations, school');
  assert.ok(items.find((i) => i.kind === 'education').is_usc, 'USC marked');
  const lp = (await admin.from('profiles').select('linkedin_headline, linkedin_about, linkedin_skills, bio').eq('id', ana.id).single()).data;
  assert.ok(lp.linkedin_headline?.includes('NVIDIA') && lp.linkedin_about?.length > 20 && lp.linkedin_skills.length >= 20, 'headline, about and skills from LinkedIn');
  const snap = (await admin.from('linkedin_snapshots').select('url, data').eq('profile_id', ana.id).single()).data;
  assert.equal(snap.url, BRYAN); for (const k of ['emails', 'moreProfiles', 'receivedRecommendations']) assert.ok(!(k in snap.data), `the copy leaves out ${k}`);
  assert.equal(snap.data.experience.length, 15, 'the copy keeps the scrape as it came');
  console.log('PASS: stored — 7 honors, 1 publication, 1 certification, 3 organizations, the school; headline/about/skills; the copy without other people or emails');

  // ── logos: copied once into our storage ───────────────────────────────────────────────────────
  const withLogo = (await admin.from('work_experiences').select('company, company_linkedin_id, company_logo').eq('profile_id', ana.id)).data;
  assert.ok(withLogo.filter((w) => w.company_linkedin_id).every((w) => w.company_logo), 'every job at a LinkedIn company has a logo of ours');
  const logoUrl = `https://ackmhqxyxnceoarbhcrp.supabase.co/storage/v1/object/public/company-logos/${withLogo.find((w) => w.company_logo).company_logo}`;
  const lr = await fetch(logoUrl); assert.equal(lr.status, 200, logoUrl); assert.match(lr.headers.get('content-type'), /^image\//);
  const co1 = (await admin.from('companies').select('linkedin_id, updated_at').in('linkedin_id', withLogo.map((w) => w.company_linkedin_id).filter(Boolean))).data;
  assert.ok(co1.length >= 10, 'one row per company');
  console.log(`PASS: logos — ${co1.length} companies, each logo copied into our own storage and served from it`);

  // ── the photo: theirs is never replaced ───────────────────────────────────────────────────────
  const av = async () => (await admin.from('profiles').select('avatar_path, avatar_source, avatar_linkedin_key').eq('id', ana.id).single()).data;
  const a1 = await av(); assert.equal(a1.avatar_source, 'linkedin', 'no photo → LinkedIn\'s'); assert.ok(a1.avatar_path.startsWith(`${ana.id}/linkedin.`));
  assert.equal((await fetch(`https://ackmhqxyxnceoarbhcrp.supabase.co/storage/v1/object/public/avatars/${a1.avatar_path}`)).status, 200);

  // ── re-syncing replaces, never duplicates ─────────────────────────────────────────────────────
  assert.equal((await call({ mode: 'request' }, ana.session.access_token)).status, 429, 'a member can sync once a day');
  for (let i = 0; i < 2; i++) { await call({ mode: 'request', profile_id: ana.id }); assert.equal((await worker(LIVE ? null : { [BRYAN]: bryanScrape })).done, 1); }
  const again = await jobs(ana.id);
  assert.equal(again.length, 14, 'three syncs, still 14 jobs');
  assert.deepEqual(again.map((j) => `${j.company}|${j.title}`), first.map((j) => `${j.company}|${j.title}`), 'the same jobs in the same order');
  assert.ok(again.every((j) => !first.some((f) => f.id === j.id)), 'the rows were replaced, not kept and added to');
  console.log('PASS: re-syncing — three syncs give the same 14 jobs (replaced, never added to); members once a day');

  const co2 = (await admin.from('companies').select('linkedin_id, updated_at').in('linkedin_id', co1.map((c) => c.linkedin_id))).data;
  assert.deepEqual(co2.map((c) => c.updated_at).sort(), co1.map((c) => c.updated_at).sort(), 'logos weren\'t downloaded again');
  assert.equal((await admin.from('linkedin_items').select('id', { count: 'exact', head: true }).eq('profile_id', ana.id)).count, 13, 'items replaced too: still 13');
  const sync = async (scrape) => { await call({ mode: 'request', profile_id: ana.id }); return worker({ [BRYAN]: { ...bryanScrape, ...scrape } }); };
  assert.equal((await sync({ photo: 'https://usctroylabs.com/apple-touch-icon.png' })).photos.took, 1, 'they changed their LinkedIn photo → it follows');
  const a2 = await av(); assert.notEqual(a2.avatar_linkedin_key, a1.avatar_linkedin_key);
  assert.equal((await sync({ photo: 'https://usctroylabs.com/apple-touch-icon.png?sig=new' })).photos.kept, 1, 'the same photo isn\'t downloaded again');
  await admin.from('profiles').update({ avatar_path: `${ana.id}/avatar.webp`, avatar_source: 'upload' }).eq('id', ana.id);   // they upload their own
  assert.equal((await sync({ photo: 'https://usctroylabs.com/icon-512.png' })).photos.kept, 1);
  assert.deepEqual(await av(), { avatar_path: `${ana.id}/avatar.webp`, avatar_source: 'upload', avatar_linkedin_key: a2.avatar_linkedin_key }, 'an uploaded photo is never replaced');
  await admin.from('profiles').update({ avatar_path: null, avatar_source: null }).eq('id', ana.id);
  assert.equal((await sync({ photo: 'https://usctroylabs.com/icon-512.png', openToWork: true })).photos.kept, 1, 'the #OpenToWork photo is skipped');
  console.log('PASS: photos — follows a changed LinkedIn photo, never re-downloads the same one, never replaces an upload, skips #OpenToWork');

  // ── AI search knows what they did ─────────────────────────────────────────────────────────────
  await sync({});
  const t0 = Date.now(); let hash = null;
  while (Date.now() - t0 < 40000) { const r = (await admin.from('profiles').select('embedding_hash').eq('id', ana.id).single()).data; if (r.embedding_hash && r.embedding_hash !== hashBefore) { hash = r.embedding_hash; break; } await new Promise((ok) => setTimeout(ok, 1500)); }
  assert.ok(hash, 'the sync re-embedded the profile');
  const ask = async (q) => (await (await fetch('https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/semantic', { method: 'POST', headers: { Authorization: `Bearer ${ana.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'search', q }) })).json()).hits ?? [];
  const testIds = new Set(users.map((u) => u.id));   // real members can match too (Bryan's own profile mentions hackathons): rank among this test's people
  for (const q of ['someone who interned at Jane Street', 'who won a hackathon', 'published research on TikTok']) { const hits = (await ask(q)).filter((h) => testIds.has(h.id)); assert.equal(hits[0]?.id, ana.id, `"${q}" ranks them first (got ${JSON.stringify(hits.slice(0, 3))})`); }
  console.log('PASS: AI search — after a sync, "interned at Jane Street", "won a hackathon" and "published research on TikTok" find them first');

  // ── failures keep what's saved (same link; LinkedIn is what fails) ─────────────────────────────
  await call({ mode: 'request', profile_id: ana.id });
  const wf = await worker({ [BRYAN]: { originalQuery: { url: BRYAN }, error: 'Profile not found' } }); assert.equal(wf.failed, 1, `LinkedIn not returning the profile fails: ${JSON.stringify(wf)}`);
  assert.equal((await jobs(ana.id)).length, 14, 'and the saved history is kept');
  const qf = (await queued([ana.id]))[0]; assert.equal(qf.attempts, 1); assert.ok(Date.parse(qf.next_try_at) > Date.now() + 4 * 60_000, 'retried about 5 minutes later');
  assert.match((await admin.from('profiles').select('linkedin_sync_error').eq('id', ana.id).single()).data.linkedin_sync_error, /LinkedIn/);
  await emptyQueue(); await call({ mode: 'request', profile_id: ana.id });
  const we = await worker({ [BRYAN]: { originalQuery: { url: BRYAN }, experience: [] } }); assert.equal(we.failed, 1);
  assert.equal((await jobs(ana.id)).length, 14, 'an empty scrape (LinkedIn showing no jobs) keeps the 14 jobs');
  await emptyQueue();
  console.log('PASS: failures — LinkedIn not returning the profile retries in 5 min and keeps the history; an empty scrape keeps it too');

  // ── the link removed or changed: what came from the old link goes ─────────────────────────────
  const fromLinkedIn = async () => { const p = (await admin.from('profiles').select('linkedin_headline, linkedin_skills, linkedin_synced_at, current_title, current_job_source, avatar_source').eq('id', ana.id).single()).data; return { jobs: (await jobs(ana.id)).length, items: (await admin.from('linkedin_items').select('id', { count: 'exact', head: true }).eq('profile_id', ana.id)).count, copy: (await admin.from('linkedin_snapshots').select('profile_id', { count: 'exact', head: true }).eq('profile_id', ana.id)).count, headline: p.linkedin_headline, skills: p.linkedin_skills.length, synced: Boolean(p.linkedin_synced_at), job: p.current_job_source === 'linkedin' ? p.current_title : '(theirs)', photo: p.avatar_source }; };
  await admin.from('profiles').update({ current_title: 'Software Engineering Intern', current_company: 'NVIDIA', current_job_source: 'linkedin' }).eq('id', ana.id);
  const other = `https://www.linkedin.com/in/tl-qa-other-${crypto.randomUUID().slice(0, 6)}`;
  await ana.sb.from('profiles').update({ linkedin_url: other.replace('https://www.', '') + '/' }).eq('id', ana.id);   // as the member, any spelling
  assert.deepEqual(await fromLinkedIn(), { jobs: 0, items: 0, copy: 0, headline: null, skills: 0, synced: false, job: null, photo: (await fromLinkedIn()).photo }, 'a changed link clears what the old one brought in');
  const q2 = (await queued([ana.id]))[0]; assert.equal(q2?.reason, 'member', 'the new link is queued'); assert.ok(Date.parse(q2.next_try_at) > Date.now() + 60_000, 'after a 2-minute pause, so quick edits become one import');
  await ana.sb.from('profiles').update({ linkedin_url: null }).eq('id', ana.id);
  assert.deepEqual(await queued([ana.id]), [], 'removing the link cancels the import');
  await ana.sb.from('profiles').update({ linkedin_url: BRYAN }).eq('id', ana.id);
  await admin.from('linkedin_sync_queue').update({ next_try_at: new Date().toISOString() }).eq('profile_id', ana.id);
  assert.equal((await worker({ [BRYAN]: bryanScrape })).done, 1); assert.equal((await jobs(ana.id)).length, 14, 'back on the old link: imported again');
  // a link that isn't a LinkedIn profile: stored as typed, not imported, told why, not retried
  await admin.from('profiles').update({ linkedin_url: 'https://www.linkedin.com/company/nvidia' }).eq('id', ana.id);
  assert.equal((await jobs(ana.id)).length, 0, 'the old history went with the old link'); await call({ mode: 'request', profile_id: ana.id });
  assert.deepEqual((await queued([ana.id])), [], 'a company page isn\'t queued');
  await admin.from('profiles').update({ linkedin_url: BRYAN }).eq('id', ana.id); await admin.from('linkedin_sync_queue').update({ next_try_at: new Date().toISOString() }).eq('profile_id', ana.id);
  assert.equal((await worker({ [BRYAN]: bryanScrape })).done, 1);
  await emptyQueue();
  console.log('PASS: link changed or removed — everything from the old link goes (jobs, items, copy, headline, skills, a LinkedIn current job); a new link queues after 2 minutes; removing it cancels; a company page isn\'t imported');

  // ── 30 approved at once, two workers at the same time ─────────────────────────────────────────
  const crowd = []; const fixture = {};
  for (let i = 0; i < 30; i++) {
    const link = `https://www.linkedin.com/in/tl-qa-crowd-${i}-${crypto.randomUUID().slice(0, 6)}`;
    crowd.push(i === 0 ? await make(`Crowd ${i} QA`, false, link) : await plain(`Crowd ${i} QA`, link));   // only the first needs to sign in (it reads below)
    fixture[link] = { originalQuery: { url: link }, experience: [{ position: `Role ${i}`, companyName: 'Acme', startDate: { month: 'Jan', year: 2024 } }, { position: `Role ${i}`, companyName: 'Acme', startDate: { month: 'Jan', year: 2024 }, workplaceType: 'Remote' }] };
  }
  const ids = crowd.map((u) => u.id);
  await admin.from('profiles').update({ approved: true }).in('id', ids);   // bulk APPROVE
  assert.equal((await queued(ids)).length, 30, 'all 30 queued');
  const [wa, wb] = await Promise.all([worker(fixture), worker(fixture)]);
  assert.equal(wa.done + wb.done, 20, `two workers at once take 10 each, nobody twice: ${JSON.stringify([wa, wb])}`);
  assert.equal(wa.scraped + wb.scraped, 20, 'one scrape per person, in two runs of 10');
  const w3 = await worker(fixture); assert.equal(w3.done, 10, 'the next minute takes the last 10');
  assert.equal((await worker(fixture)).done, 0, 'then the queue is empty');
  const counts = await Promise.all(ids.map(async (id) => (await jobs(id)).length));
  assert.ok(counts.every((n) => n === 1), `everyone got exactly one job (their repeat merged): ${counts}`);
  console.log('PASS: 30 approved at once — 3 runs of 10, two workers never take the same person, everyone saved once');

  // ── one by one ────────────────────────────────────────────────────────────────────────────────
  const few = crowd.slice(0, 5); await admin.from('profiles').update({ approved: false }).in('id', few.map((u) => u.id));
  for (const u of few) await admin.from('profiles').update({ approved: true }).eq('id', u.id);
  assert.equal((await queued(few.map((u) => u.id))).length, 5); assert.equal((await worker(fixture)).done, 5, 'five approvals one by one → one run');
  console.log('PASS: approving one by one — they wait in the queue and go in one run');

  // ── who can read and write ────────────────────────────────────────────────────────────────────
  const outsider = await make('Pending Reader QA', false);
  assert.equal((await outsider.sb.from('work_experiences').select('id').eq('profile_id', ana.id)).data.length, 0, 'someone waiting for approval can\'t read others\' history');
  assert.equal((await crowd[0].sb.from('work_experiences').select('id').eq('profile_id', ana.id)).data.length, 14, 'approved members can');
  const ins = await ana.sb.from('work_experiences').insert({ profile_id: ana.id, sort: 99, title: 'Fake', company: 'Fake' });
  assert.ok(ins.error, 'nobody writes history through the API');
  assert.ok((await ana.sb.from('linkedin_sync_queue').select('*')).error || !(await ana.sb.from('linkedin_sync_queue').select('*')).data?.length, 'nor reads the queue');
  assert.equal((await call({ mode: 'worker' }, ana.session.access_token)).status, 403, 'members can\'t run the worker');
  assert.equal((await call({ mode: 'worker' }, 'not-a-key')).status, 401);
  console.log('PASS: access — members read approved members\' history; nobody writes it or the queue through the API');
} finally {
  await emptyQueue();
  for (const u of users) await u.cleanup().catch(() => {});
  await admin.from('linkedin_scrapes').delete().gte('at', started);
  { const { data: cos } = await admin.from('companies').select('linkedin_id, logo_path').like('linkedin_id', 'tl-qa-%'); const files = (cos ?? []).map((c) => c.logo_path).filter(Boolean); if (files.length) await admin.storage.from('company-logos').remove(files); await admin.from('companies').delete().like('linkedin_id', 'tl-qa-%'); }   // test companies and their logos   // test runs don't count against the monthly cap
  console.log(`Cleaned up ${users.length} temporary accounts.`);
}
