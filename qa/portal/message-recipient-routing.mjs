// Actual recipient resolution and scheduled delivery, with an in-memory database and provider.
// node --experimental-vm-modules qa/portal/message-recipient-routing.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const tables = {}, sent = []; let emailNetworkFailure = false;
class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-06T19:00:00Z'])); } static now() { return new Date('2026-10-06T19:00:00Z').getTime(); } }
const context = vm.createContext({ URL, URLSearchParams, Request, Response, TextEncoder, Date: FixtureDate, Map, Set, crypto: webcrypto, btoa, setTimeout, Deno: { serve() {}, env: { get(name) { return ({ RESEND_API_KEY: 'offline-key', RESEND_FROM: 'TroyLabs <hello@usctroylabs.com>', TWILIO_ACCOUNT_SID: 'offline-sid', TWILIO_AUTH_TOKEN: 'offline-token', TWILIO_FROM: '+12135550000', SUPABASE_URL: 'https://fixture.invalid' })[name]; } } }, async fetch(url, init) { sent.push({ url, body: String(init.body) }); if (url.includes('resend.com') && emailNetworkFailure) throw new Error('Offline transport failure'); if (url.includes('resend.com')) return new Response(JSON.stringify({ data: JSON.parse(init.body).map((_, i) => ({ id: `email-${i}` })) })); return new Response(JSON.stringify({ sid: `SM-${sent.length}`, status: 'queued' }), { status: 201 }); } });
const root = new URL('../../supabase/functions/', import.meta.url), modules = new Map();
for (const name of ['sms', 'audience']) modules.set(`../_shared/${name}.ts`, new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL(`_shared/${name}.ts`, root), 'utf8')), { context }));
const client = new vm.SyntheticModule(['createClient'], function () { this.setExport('createClient', () => { throw new Error('Network client forbidden'); }); }, { context });
const module = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('send-message/index.ts', root), 'utf8')) + '\nexport { recipientsFor, deliver };', { context });
await module.link(s => s.startsWith('npm:') ? client : modules.get(s)); await module.evaluate();
class Query {
  constructor(table) { this.table = table; this.filters = []; this.op = 'select'; }
  select(columns, opts = {}) { this.count = opts.count; return this; }
  eq(k, v) { this.filters.push(r => r[k] === v); return this; }
  in(k, values) { this.filters.push(r => values.includes(r[k])); return this; }
  is(k, v) { this.filters.push(r => (r[k] ?? null) === v); return this; }
  not(k, op, v) { this.filters.push(r => (r[k] ?? null) !== v); return this; }
  update(fields) { this.op = 'update'; this.fields = fields; return this; }
  delete() { this.op = 'delete'; return this; }
  insert(rows) { this.op = 'insert'; this.rows = rows; return this; }
  maybeSingle() { this.one = true; return this; }
  single() { this.one = true; return this; }
  then(resolve, reject) {
    try {
      let rows = (tables[this.table] ?? []).filter(r => this.filters.every(f => f(r)));
      if (this.op === 'update') rows.forEach(r => Object.assign(r, this.fields));
      if (this.op === 'delete') tables[this.table] = (tables[this.table] ?? []).filter(r => !rows.includes(r));
      if (this.op === 'insert') { rows = Array.isArray(this.rows) ? this.rows : [this.rows]; (tables[this.table] ??= []).push(...rows); }
      return Promise.resolve({ data: this.one ? rows[0] ?? null : rows, error: null, count: this.count ? rows.length : null }).then(resolve, reject);
    } catch (e) { return Promise.reject(e).then(resolve, reject); }
  }
}
const svc = { from: table => new Query(table) };
const person = (id, status = 'alum', divisions = ['TECH'], extras = {}) => ({ id, full_name: id, status, divisions, join_term: 'FA', join_year: 2021, industries: ['AI'], approved: true, is_test: false, personal_email: `${id}@unit-fixture.org`, usc_email: null, email_opt_in: true, phone: `+1213555${String(id.length).padStart(4, '0')}`, phone_opt_in: true, ...extras });
const groups = ['BUILD', 'DEMO', 'PRODUCT MANAGEMENT', 'VC/FINANCE', 'TECH', 'MARKETING', 'DESIGN'];
tables.profiles = groups.flatMap((g, i) => [person(`g${i}-student`, 'student', [g], { phone: `+1213555100${i}` }), person(`g${i}-alum`, 'alum', [g], { phone: `+1213555200${i}` })]);
tables.profiles.push(person('real-admin', 'alum', []), person('test-admin', 'alum', [], { is_test: true }), person('test-member', 'alum', ['TECH'], { is_test: true }));
tables.eboard_roles = [{ profile_id: 'g4-student', term: 'FA', year: 2026 }, { profile_id: 'g6-alum', term: 'SP', year: 2020 }];
const msg = (cells, extra = {}) => ({ id: 1, title: 'Offline test', body: 'Offline content', send_by: 'both', created_by: 'real-admin', audience: { cells }, state: 'scheduled', scheduled_for: '2026-10-06T19:00:00Z', event: null, ...extra });
const ids = rows => rows.map(r => r.id).sort().join(',');
for (const [i, group] of groups.entries()) for (const who of ['current', 'alumni']) {
  const result = await module.namespace.recipientsFor(svc, msg([{ group, who }]), 'real-admin');
  const expected = `g${i}-${who === 'current' ? 'student' : 'alum'}`;
  assert.equal(ids(result.email), expected, `${group} ${who} email`); assert.equal(ids(result.text), expected, `${group} ${who} SMS`);
}
for (const [who, expected] of [['current', 'g4-student'], ['alumni', 'g6-alum']]) { const r = await module.namespace.recipientsFor(svc, msg([{ group: 'E-BOARD', who }]), 'real-admin'); assert.equal(ids(r.email), expected); assert.equal(ids(r.text), expected); }
assert.equal((await module.namespace.recipientsFor(svc, msg([]), 'real-admin')).email.length, 0);
const tech = [{ group: 'TECH', who: 'alumni' }];
tables.profiles.push(person('optout', 'alum', ['TECH'], { email_opt_in: false, phone_opt_in: false }), person('pending', 'alum', ['TECH'], { approved: false }), person('missing-contact', 'alum', ['TECH'], { personal_email: null, usc_email: null, phone: null }), person('duplicate', 'alum', ['TECH'], { personal_email: '  G4-ALUM@unit-fixture.org  ', phone: '+12135552004' }));
let r = await module.namespace.recipientsFor(svc, msg(tech), 'real-admin'); assert.equal(ids(r.email), 'g4-alum'); assert.equal(ids(r.text), 'g4-alum');
const narrow = msg(tech, { audience: { cells: tech, cohort: ['SP19'], industries: ['AI'] } }); assert.equal((await module.namespace.recipientsFor(svc, narrow, 'real-admin')).email.length, 0);
const overlaps = msg([{ group: 'EVERYONE', who: 'alumni' }, ...tech]); r = await module.namespace.recipientsFor(svc, overlaps, 'real-admin'); assert.equal(r.email.filter(p => p.id === 'g4-alum').length, 1);
// A scheduled message resolves recipients at send time; edits since scheduling matter.
tables.messages = [msg(tech)]; tables.message_recipients = [];
tables.profiles.find(p => p.id === 'g4-alum').phone_opt_in = false;
tables.profiles.find(p => p.id === 'duplicate').phone_opt_in = false;
const delivery = await module.namespace.deliver(svc, 1, null, { email: null, phone: null });
assert.equal(delivery.status, 200); assert.equal(sent.length, 1); assert.ok(sent[0].url.includes('resend.com')); assert.deepEqual(JSON.parse(sent[0].body)[0].to, ['g4-alum@unit-fixture.org']); assert.equal(tables.messages[0].state, 'sent');
// Scheduled test-world resolution follows the original author; actual admin identity controls manual previews.
const testDraft = msg(tech, { created_by: 'test-admin' });
assert.equal(ids((await module.namespace.recipientsFor(svc, testDraft, null)).email), 'test-member');
assert.equal(ids((await module.namespace.recipientsFor(svc, testDraft, 'real-admin')).email), 'g4-alum');
// Newly opted-in real member joins a scheduled audience; no saved stale recipient snapshot.
tables.profiles.push(person('new-member', 'alum', ['TECH'], { phone: '+12135550999' }));
assert.equal(ids((await module.namespace.recipientsFor(svc, msg(tech), null)).text), 'new-member');
console.log('PASS: every division + e-board current/alumni, zero audience, approval/opt-out/contact filters, normalized email + phone dedup, intersected narrowing, overlap dedup, real/test isolation, scheduled resolution uses latest contacts/opt-ins');

