// Run the actual edge worker with an in-memory Supabase stub. No database, scraper, emails or network.
// node --experimental-vm-modules qa/portal/linkedin-retention.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const context = vm.createContext({ Date, Map, Set, URL, Response, console, Deno: { serve() {}, env: { get() { return undefined; } } }, fetch() { throw new Error('Network access forbidden in retention test'); } });
const shared = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/_shared/work-history.ts', import.meta.url), 'utf8')), { context });
const client = new vm.SyntheticModule(['createClient'], function () { this.setExport('createClient', () => { throw new Error('Use the test database stub'); }); }, { context });
const worker = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/linkedin-sync/index.ts', import.meta.url), 'utf8')) + '\nexport { worker };', { context });
await worker.link(specifier => specifier.startsWith('npm:') ? client : shared); await worker.evaluate();
const link = 'https://www.linkedin.com/in/tl-qa-retention';
async function run({ count, countError = null, attempts = 1 }) {
  const calls = [], saved = [{ company: 'Existing Co', title: 'Existing role' }];
  const svc = {
    from(table) {
      return {
        select() { return {
          gte: async () => ({ data: [] }),
          eq: () => table === 'work_experiences'
            ? Promise.resolve({ count, error: countError })
            : { single: async () => ({ data: table === 'profiles' ? { avatar_path: 'uploaded.webp', avatar_source: 'upload', current_title: null, current_company: null } : null }) },
        }; },
        update(fields) { return { eq: async (key, id) => { calls.push({ op: 'update', table, fields, id }); return { error: null }; } }; },
        delete() { return { eq: async (key, id) => { calls.push({ op: 'delete', table, id }); return { error: null }; } }; },
        insert: async fields => { calls.push({ op: 'insert', table, fields }); return { error: null }; },
      };
    },
    async rpc(name, args) {
      calls.push({ op: 'rpc', name });
      if (name === 'claim_linkedin_batch') return { data: [{ profile_id: 'qa-profile', linkedin_url: link, attempts }], error: null };
      if (name === 'replace_linkedin_profile') { saved.splice(0, saved.length, ...args.p_work); return { error: null }; }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const result = await worker.namespace.worker(svc, { [link]: { linkedinUrl: link, experience: [] } });
  return { result, calls, saved };
}
for (const scenario of [{ count: null, countError: { message: 'Transient count lookup failure' } }, { count: 0, countError: { message: 'Error must win over count' } }, { count: null }, { count: undefined }, { count: 1 }]) {
  const r = await run(scenario);
  assert.equal(r.result.failed, 1); assert.equal(r.result.done, 0);
  assert.equal(r.saved.length, 1, 'old history remains');
  assert.ok(!r.calls.some(c => c.name === 'replace_linkedin_profile'), 'worker must not invoke destructive replacement');
  assert.ok(r.calls.some(c => c.op === 'update' && c.table === 'linkedin_sync_queue' && c.fields.claimed_at === null), 'retry queued');
}
const final = await run({ count: null, countError: { message: 'Unavailable' }, attempts: 3 });
assert.equal(final.saved.length, 1); assert.equal(final.result.failed, 1);
assert.ok(final.calls.some(c => c.op === 'delete' && c.table === 'linkedin_sync_queue'), 'last attempt stops automatic retries');
assert.ok(!final.calls.some(c => c.name === 'replace_linkedin_profile'), 'last attempt still preserves history');
const empty = await run({ count: 0 });
assert.equal(empty.result.done, 1); assert.equal(empty.result.failed, 0);
assert.ok(empty.calls.some(c => c.name === 'replace_linkedin_profile'), 'confirmed empty first profile still imports the remaining LinkedIn sections');
console.log('PASS: count errors/null counts preserve history, retry and stop safely; existing-history empty scrape stays safe; confirmed-zero first import still works');
