/**
 * Work history from LinkedIn (2026-10-05). The member's LinkedIn link (profiles.linkedin_url) is read through Apify's
 * `harvestapi~linkedin-profile-scraper` — the scraper ColorStack uses: the public profile page, no LinkedIn login,
 * ~$4 per 1,000 profiles — and their work history is REPLACED with what LinkedIn shows now (see
 * supabase/migrations/20261005000500_work_history.sql for why replace beats ColorStack's merge).
 *
 * Modes (POST JSON):
 *   worker            the database's cron (x-cron-secret) or an admin: take up to 10 queued people, ONE Apify run for
 *                     all of them, save each. Failures retry (5, 10 min later), 3 tries in all; a failed or empty
 *                     scrape never wipes anything. Stops at 1,000 profiles a month (Apify's free $5).
 *   request           a signed-in approved member: queue my own sync (once a day; admins any time, for anyone: { profile_id }).
 *   preview { url }   admin: scrape one profile and return what we'd store, saving nothing.
 * Tests (service-role key as bearer) may pass `fixture: { "<linkedin url>": <scraper item> }` instead of calling Apify.
 *
 * Secrets: APIFY_API_TOKEN, CRON_SECRET.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { canonicalLinkedIn, currentRole, jobDecision, photoDecision, photoKey, snapshotOf, toItems, toSkills, toWorkHistory, type ScrapedFull, type ScrapedProfile } from '../_shared/work-history.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const ACTOR = 'harvestapi~linkedin-profile-scraper';
const BATCH = 10;              // people per Apify run (one run ≈ 4–30 s; the function may run 150 s)
const MONTHLY_CAP = 1000;      // profiles per calendar month (Apify free plan: $5 ≈ 1,250)
const MAX_TRIES = 3;

async function scrape(urls: string[]): Promise<ScrapedProfile[]> {
  const token = Deno.env.get('APIFY_API_TOKEN'); if (!token) throw new Error('APIFY_API_TOKEN is not set');
  const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=110`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Apify ${r.status}: ${JSON.stringify(body)?.slice(0, 300)}`);
  return Array.isArray(body) ? body : [];
}

const MAX_IMAGE = 1024 * 1024;
async function download(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) return null;
    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim(); if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
    const bytes = new Uint8Array(await r.arrayBuffer()); return bytes.length && bytes.length <= MAX_IMAGE ? { bytes, type } : null;
  } catch { return null; }
}
const ext = (type: string) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type] ?? 'img');

/** company logos: copied once per LinkedIn company into our public bucket (LinkedIn's links expire); returns id → path */
async function companyLogos(svc: SupabaseClient, experience: { companyId?: string | null; companyName?: string | null; companyLogo?: unknown; companyLinkedinUrl?: string | null }[]): Promise<Map<string, string>> {
  const wanted = new Map<string, { name: string; url: string | null; page: string | null }>();
  for (const e of experience) { const id = typeof e.companyId === 'string' ? e.companyId : null; if (!id || wanted.has(id)) continue; const logo = e.companyLogo as { url?: string } | string | null; const page = typeof e.companyLinkedinUrl === 'string' && /^https:\/\/(www\.)?linkedin\.com\/(company|school)\//i.test(e.companyLinkedinUrl) ? e.companyLinkedinUrl : null; wanted.set(id, { name: String(e.companyName ?? '').trim(), url: typeof logo === 'string' ? logo : logo?.url ?? null, page }); }
  const out = new Map<string, string>(); if (!wanted.size) return out;
  const { data: known } = await svc.from('companies').select('linkedin_id, logo_path').in('linkedin_id', [...wanted.keys()]);
  for (const k of known ?? []) if (k.logo_path) out.set(k.linkedin_id, k.logo_path);
  // companies we know: keep their logo, refresh their name and LinkedIn page
  await Promise.all((known ?? []).map((k) => { const c = wanted.get(k.linkedin_id)!; return svc.from('companies').update({ ...(c.name ? { name: c.name } : {}), ...(c.page ? { linkedin_url: c.page } : {}) }).eq('linkedin_id', k.linkedin_id); }));
  await Promise.all([...wanted].filter(([id]) => !out.has(id)).map(async ([id, c]) => {   // new companies, and known ones still without a logo
    let path: string | null = null;
    const img = c.url ? await download(c.url) : null;
    if (img) { path = `${id}.${ext(img.type)}`; const { error } = await svc.storage.from('company-logos').upload(path, img.bytes, { contentType: img.type, upsert: true, cacheControl: '604800' }); if (error) path = null; }
    await svc.from('companies').upsert({ linkedin_id: id, name: c.name || id, logo_path: path, linkedin_url: c.page, updated_at: new Date().toISOString() }, { onConflict: 'linkedin_id' });
    if (path) out.set(id, path);
  }));
  return out;
}

/** their LinkedIn photo, if the rule says so (never over a photo they uploaded) */
async function maybePhoto(svc: SupabaseClient, profileId: string, scrape: ScrapedFull): Promise<'took' | 'kept' | 'failed'> {
  const { data: p } = await svc.from('profiles').select('avatar_path, avatar_source, avatar_linkedin_key').eq('id', profileId).single();
  if (!p || photoDecision(p, scrape) === 'keep') return 'kept';
  const img = await download(String(scrape.photo)); if (!img) return 'failed';
  const path = `${profileId}/linkedin.${ext(img.type)}`;
  const { error } = await svc.storage.from('avatars').upload(path, img.bytes, { contentType: img.type, upsert: true, cacheControl: '3600' }); if (error) return 'failed';
  await svc.from('profiles').update({ avatar_path: path, avatar_source: 'linkedin', avatar_linkedin_key: photoKey(scrape.photo) }).eq('id', profileId);
  return 'took';
}

async function worker(svc: SupabaseClient, fixture: Record<string, ScrapedProfile> | null) {
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const { data: used } = await svc.from('linkedin_scrapes').select('profiles').gte('at', monthStart.toISOString());
  const spent = (used ?? []).reduce((n, r) => n + (r.profiles as number), 0);
  if (spent >= MONTHLY_CAP) return { capped: true, spent };

  const { data: claimed, error } = await svc.rpc('claim_linkedin_batch', { n: Math.min(BATCH, MONTHLY_CAP - spent) }); if (error) throw error;
  const jobs = (claimed ?? []) as { profile_id: string; linkedin_url: string | null; attempts: number }[];
  if (!jobs.length) return { done: 0 };

  const fail = async (job: (typeof jobs)[number], why: string, retry: boolean) => {
    await svc.from('profiles').update({ linkedin_sync_error: why }).eq('id', job.profile_id);
    if (!retry || job.attempts >= MAX_TRIES) await svc.from('linkedin_sync_queue').delete().eq('profile_id', job.profile_id);
    else await svc.from('linkedin_sync_queue').update({ claimed_at: null, last_error: why, next_try_at: new Date(Date.now() + job.attempts * 5 * 60_000).toISOString() }).eq('profile_id', job.profile_id);
  };

  // one scrape per distinct link, all in one run
  const urlOf = new Map(jobs.map((j) => [j.profile_id, canonicalLinkedIn(j.linkedin_url ?? '')]));
  const urls = [...new Set([...urlOf.values()].filter((u): u is string => Boolean(u)))];
  let items: ScrapedProfile[] = [];
  if (urls.length) {
    try { items = fixture ? urls.map((u) => fixture[u]).filter(Boolean) : await scrape(urls); }
    catch (e) { for (const j of jobs) await fail(j, `Couldn't reach LinkedIn: ${(e as Error).message}`, true); return { done: 0, failed: jobs.length, error: (e as Error).message }; }
  }
  const byUrl = new Map<string, ScrapedProfile>();
  for (const it of items) { const u = canonicalLinkedIn(String(it?.originalQuery?.url ?? it?.linkedinUrl ?? '')); if (u) byUrl.set(u, it); }

  let done = 0, failed = 0; const photos = { took: 0, kept: 0, failed: 0 };
  for (const job of jobs) {
    const url = urlOf.get(job.profile_id);
    if (!url) { await fail(job, 'That isn’t a LinkedIn profile link (it should look like linkedin.com/in/your-name).', false); failed++; continue; }
    const item = byUrl.get(url);
    if (!item || item.error) { await fail(job, item?.error ? `LinkedIn: ${item.error}` : 'LinkedIn didn’t return this profile. Is it public?', true); failed++; continue; }
    const rows = toWorkHistory(item.experience ?? []);
    if (!rows.length) {
      const { count } = await svc.from('work_experiences').select('id', { count: 'exact', head: true }).eq('profile_id', job.profile_id);
      if ((count ?? 0) > 0) { await fail(job, 'LinkedIn showed no jobs this time, so the saved work history was kept.', true); failed++; continue; }
    }
    const full = item as ScrapedFull;
    const logos = await companyLogos(svc, (full.experience ?? []) as { companyId?: string; companyName?: string; companyLogo?: unknown }[]);
    const work = rows.map((r) => ({ ...r, company_logo: r.company_linkedin_id ? logos.get(r.company_linkedin_id) ?? null : null }));
    photos[await maybePhoto(svc, job.profile_id, full)]++;
    const { error: re } = await svc.rpc('replace_linkedin_profile', { p_profile: job.profile_id, p_url: url, p_snapshot: snapshotOf(full), p_work: work, p_items: toItems(full), p_headline: typeof full.headline === 'string' ? full.headline.trim() || null : null, p_about: typeof full.about === 'string' ? full.about.trim() || null : null, p_skills: toSkills(full) });
    if (re) { await fail(job, `Couldn’t save: ${re.message}`, true); failed++; continue; }
    // the card's current job follows LinkedIn unless they typed their own
    const { data: pj } = await svc.from('profiles').select('current_title, current_company, current_job_source').eq('id', job.profile_id).single();
    const role = currentRole(rows);
    if (pj && jobDecision(pj, role) === 'take' && role) await svc.from('profiles').update({ current_title: role.title, current_company: role.company, current_job_source: 'linkedin' }).eq('id', job.profile_id);
    done++;
  }
  if (urls.length) await svc.from('linkedin_scrapes').insert({ profiles: urls.length, ok: done });
  return { done, failed, scraped: urls.length, photos };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const input = await req.json().catch(() => ({})) as { mode?: string; url?: string; profile_id?: string; fixture?: Record<string, ScrapedProfile> };
  const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const secret = Deno.env.get('CRON_SECRET'); const fromCron = Boolean(secret) && req.headers.get('x-cron-secret') === secret;
  // a service-role key (either format) is a test: it may supply fixtures instead of calling Apify
  const isService = bearer === serviceKey || (bearer.split('.').length === 3 && !(await createClient(url, bearer, { auth: { persistSession: false } }).auth.admin.listUsers({ page: 1, perPage: 1 })).error);
  try {
    if (input.mode === 'worker' && (fromCron || isService)) return json(await worker(svc, isService ? input.fixture ?? null : null));
    if (isService && input.mode === 'request' && input.profile_id) { await svc.from('linkedin_sync_queue').upsert({ profile_id: input.profile_id, reason: 'admin', next_try_at: new Date().toISOString(), claimed_at: null }, { onConflict: 'profile_id' }); return json({ queued: true }); }

    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } });
    const { data: u } = await user.auth.getUser(); if (!u.user) return json({ error: 'sign in first' }, 401);
    const { data: isAdmin } = await user.rpc('is_admin');

    if (input.mode === 'worker' && isAdmin) return json(await worker(svc, null));
    if (input.mode === 'request') {
      const id = isAdmin && input.profile_id ? input.profile_id : u.user.id;
      const { data: p } = await svc.from('profiles').select('approved, linkedin_url, linkedin_synced_at').eq('id', id).single();
      if (!p?.approved) return json({ error: 'Work history imports start once leadership approves the profile.' }, 403);
      if (!canonicalLinkedIn(p.linkedin_url ?? '')) return json({ error: 'Add your LinkedIn link (linkedin.com/in/your-name) and save first.' }, 400);
      if (!isAdmin && p.linkedin_synced_at && Date.now() - Date.parse(p.linkedin_synced_at) < 24 * 3600_000) return json({ error: 'Your work history was imported in the last day. Try again tomorrow.' }, 429);
      await svc.from('linkedin_sync_queue').upsert({ profile_id: id, reason: isAdmin && id !== u.user.id ? 'admin' : 'member' }, { onConflict: 'profile_id', ignoreDuplicates: true });
      return json({ queued: true });
    }
    if (input.mode === 'preview' && isAdmin) {
      const link = canonicalLinkedIn(input.url ?? ''); if (!link) return json({ error: 'not a LinkedIn profile link' }, 400);
      const t0 = Date.now(); const items = await scrape([link]);
      return json({ url: link, ms: Date.now() - t0, raw: items, rows: toWorkHistory(items[0]?.experience ?? []) });
    }
    return json({ error: isAdmin ? 'unknown mode' : 'not allowed' }, isAdmin ? 400 : 403);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