emailNetworkFailure = true; tables.messages = [msg(tech, { send_by: 'email' })]; tables.message_recipients = [];
const failedDelivery = await module.namespace.deliver(svc, 1, null, { email: null, phone: null });
assert.equal(failedDelivery.status, 502); assert.equal(tables.messages[0].state, 'draft', 'network failure must release the scheduled sending lock');
assert.match(tables.messages[0].last_error, /confirm whether Resend accepted/);
assert.ok(tables.message_recipients.every(r => !r.delivered_at && r.error), 'failed recipients retain actionable error without claiming delivery');
console.log('PASS: email transport failure returns scheduled message to draft with error; no stranded sending lock or false delivery');

// People audiences use real UUID-shaped fixture IDs; no supplied address or stale group can add a recipient.
emailNetworkFailure = false; sent.length = 0;
const uuid = n => `abcdef00-0000-4000-8000-${String(n).padStart(12, '0')}`;
const selected = (profile_ids, extra = {}) => msg([], { audience: { mode: 'people', profile_ids, cells: [], ...extra } });
tables.profiles.push(
  person(uuid(1), 'student', ['DESIGN'], { personal_email: 'chosen@unit-fixture.org', phone: '+12135553001' }),
  person(uuid(2), 'alum', ['TECH'], { approved: false }),
  person(uuid(3), 'alum', ['TECH'], { is_test: true, phone: '+12135553003' }),
  person(uuid(4), 'alum', ['TECH'], { email_opt_in: false, phone_opt_in: false }),
  person(uuid(5), 'alum', ['TECH'], { personal_email: ' CHOSEN@unit-fixture.org ', phone: '+12135553001' }),
  person(uuid(6), 'alum', ['TECH'], { personal_email: null, usc_email: null, phone: null }),
  person(uuid(7), 'alum', ['TECH'], { phone: '+12135553007' }),
);
const selectedIds = [uuid(1), ` ${uuid(1).toUpperCase()} `, uuid(2), uuid(3), uuid(4), uuid(5), uuid(6), uuid(99), 'spoofed', { id: uuid(7) }];
const chosenDraft = selected(selectedIds, { cells: [{ group: 'EVERYONE', who: 'alumni' }], cohort: ['SP19'], industries: ['unrelated'] });
r = await module.namespace.recipientsFor(svc, chosenDraft, 'real-admin');
assert.equal(ids(r.email), uuid(1)); assert.equal(ids(r.text), uuid(1));
assert.equal(ids((await module.namespace.recipientsFor(svc, { ...chosenDraft, created_by: 'test-admin' }, null)).email), uuid(3), 'scheduled explicit people preserve author test isolation');
assert.equal(ids((await module.namespace.recipientsFor(svc, chosenDraft, 'test-admin')).text), uuid(3), 'manual explicit people preserve actor test isolation');
for (const empty of [[], ['spoofed'], null]) {
  tables.messages = [selected(empty, { cells: tech })]; tables.message_recipients = [];
  const emptyDelivery = await module.namespace.deliver(svc, 1, 'real-admin', { email: null, phone: null });
  assert.equal(emptyDelivery.status, 400); assert.match(emptyDelivery.body.error, /choose at least one person/);
  assert.equal(tables.messages[0].state, 'scheduled'); assert.equal(sent.length, 0, 'empty people selection never reaches provider');
}
// A newly added matching group member never joins an explicit scheduled selection. Re-read current opt-ins and contacts.
tables.messages = [chosenDraft]; tables.message_recipients = [];
tables.profiles.find(p => p.id === uuid(1)).phone_opt_in = false;
tables.profiles.find(p => p.id === uuid(5)).phone_opt_in = false;
tables.profiles.find(p => p.id === uuid(1)).personal_email = 'updated@unit-fixture.org';
tables.profiles.find(p => p.id === uuid(5)).email_opt_in = false;
const chosenDelivery = await module.namespace.deliver(svc, 1, null, { email: null, phone: null });
assert.equal(chosenDelivery.status, 200); assert.equal(tables.messages[0].state, 'sent'); assert.equal(sent.length, 1);
assert.deepEqual(JSON.parse(sent[0].body).map(m => m.to), [['updated@unit-fixture.org']], 'explicit scheduled send resolves only selected, currently eligible contacts');
assert.equal(tables.message_recipients.length, 1); assert.equal(tables.message_recipients[0].profile_id, uuid(1));
sent.length = 0;
for (const excluded of [[uuid(2)], [uuid(3)], [uuid(4)], [uuid(6)], [uuid(99)]]) {
  tables.messages = [selected(excluded)]; tables.message_recipients = [];
  const nobody = await module.namespace.deliver(svc, 1, 'real-admin', { email: null, phone: null });
  assert.equal(nobody.status, 400); assert.match(nobody.body.error, /Nobody matches/); assert.equal(sent.length, 0);
}
console.log('PASS: explicit approved people only, UUID sanitization, unapproved/unknown/spoofed/test IDs excluded, opted-out/missing contacts excluded, contact dedup, empty selection guard, scheduled current contacts/consent without group expansion');
