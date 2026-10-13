// The one-time first text for members approved before texts worked (2026-10-12): the real edge handler with an offline
// database and a fake Twilio. Never opens a real connection, never texts anyone.
// node --experimental-vm-modules --experimental-strip-types qa/portal/first-text-backlog.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { APPROVED_TEXT, APPROVED_TEXT_WITH_CARD, CARD_ONLY_TEXT, CONTACT_CARD_URL } from '../../supabase/functions/_shared/sms.ts';
const base = new URL('../../supabase/functions/', import.meta.url);
const P = (n, name, phone = `+1213555${String(1000 + n)}`) => ({ id: `m${n}`, full_name: name, phone });
const ANA = P(1, 'Ana'), BEN = P(2, 'Ben'), CAL = P(3, 'Cal'), DEE = P(4, 'Dee'), VITO = P(5, 'Vito');
const NOON = Date.parse('2026-10-12T19:00:00Z'), NIGHT = Date.parse('2026-10-12T05:30:00Z');   // 12:00 PM and 10:30 PM Pacific

/** twilio: per phone, what each Messages.json call answers in order ('ok' | a Twilio error code | 'network'); default 'ok' */
async function run({ members = [ANA, BEN, CAL, DEE, VITO], events = [], twilio = {}, now = NOON, secret = 'fixture-secret', body = {} } = {}) {
  const calls = [], written = [], filters = []; let handler; const tries = {};
  const table = (name) => { const q = { select: () => q, order: () => q, gte: () => q,
    in: (...a) => { filters.push([name, 'in', ...a]); return q; }, eq: (...a) => { filters.push([name, 'eq', ...a]); q.last = a; return q; }, not: (...a) => { filters.push([name, 'not', ...a]); return q; },
    maybeSingle: async () => ({ data: name === 'admins' && q.last?.[1] === 'admin-a' ? { user_id: 'admin-a' } : null }), single: async () => ({ data: null }),
    insert: (row) => { if (name === 'profile_events') written.push(row); return Promise.resolve({ error: null }); },
    then: (ok) => ok({ data: name === 'profiles' ? members : name === 'profile_events' ? events : [], error: null }) }; return q; };
  const svc = { from: table }; const user = { rpc: async () => ({ data: false }), auth: { getUser: async () => ({ data: { user: null } }) }, from: table };
  const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', SUPABASE_ANON_KEY: 'fixture-anon', CRON_SECRET: 'fixture-secret', TWILIO_ACCOUNT_SID: 'fixture-sid', TWILIO_AUTH_TOKEN: 'fixture-token', TWILIO_FROM: '+12136986332' };
  class Clock extends Date { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return now; } }
  let waited = 0;
  const context = vm.createContext({ URL, URLSearchParams, Request, Response, TextEncoder, Date: Clock, Map, Set, Intl, crypto: webcrypto, btoa, console, setTimeout: (fn, ms) => { waited += ms; return setTimeout(fn, 0); }, Deno: { serve(fn) { handler = fn; }, env: { get: (k) => env[k] } }, async fetch(url, init) {
    if (!String(url).includes('/Messages.json')) throw new Error(`Unexpected request: ${url}`);
    const form = new URLSearchParams(String(init?.body ?? '')); const to = form.get('To'); calls.push({ to, body: form.get('Body'), media: form.get('MediaUrl') });
    const answer = (twilio[to] ?? [])[tries[to] ?? 0] ?? 'ok'; tries[to] = (tries[to] ?? 0) + 1;
    if (answer === 'network') throw new Error('Fixture network failure');
    return answer === 'ok' ? new Response(JSON.stringify({ sid: `MM${to.slice(-4)}`, status: 'queued' }), { status: 201 }) : new Response(JSON.stringify({ code: answer, message: 'Fixture refusal' }), { status: 400 });
  } });
  const client = new vm.SyntheticModule(['createClient'], function () { this.setExport('createClient', (url, key) => key === 'fixture-service' ? svc : user); }, { context });
  const modules = new Map();
  for (const name of ['sms', 'audience', 'recurrence']) modules.set(`../_shared/${name}.ts`, new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL(`_shared/${name}.ts`, base), 'utf8')), { context }));
  const main = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('send-message/index.ts', base), 'utf8')), { context });
  await main.link((s) => s.startsWith('npm:') ? client : modules.get(s)); await main.evaluate();
  const res = await handler(new Request('https://fixture.invalid/functions/v1/send-message', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret }, body: JSON.stringify({ mode: 'first-text-backlog', actor: 'admin-a', cardOnly: [VITO.id], ...body }) }));
  return { status: res.status, out: await res.json(), calls, events: written, filters, waited };
}
const welcome = (p) => ({ to: p.phone, body: APPROVED_TEXT_WITH_CARD, media: CONTACT_CARD_URL }), cardOnly = (p) => ({ to: p.phone, body: CARD_ONLY_TEXT, media: CONTACT_CARD_URL });

