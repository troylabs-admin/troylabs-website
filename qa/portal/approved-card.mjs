// The "You're in!" text with the TroyLabs contact card (2026-10-10): the real edge handler with an offline database and a
// fake Twilio. Never opens a real connection, never texts anyone.
// node --experimental-vm-modules qa/portal/approved-card.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { APPROVED_TEXT, APPROVED_TEXT_WITH_CARD, CONTACT_CARD_URL } from '../../supabase/functions/_shared/sms.ts';
const base = new URL('../../supabase/functions/', import.meta.url);
const MEMBER = { id: 'member-1', phone: '+12135550150', is_test: false };

/** twilio: what each Messages.json call answers, in order ('ok' | a Twilio error code | 'network') */
async function approve({ people = [MEMBER], before = [], twilio = ['ok'] } = {}) {
  const calls = [], events = []; let handler, n = 0;
  const table = (name) => { const q = { select: () => q, in: () => q, eq: () => q, not: () => q, gte: () => q, maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }),
    insert: (row) => { if (name === 'profile_events') events.push(row); return Promise.resolve({ error: null }); },
    then: (ok) => ok({ data: name === 'profiles' ? people : name === 'profile_events' ? before : [], error: null }) }; return q; };
  const svc = { from: table, auth: { admin: { getUserById: async () => ({ data: null }) } } };
  const user = { rpc: async () => ({ data: true }), auth: { getUser: async () => ({ data: { user: { id: 'admin-a', email: 'a@example.com' } } }) }, from: table };
  const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', SUPABASE_ANON_KEY: 'fixture-anon', TWILIO_ACCOUNT_SID: 'fixture-sid', TWILIO_AUTH_TOKEN: 'fixture-token', TWILIO_FROM: '+12136986332' };   // no RESEND key: the email half answers "not connected" and is not under test here
  const context = vm.createContext({ URL, URLSearchParams, Request, Response, TextEncoder, Date, Map, Set, crypto: webcrypto, btoa, console, setTimeout: (fn) => setTimeout(fn, 0), Deno: { serve(fn) { handler = fn; }, env: { get: (k) => env[k] } }, async fetch(url, init) {
    if (!String(url).includes('/Messages.json')) throw new Error(`Unexpected request: ${url}`);
    const form = new URLSearchParams(String(init?.body ?? '')); calls.push({ to: form.get('To'), body: form.get('Body'), media: form.get('MediaUrl') });
    const answer = twilio[n++] ?? 'ok';
    if (answer === 'network') throw new Error('Fixture network failure');
    return answer === 'ok' ? new Response(JSON.stringify({ sid: `MMfixture${n}`, status: 'queued' }), { status: 201 }) : new Response(JSON.stringify({ code: answer, message: 'Fixture refusal' }), { status: 400 });
  } });
  const client = new vm.SyntheticModule(['createClient'], function () { this.setExport('createClient', (url, key) => key === 'fixture-service' ? svc : user); }, { context });
  const modules = new Map();
  for (const name of ['sms', 'audience', 'recurrence']) modules.set(`../_shared/${name}.ts`, new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL(`_shared/${name}.ts`, base), 'utf8')), { context }));
  const main = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('send-message/index.ts', base), 'utf8')), { context });
  await main.link((s) => s.startsWith('npm:') ? client : modules.get(s)); await main.evaluate();
  const res = await handler(new Request('https://fixture.invalid/functions/v1/send-message', { method: 'POST', headers: { Authorization: 'Bearer offline-fixture', 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'approved', ids: people.map((p) => p.id) }) }));
  return { texted: (await res.json()).texted, calls, events: events.filter((e) => e.event === 'texts_welcome').map((e) => e.detail) };
}

assert.ok(/^https:\/\/usctroylabs\.com\/troylabs\.vcf\?v=\d+$/.test(CONTACT_CARD_URL));
assert.ok(APPROVED_TEXT_WITH_CARD.startsWith("TroyLabs: You're in!") && /contact card/.test(APPROVED_TEXT_WITH_CARD) && /Reply HELP for help, STOP to cancel\.$/.test(APPROVED_TEXT_WITH_CARD) && /^[\x20-\x7e]+$/.test(APPROVED_TEXT_WITH_CARD), 'names us, mentions the card, keeps HELP/STOP, plain characters');

let r = await approve();
assert.deepEqual(r.calls, [{ to: MEMBER.phone, body: APPROVED_TEXT_WITH_CARD, media: CONTACT_CARD_URL }]); assert.equal(r.texted, 1);
assert.deepEqual(r.events.map((d) => [d.ok, d.card, d.approved, d.sid]), [[true, true, true, 'MMfixture1']]);
console.log('PASS: approving a member sends ONE picture message: the "You\'re in!" text with the contact card, recorded as card: true');

r = await approve({ twilio: [12300, 'ok'] });
assert.deepEqual(r.calls, [{ to: MEMBER.phone, body: APPROVED_TEXT_WITH_CARD, media: CONTACT_CARD_URL }, { to: MEMBER.phone, body: APPROVED_TEXT, media: null }]); assert.equal(r.texted, 1);
assert.equal(r.events.length, 1); assert.deepEqual([r.events[0].ok, r.events[0].card], [true, false]); assert.match(r.events[0].cardError, /^12300: /);
console.log('PASS: the picture message refused → the plain "You\'re in!" goes instead (no card), with the reason recorded; one event, one person texted');

r = await approve({ twilio: [21610, 21610] });
assert.equal(r.calls.length, 2); assert.equal(r.texted, 0); assert.deepEqual([r.events[0].ok, r.events[0].card, r.events[0].code], [false, false, 21610]);
console.log('PASS: refused both ways (the phone replied STOP) → nobody counted as texted, the failure recorded');

r = await approve({ twilio: ['network'] });
assert.equal(r.calls.length, 1, 'no second try when Twilio may have taken the first'); assert.equal(r.texted, 0); assert.deepEqual([r.events[0].ok, r.events[0].card], [false, false]);
console.log('PASS: Twilio unreachable → no retry (it could text twice)');

r = await approve({ people: [{ id: 'qa-1', phone: '+12135550151', is_test: true }] });
assert.deepEqual(r.calls, []); assert.deepEqual([r.events[0].test, r.events[0].card], [true, true]); assert.equal(r.texted, 1);
console.log('PASS: a test account is recorded, never texted');

r = await approve({ before: [{ profile_id: MEMBER.id, detail: { phone: MEMBER.phone, ok: true } }] });
assert.deepEqual(r.calls, []); assert.deepEqual(r.events, []); assert.equal(r.texted, 0);
console.log('PASS: someone who already had their first text on this number gets nothing again (UNDO then approve)');
