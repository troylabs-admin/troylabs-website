// Actual edge handler with offline auth/database/provider fixtures. Never opens a real connection.
// node --experimental-vm-modules qa/portal/message-self-test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const base = new URL('../../supabase/functions/', import.meta.url);
const ADMIN_A = { id: 'admin-a', email: 'a-login@example.com' }, ADMIN_B = { id: 'admin-b', email: 'b-login@example.com' };
async function fixture(options = {}) {
  const sent = [], reads = [], writes = []; let handler;
  const who = options.user ?? ADMIN_A;
  const profile = options.profile ?? { personal_email: 'a-personal@example.com', usc_email: 'a@usc.edu', phone: '+12135550111' };
  const message = { id: 42, created_by: ADMIN_B.id, title: 'Fixture subject', body: 'Fixture message', send_by: options.channel ?? 'both', audience: { cells: [{ group: 'EVERYONE', who: 'alumni' }] }, event: null, state: 'draft' };
  const svc = { from(table) { return { select(fields) { return { eq(column, value) { reads.push({ table, fields, column, value }); return { single: async () => ({ data: profile }), maybeSingle: async () => ({ data: message }) }; } }; }, update() { writes.push(table); throw new Error('Self-test must not update data'); }, insert() { writes.push(table); throw new Error('Self-test must not insert data'); } }; } };
  const user = { rpc: async () => ({ data: options.admin !== false }), auth: { getUser: async () => ({ data: { user: who } }) } };
  const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', SUPABASE_ANON_KEY: 'fixture-anon', RESEND_API_KEY: 'fixture-key', RESEND_FROM: 'TroyLabs <hello@usctroylabs.com>', TWILIO_ACCOUNT_SID: 'fixture-sid', TWILIO_AUTH_TOKEN: 'fixture-token', TWILIO_FROM: '+12135550000', ...options.env };
  const context = vm.createContext({ URL, URLSearchParams, Request, Response, TextEncoder, Date, Map, Set, crypto: webcrypto, btoa, console, setTimeout, Deno: { serve(fn) { handler = fn; }, env: { get(name) { return env[name]; } } }, async fetch(url, init) {
    sent.push({ url, method: init?.method ?? 'GET', body: String(init?.body ?? '') });
    if (String(url).includes('resend.com')) { if (options.emailNetworkFailure) throw new Error('Fixture network failure'); return new Response(JSON.stringify(options.emailFailure ? { message: 'Fixture rejected email' } : { data: [{ id: 'fixture-email' }] }), { status: options.emailFailure ? 422 : 200 }); }
    if (String(url).includes('/Messages.json')) return new Response(JSON.stringify(options.textFailure ? { code: 21608 } : { sid: 'SMfixture', status: 'queued' }), { status: options.textFailure ? 400 : 201 });
    if (String(url).includes('twilio.com')) return new Response(JSON.stringify({ type: 'Trial', status: 'active' }));
    throw new Error('Unexpected provider URL');
  } });
  const client = new vm.SyntheticModule(['createClient'], function () { this.setExport('createClient', (url, key) => key === 'fixture-service' ? svc : user); }, { context });
  const modules = new Map();
  for (const name of ['sms', 'audience']) modules.set(`../_shared/${name}.ts`, new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL(`_shared/${name}.ts`, base), 'utf8')), { context }));
  const main = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('send-message/index.ts', base), 'utf8')), { context });
  await main.link(specifier => specifier.startsWith('npm:') ? client : modules.get(specifier)); await main.evaluate();
  const response = await handler(new Request('https://fixture.invalid/functions/v1/send-message', { method: 'POST', headers: { Authorization: 'Bearer offline-fixture', 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: options.mode ?? 'test', messageId: 42, profileId: ADMIN_B.id, email: 'attacker@example.com', phone: '+12135550999', recipients: [ADMIN_B.id] }) }));
  return { status: response.status, body: await response.json(), sent, reads, writes };
}
for (const channel of ['email', 'text', 'both']) {
  const r = await fixture({ channel }); assert.equal(r.status, 200);
  const email = r.sent.find(s => s.url.includes('resend.com')), text = r.sent.find(s => s.url.includes('/Messages.json'));
  if (channel !== 'text') { const batch = JSON.parse(email.body); assert.equal(batch.length, 1); assert.deepEqual(batch[0].to, ['a-personal@example.com']); assert.match(batch[0].subject, /^\[TEST\]/); }
  if (channel !== 'email') { const form = new URLSearchParams(text.body); assert.equal(form.get('To'), '+12135550111'); assert.match(form.get('Body'), /^\[TEST\] TroyLabs:/); }
  assert.equal(r.sent.length, channel === 'both' ? 2 : 1); assert.deepEqual(r.writes, []);
  assert.ok(r.reads.some(x => x.table === 'profiles' && x.value === ADMIN_A.id));
  assert.ok(!r.reads.some(x => x.table === 'profiles' && x.value === ADMIN_B.id));
}
const second = await fixture({ user: ADMIN_B, profile: { personal_email: null, usc_email: 'b@usc.edu', phone: '+12135550222' } });
assert.equal(second.body.email, 'b@usc.edu'); assert.equal(second.body.text, '+12135550222');
const fallback = await fixture({ channel: 'email', profile: { personal_email: null, usc_email: null, phone: null } }); assert.equal(fallback.body.email, ADMIN_A.email);
const denied = await fixture({ admin: false }); assert.equal(denied.status, 403); assert.equal(denied.sent.length, 0);
const missing = await fixture({ profile: { personal_email: 'a@example.com', phone: null } }); assert.equal(missing.status, 400); assert.equal(missing.sent.length, 0, 'both channels preflight before sending either');
const noText = await fixture({ env: { TWILIO_AUTH_TOKEN: '' } }); assert.equal(noText.status, 503); assert.equal(noText.sent.length, 0);
for (const f of [{ emailFailure: true }, { textFailure: true }]) { const r = await fixture(f); assert.equal(r.status, 502); assert.ok(r.body.error); assert.equal(r.sent.length, 2); assert.ok(r.body.email || r.body.text, 'partial success retained'); }
const status = await fixture({ mode: 'status' }); assert.equal(status.body.email.testTo, 'a-personal@example.com'); assert.equal(status.body.text.testTo, '+12135550111'); assert.ok(status.sent.every(s => s.method === 'GET'), 'status never sends');
console.log('PASS: all channels target signed-in admin only; spoofed recipient/author ignored; two admin identities isolated; email fallbacks, authorization, preflight, provider partial failures, status read-only');
// Transport failure should be a recoverable response, retaining the other channel outcome.
const network = await fixture({ emailNetworkFailure: true });
assert.equal(network.status, 502); assert.match(network.body.error, /confirm|reach/i); assert.equal(network.body.text, '+12135550111');
console.log('PASS: email network failure is handled; SMS result remains visible');
