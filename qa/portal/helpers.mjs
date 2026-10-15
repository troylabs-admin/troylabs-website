import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
// TL_SUPABASE=local points every test at the throwaway local stack (`supabase start`, or `supabase db start` for the SQL-only
// tests, as CI does) instead of the live project. Nothing here can reach production in that mode.
export const local = process.env.TL_SUPABASE === 'local';
export const ref = 'ackmhqxyxnceoarbhcrp';
const cli = process.env.SUPABASE_CLI || 'supabase';
export const cliJson = (args) => JSON.parse(execFileSync(cli, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
// the local stack's own keys; {} when only the database is running (the SQL-only tests need none)
const localStatus = () => { try { const t = execFileSync(cli, ['status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return JSON.parse(t.slice(t.indexOf('{'))); } catch { return {}; } };
export const url = local ? (process.env.TL_SUPABASE_URL || 'http://127.0.0.1:54321') : `https://${ref}.supabase.co`;
export const publicKey = local ? (process.env.TL_SUPABASE_ANON_KEY || localStatus().ANON_KEY) : 'sb_publishable_6mQYrZoxtpUgqD8WAaY7Ww_Q-xsCYrn';
// "\n" first: a query that begins with a "--" comment would otherwise be read as a command-line flag
export function sql(query) { return local ? localSql(query) : cliJson(['db', 'query', '--linked', '--project-ref', ref, '--output', 'json', `\n${query}`]); }
/** the local stack's database, through psql in its container: unlike `db query --local` it takes a whole transaction
 *  (begin; …; select …; rollback;). Returns the last result like the live path does: { rows: [{ column: value }] },
 *  with t/f as booleans and JSON text parsed. */
function localSql(query) {
  const container = process.env.TL_SUPABASE_DB_CONTAINER || 'supabase_db_Troylabs_Website';
  const out = execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '--csv', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = out.trim().split('\n'); if (lines.length < 2) return { rows: [] };
  const [head, value] = lines.slice(-2);
  const cell = value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value;
  const v = cell === 't' ? true : cell === 'f' ? false : /^[{[]/.test(cell) ? JSON.parse(cell) : cell;
  return { rows: [{ [head]: v }] };
}
export function client() { return createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } }); }
// Privileged key remains in process memory. No key/session files, no email delivery.
export function adminClient() {
  const key = local ? (process.env.TL_SUPABASE_SERVICE_KEY || localStatus().SERVICE_ROLE_KEY) : cliJson(['projects','api-keys','--project-ref',ref,'--output','json']).find(k => k.name === 'service_role')?.api_key;
  if (!key) throw new Error('Service key unavailable');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
/** a throwaway account with a session. `blank: true` leaves the profile exactly as sign-up creates it
 *  (the state a brand-new member is in before they fill anything in). */
export async function makeUser(admin, name, approved = true, { blank = false } = {}) {
  const email = `tl-qa-${crypto.randomUUID()}@example.com`;
  const { data, error } = await admin.auth.admin.generateLink({ type: 'signup', email, password: crypto.randomUUID(), options: { data: blank ? {} : { full_name: name } } });
  if (error) throw error;
  const id = data.user.id;
  // the account and its photos (an upload or a LinkedIn import puts files under avatars/<id>/; deleting the user doesn't)
  const cleanup = async () => { const { data: files } = await admin.storage.from('avatars').list(id); if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${id}/${f.name}`)); const { error } = await admin.auth.admin.deleteUser(id); if (error) throw error; };
  try {
    const fields = blank ? { approved } : { approved, full_name: name, current_title: 'Founder', current_company: 'Luma Health', status: 'alum', grad_year: 2024, join_year: 2022, join_term: 'FA', divisions: ['TECH'], city_id: 1 };
    const { error: pe } = await admin.from('profiles').update(fields).eq('id', id);
    if(pe) throw pe;
    const sb = client(); const { data: auth, error: ae } = await sb.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'email' });
    if(ae) throw ae;
    return { id, email, sb, session: auth.session, cleanup };
  } catch(e) { await cleanup(); throw e; }
}
export async function signInPage(browser, user, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ key, session }) => { if (!sessionStorage.getItem('tl-qa-seeded')) { localStorage.setItem(key, JSON.stringify(session)); sessionStorage.setItem('tl-qa-seeded', '1'); } }, { key: `sb-${ref}-auth-token`, session: user.session });
  return { context, page: await context.newPage() };
}
