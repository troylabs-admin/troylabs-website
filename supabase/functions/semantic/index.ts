/**
 * AI search for the TL Alumni Network (2026-10-05). Holds the OpenAI key, so it runs here and never in the page.
 *
 * Modes (POST JSON):
 *   search   { q }    → an approved member's search, embedded and matched against approved profiles
 *                       (match_profiles runs as the caller, so row-level security decides what can come back)
 *   embed    { ids }  → (re)compute embeddings for these profiles. Called by the database trigger with the shared
 *                       secret, or by an admin. Unchanged text (same SHA-256 fingerprint) is skipped, so a save that only touched
 *                       the phone number costs nothing.
 *   backfill          → (admin) embed every approved profile that has no embedding yet or a stale one
 *
 * What gets embedded: status, class year, cohort, divisions, title, company, city, industries, startups, bio.
 * Never names, emails or phone numbers. Model: text-embedding-3-small (1536 dimensions = the profiles.embedding column).
 * Secrets: OPENAI_API_KEY, CRON_SECRET (shared with the database trigger through Vault).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const MODEL = 'text-embedding-3-small';

import { profileChunks, type ProfileFacts as Row } from '../_shared/profile-text.ts';

const fingerprint = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join('');

/** OpenAI embeddings for up to 100 texts at once; retries rate limits and server errors */
async function embed(texts: string[]): Promise<number[][]> {
  const key = Deno.env.get('OPENAI_API_KEY'); if (!key) throw new Error('OPENAI_API_KEY is not set');
  for (let attempt = 0; ; attempt++) {
    const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, input: texts }) });
    if ((r.status === 429 || r.status >= 500) && attempt < 3) { await new Promise((ok) => setTimeout(ok, 800 * 2 ** attempt)); continue; }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${body?.error?.message ?? 'request failed'}`);
    return (body.data as { index: number; embedding: number[] }[]).sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}

async function embedProfiles(svc: SupabaseClient, ids: string[] | null): Promise<{ embedded: number; skipped: number }> {
  let q = svc.from('profiles').select('id, status, grad_year, join_term, join_year, divisions, current_title, current_company, industries, startups, bio, embedding_hash, linkedin_headline, linkedin_skills, city:cities(name, region), work:work_experiences(title, company, start_year, end_year, sort), items:linkedin_items(kind, title, issuer, detail, is_usc, sort)').eq('approved', true);
  if (ids) q = q.in('id', ids);
  const { data, error } = await q; if (error) throw error;
  // each person is several pieces (profileChunks); unchanged pieces (same fingerprint) are never re-sent
  const todo: { id: string; pieces: string[]; hash: string }[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    r.work?.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)); r.items?.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    const pieces = profileChunks(r); const hash = await fingerprint(`${MODEL}|pieces-v1|${pieces.join('\n')}`);   // the version makes every profile re-embed once when the format changes
    if (hash !== r.embedding_hash) todo.push({ id: r.id, pieces, hash });
  }
  // OpenAI takes up to 100 texts per call: fill calls with whole people
  for (let i = 0; i < todo.length;) {
    const group: typeof todo = []; let n = 0;
    while (i < todo.length && (group.length === 0 || n + todo[i].pieces.length <= 100)) { n += todo[i].pieces.length; group.push(todo[i++]); }
    const vectors = await embed(group.flatMap((g) => g.pieces)); let at = 0;
    for (const g of group) {
      const vs = vectors.slice(at, at + g.pieces.length); at += g.pieces.length;
      const { error: de } = await svc.from('profile_chunks').delete().eq('profile_id', g.id); if (de) throw de;
      const { error: ie } = await svc.from('profile_chunks').insert(vs.map((v, piece) => ({ profile_id: g.id, piece, embedding: JSON.stringify(v) }))); if (ie) throw ie;
      await svc.from('profiles').update({ embedding: JSON.stringify(vs[0]), embedding_hash: g.hash }).eq('id', g.id);   // the core facts stay on the profile too
    }
  }
  return { embedded: todo.length, skipped: (data?.length ?? 0) - todo.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const input = await req.json().catch(() => ({})) as { mode?: string; q?: string; ids?: string[] };
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const secret = Deno.env.get('CRON_SECRET'); const fromDatabase = Boolean(secret) && req.headers.get('x-cron-secret') === secret;

  try {
    if (input.mode === 'embed' && fromDatabase) return json(await embedProfiles(svc, (input.ids ?? []).filter((x) => typeof x === 'string').slice(0, 100)));

    // everything else runs as the signed-in caller
    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
    if (input.mode === 'search') {
      const { data: member } = await user.rpc('is_member');
      if (!member) return json({ error: 'members only' }, 403);
      const q = (input.q ?? '').trim().slice(0, 300);
      if (q.length < 2) return json({ hits: [] });
      const [vector] = await embed([q]);
      const { data, error } = await user.rpc('match_profiles', { query_embedding: JSON.stringify(vector), match_count: 40 });
      if (error) throw error;
      return json({ hits: data ?? [] });
    }
    const { data: isAdmin } = await user.rpc('is_admin');
    if (!isAdmin) return json({ error: 'admins only' }, 403);
    if (input.mode === 'embed') return json(await embedProfiles(svc, (input.ids ?? []).filter((x) => typeof x === 'string').slice(0, 100)));
    if (input.mode === 'backfill') return json(await embedProfiles(svc, null));
    return json({ error: 'unknown mode' }, 400);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 502); }
});