assert.ok(CARD_ONLY_TEXT.startsWith('TroyLabs: ') && /contact card/.test(CARD_ONLY_TEXT) && /STOP/.test(CARD_ONLY_TEXT) && !/You're in/.test(CARD_ONLY_TEXT) && /^[\x20-\x7e]+$/.test(CARD_ONLY_TEXT));

let r = await run({ secret: 'wrong' }); assert.equal(r.status, 403); assert.deepEqual(r.calls, []);
r = await run({ body: { actor: 'someone-else' } }); assert.equal(r.status, 403); assert.deepEqual(r.calls, []);
r = await run({ body: { actor: undefined } }); assert.equal(r.status, 403);
console.log('PASS: only the scheduler\'s secret starts it, and only on an admin\'s order');

r = await run({ body: { dry: true } });
assert.equal(r.status, 200); assert.deepEqual(r.calls, []); assert.deepEqual(r.events, []);
assert.deepEqual(r.out.plan.map((x) => [x.name, x.gets]), [['Ana', 'welcome + card'], ['Ben', 'welcome + card'], ['Cal', 'welcome + card'], ['Dee', 'welcome + card'], ['Vito', 'card only']]);
assert.ok(r.out.plan.every((x) => /^…\d{4}$/.test(x.to)), 'numbers shown by their last four only');
for (const f of [['profiles', 'eq', 'approved', true], ['profiles', 'eq', 'is_test', false], ['profiles', 'eq', 'phone_opt_in', true], ['profiles', 'not', 'phone', 'is', null]]) assert.ok(r.filters.some((x) => JSON.stringify(x) === JSON.stringify(f)), `asks the database for ${f.slice(2).join(' ')}`);
r = await run({ body: { dry: true }, now: NIGHT }); assert.equal(r.out.hoursOpen, false); assert.equal(r.out.plan.length, 5);
console.log('PASS: a dry run lists exactly who gets what (approved, real, texts on, has a number) and sends nothing');

r = await run({ body: { limit: 3 } });
assert.deepEqual(r.calls, [welcome(ANA), welcome(BEN), welcome(CAL)]); assert.equal(r.out.remaining, 2); assert.equal(r.out.sent.length, 3); assert.deepEqual(r.out.failed, []);
assert.deepEqual(r.events.map((e) => [e.profile_id, e.event, e.actor, e.detail.ok, e.detail.card, e.detail.backlog, e.detail.phone, e.detail.sid]), [ANA, BEN, CAL].map((p) => [p.id, 'texts_welcome', 'admin-a', true, true, true, p.phone, `MM${p.phone.slice(-4)}`]));
assert.equal(r.waited, 9000, 'a pause between texts, none before the first');
console.log('PASS: a run sends the welcome + card to the first few, a few seconds apart, each recorded with who ordered it');

const after = r.events.map((e) => ({ profile_id: e.profile_id, detail: e.detail }));
r = await run({ events: after });
assert.deepEqual(r.calls, [welcome(DEE), cardOnly(VITO)]); assert.equal(r.out.remaining, 0); assert.equal(r.events.at(-1).detail.cardOnly, true);
r = await run({ events: [...after, ...r.events.map((e) => ({ profile_id: e.profile_id, detail: e.detail }))] });
assert.deepEqual(r.calls, []); assert.deepEqual(r.out, { sent: [], failed: [], remaining: 0 });
console.log('PASS: running it again continues where it stopped; nobody is texted twice; Vito gets the card alone, with no second welcome');

r = await run({ events: [{ profile_id: ANA.id, detail: { phone: ANA.phone, ok: true, approved: true } }, { profile_id: BEN.id, detail: { phone: '+12135550000', ok: true, card: true } }], body: { limit: 2 } });
assert.deepEqual(r.calls, [welcome(ANA), welcome(BEN)]);
console.log('PASS: an earlier text WITHOUT the card (or a card sent to an old number) doesn\'t count: they still get this one');

r = await run({ twilio: { [BEN.phone]: [21408, 21408], [VITO.phone]: [30007] }, body: { limit: 12 } });
assert.deepEqual(r.calls, [welcome(ANA), welcome(BEN), { to: BEN.phone, body: APPROVED_TEXT, media: null }, welcome(CAL), welcome(DEE), cardOnly(VITO)]);
assert.deepEqual(r.out.sent.map((x) => x.name), ['Ana', 'Cal', 'Dee']); assert.deepEqual(r.out.failed.map((x) => [x.name, x.code]), [['Ben', 21408], ['Vito', 30007]]);
assert.deepEqual(r.events.filter((e) => !e.detail.ok).map((e) => [e.profile_id, e.detail.card, e.detail.code]), [[BEN.id, false, 21408], [VITO.id, false, 30007]]);
console.log('PASS: a refused number (say, a country that isn\'t enabled) is tried as plain text, recorded as failed, and stops nobody else; card-only has no plain fallback');

r = await run({ twilio: { [ANA.phone]: [12300, 'ok'] }, body: { limit: 1 } });
assert.deepEqual(r.calls, [welcome(ANA), { to: ANA.phone, body: APPROVED_TEXT, media: null }]); assert.deepEqual([r.out.sent[0].card, r.events[0].detail.card, r.events[0].detail.ok], [false, false, true]); assert.match(r.events[0].detail.cardError, /^12300/);
r = await run({ events: [{ profile_id: ANA.id, detail: r.events[0].detail }], body: { limit: 1 } }); assert.deepEqual(r.calls, [welcome(ANA)]);
console.log('PASS: picture message refused but the plain welcome accepted → recorded without the card, so a later run can still bring the card');

r = await run({ twilio: { [ANA.phone]: ['network'] }, body: { limit: 1 } });
assert.equal(r.calls.length, 1); assert.deepEqual(r.out.failed.map((x) => x.name), ['Ana']);
console.log('PASS: Twilio unreachable → no second try (it could text twice)');

r = await run({ now: NIGHT }); assert.equal(r.status, 409); assert.deepEqual(r.calls, []); assert.deepEqual(r.events, []);
r = await run({ now: NIGHT, body: { afterHours: 'yes' } }); assert.equal(r.status, 409); assert.deepEqual(r.calls, []);
r = await run({ now: NIGHT, body: { afterHours: true, limit: 2 } }); assert.equal(r.status, 200); assert.deepEqual(r.calls, [welcome(ANA), welcome(BEN)]);
console.log('PASS: outside 8 AM–9 PM Pacific nothing is sent, unless the order says afterHours: true outright');

r = await run({ members: [ANA, P(6, 'Ana Twin', ANA.phone), BEN, CAL], body: { skip: [CAL.id], limit: 12 } });
assert.deepEqual(r.calls, [welcome(ANA), welcome(BEN)]);
r = await run({ members: [ANA, P(6, 'Ana Twin', ANA.phone)], body: { dry: true } }); assert.deepEqual(r.out.sharedNumberLeftOut, ['Ana Twin']);
r = await run({ body: { limit: 99 } }); assert.equal(r.calls.length, 5); r = await run({ members: Array.from({ length: 20 }, (_, i) => P(100 + i, `M${i}`)), body: { limit: 99 } }); assert.equal(r.calls.length, 12, 'never more than 12 in one run');
console.log('PASS: skip list respected; a shared number is texted once and the other person is named; at most 12 per run');
