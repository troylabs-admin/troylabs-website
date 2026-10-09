// Real PostgreSQL migration/RPC + actual edge source, isolated in PGlite with mocked providers.
// node --experimental-vm-modules qa/portal/recurrence-backend.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite(), sends = [];
let clock = new Date('2026-10-06T17:05:00Z');
const asJSON = value => JSON.parse(JSON.stringify(value));
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const rule = { frequency: 'daily', interval: 1, timezone: 'America/Los_Angeles', start_local: '2026-10-06T10:00', end: { type: 'count', count: 5 } };
const audience = { mode: 'people', cells: [], profile_ids: ['00000000-0000-4000-8000-000000000002'] };
const author = '00000000-0000-4000-8000-000000000001';
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.role() returns text language sql as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
    create function public.is_admin() returns boolean language sql as $$ select current_setting('fixture.admin',true) is distinct from 'false' $$;
    create table messages(id bigserial primary key,title text not null default '',body text not null default '',send_by text default 'text',audience jsonb,event jsonb,created_by uuid,state text constraint messages_state_check check(state in('draft','scheduled','sending','sent','cancelled')),scheduled_for timestamptz(3),updated_at timestamptz(3) default clock_timestamp(),sent_by uuid,sent_at timestamptz,sent_count integer default 0,failed_count integer default 0,last_error text);
    create function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
    create trigger messages_touch before update on messages for each row execute function touch_updated_at();
    create table profiles(id uuid primary key,full_name text,status text,join_term text,join_year integer,divisions jsonb,industries jsonb,approved boolean,is_test boolean,personal_email text,usc_email text,email_opt_in boolean,phone text,phone_opt_in boolean);
    create table eboard_roles(profile_id uuid,term text,year integer);
    create table message_recipients(message_id bigint references messages(id),profile_id uuid,channel text,email text,phone text,delivered_at timestamptz,provider_id text,status text,error text,primary key(message_id,profile_id,channel));
  `);
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261008000100_recurring_messages.sql', import.meta.url), 'utf8'));
  await db.exec('grant usage on schema public,auth to authenticated; grant all on messages to authenticated; grant usage,select on all sequences in schema public to authenticated;');
  const insertSeries = async (patch = {}) => {
    const value = { title: 'Recurring fixture', body: 'Offline only', send_by: 'text', audience, recurrence: rule, state: 'scheduled', scheduled_for: '2026-10-06T17:00:00Z', created_by: author, ...patch };
    const keys = Object.keys(value), vals = Object.values(value).map(v => v && typeof v === 'object' ? JSON.stringify(v) : v);
    return asJSON((await q(`insert into messages(${keys.join(',')}) values(${keys.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, vals))[0]);
  };
  const materialize = (s, occurrence = s.scheduled_for, next = '2026-10-07T17:00:00Z', index = 1, skipped = 0) => q('select materialize_message_occurrence($1,$2,$3,$4,$5,$6,$7) as id', [s.id,s.updated_at,s.scheduled_for,occurrence,next,index,skipped]);
  // RPC compares its advancement against database now; worker tests below freeze a fixture SQL clock.
  await db.exec(`create function public.now() returns timestamptz language sql as $$ select coalesce(nullif(current_setting('fixture.now',true),''),'2026-10-06T17:05:00Z')::timestamptz $$;`);
  // pg_catalog normally precedes public; put the fixture clock first only in the isolated test database.
  await db.exec('alter function materialize_message_occurrence(bigint,timestamptz,timestamptz,timestamptz,timestamptz,integer,integer) set search_path=public,pg_catalog; alter function replace_message_series(bigint,timestamptz,jsonb) set search_path=public,pg_catalog;');
  let s = await insertSeries();
  const duplicate = await Promise.all([materialize(s),materialize(s)]);
  assert.equal(duplicate.flat().filter(x => x.id != null).length, 1, 'repeated/concurrent calls create one occurrence');
  let parent = (await q('select * from messages where id=$1',[s.id]))[0];
  assert.equal(parent.recurrence_index, 1); assert.equal(parent.state, 'scheduled');
  assert.equal((await q('select * from messages where parent_series_id=$1',[s.id])).length, 1);
  await assert.rejects(q('insert into messages(parent_series_id,occurrence_at,state) values($1,$2,$3)',[s.id,s.scheduled_for,'scheduled']), /duplicate key/);
  s = await insertSeries();
  await q('update messages set body=$1 where id=$2',['Concurrent admin edit',s.id]);
  assert.equal((await materialize(s))[0].id, null, 'stale expected version cannot send old edited content');
  await assert.rejects(insertSeries({recurrence:{...rule,interval:0}}), /interval/);
  await assert.rejects(insertSeries({send_by:'email'}), /texts only/);
  await db.exec("set role authenticated; select set_config('request.jwt.claim.role','authenticated',false);");
  await assert.rejects(materialize(s), /permission denied/, 'admins cannot call service-only advancement RPC');
  await assert.rejects(insertSeries({recurrence_index:10}), /scheduler/);
  await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false);");
  // Atomic replacement retains original when validation fails, and stops pending children on success.
  s = await insertSeries(); await materialize(s); s = asJSON((await q('select * from messages where id=$1',[s.id]))[0]);
  const replacement = {title:'Replacement',body:'New text',audience,recurrence:{...rule,start_local:'2026-10-08T10:00'},state:'scheduled',scheduled_for:'2026-10-08T17:00:00Z'};
  await db.exec("set role authenticated; select set_config('request.jwt.claim.role','authenticated',false);");
  await assert.rejects(q('select replace_message_series($1,$2,$3)',[s.id,s.updated_at,JSON.stringify({...replacement,recurrence:{...rule,interval:0}})]),/interval/);
  assert.equal((await q('select state from messages where id=$1',[s.id]))[0].state,'scheduled');
  const replaced = (await q('select (replace_message_series($1,$2,$3)).id',[s.id,s.updated_at,JSON.stringify(replacement)]))[0];
  assert.ok(replaced.id); assert.equal((await q('select state from messages where id=$1',[s.id]))[0].state,'cancelled');
  assert.equal((await q('select state from messages where parent_series_id=$1',[s.id]))[0].state,'cancelled');
  await db.exec("select set_config('fixture.admin','false',false)");
  await assert.rejects(q('select replace_message_series($1,$2,$3)',[s.id,s.updated_at,JSON.stringify(replacement)]),/Admins only/);
  await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false); select set_config('fixture.admin','true',false);");
  for (const oneTime of [{ ...replacement, recurrence: null }, { title: 'Independent draft', body: 'Finish later', audience, state: 'draft', scheduled_for: null }]) {
    const original = await insertSeries(); await materialize(original);
    const started = asJSON((await q('select * from messages where id=$1',[original.id]))[0]);
    await db.exec("set role authenticated; select set_config('request.jwt.claim.role','authenticated',false);");
    await assert.rejects(q('select replace_message_series($1,$2,$3)',[started.id,started.updated_at,JSON.stringify({...oneTime,state:'scheduled',scheduled_for:'2026-10-05T17:00:00Z'})]),/future/);
    assert.equal((await q('select state from messages where id=$1',[started.id]))[0].state,'scheduled','invalid one-time conversion retains original');
    assert.equal((await q('select state from messages where parent_series_id=$1',[started.id]))[0].state,'scheduled','rollback keeps pending child');
    const converted = (await q('select (replace_message_series($1,$2,$3)).id',[started.id,started.updated_at,JSON.stringify(oneTime)]))[0];
    const row = (await q('select * from messages where id=$1',[converted.id]))[0];
    assert.equal(row.recurrence,null,'both JSON null and absent recurrence become SQL NULL');
    assert.equal(row.parent_series_id,null); assert.equal(row.recurrence_index,0); assert.equal(row.state,oneTime.state);
    assert.equal((await q('select state from messages where id=$1',[started.id]))[0].state,'cancelled');
    assert.equal((await q('select state from messages where parent_series_id=$1',[started.id]))[0].state,'cancelled');
    await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false);");
  }
  await db.exec('truncate message_recipients,messages restart identity cascade;');
  console.log('PASS: real PostgreSQL migration, unique occurrence, repeated RPC idempotency, optimistic version, service-only advancement, validation, atomic replacement/rollback/cancellation');
  console.log('PASS: authenticated started-series conversion to one-time schedule or independent draft, SQL NULL normalization, invalid conversion rolls back original/pending child');

  // Supabase-shaped adapter executes real fixture SQL; the edge function and recurrence helper are unchanged.
  const param = v => v && typeof v === 'object' ? JSON.stringify(v) : v;
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.values = []; this.op = 'select'; }
    select(_cols, opts = {}) { this.count = opts.count; return this; }
    eq(k,v) { this.values.push(param(v)); this.filters.push(`${k}=$${this.values.length}`); return this; }
    lte(k,v) { this.values.push(param(v)); this.filters.push(`${k}<=$${this.values.length}`); return this; }
    in(k,vs) { this.filters.push(`${k} in (${vs.map(v=>{this.values.push(param(v));return '$'+this.values.length}).join(',')})`);return this; }
    is(k,v) { assert.equal(v,null);this.filters.push(`${k} is null`);return this; }
    not(k,op,v) { assert.equal(v,null);this.filters.push(`${k} is not null`);return this; }
    order(k) { this.sort=k;return this; }
    update(fields) { this.op='update';this.fields=fields;return this; }
    delete() { this.op='delete';return this; }
    insert(rows) { this.op='insert';this.rows=Array.isArray(rows)?rows:[rows];return this; }
    maybeSingle() { this.one=true;return this; }
    single() { this.one=true;return this; }
    then(resolve,reject) { return this.run().then(resolve,reject); }
    async run() {
      try {
        let sql; const where=this.filters.length?' where '+this.filters.join(' and '):'';
        if(this.op==='select')sql=`select * from ${this.table}${where}${this.sort?' order by '+this.sort:''}`;
        if(this.op==='update'){const assignments=Object.entries(this.fields).map(([k,v])=>{this.values.push(param(v));return `${k}=$${this.values.length}`});sql=`update ${this.table} set ${assignments.join(',')}${where} returning *`;}
        if(this.op==='delete')sql=`delete from ${this.table}${where} returning *`;
        if(this.op==='insert'){const keys=Object.keys(this.rows[0]);const tuples=this.rows.map(row=>'('+keys.map(k=>{this.values.push(param(row[k]));return '$'+this.values.length}).join(',')+')');sql=`insert into ${this.table}(${keys.join(',')}) values ${tuples.join(',')} returning *`;}
        const rows=asJSON(await q(sql,this.values));return {data:this.one?rows[0]??null:rows,error:null,count:this.count?rows.length:null};
      }catch(e){return {data:null,error:{message:e.message},count:null};}
    }
  }
  const svc = {
    from: t => new Query(t),
    async rpc(name, p) {
      assert.equal(name, 'materialize_message_occurrence');
      try { return { data: (await q('select materialize_message_occurrence($1,$2,$3,$4,$5,$6,$7) as id',Object.values(p)))[0].id, error: null }; }
      catch (e) { return { data: null, error: { message: e.message } }; }
    },
  };
  class FixtureDate extends Date { constructor(...args){super(...(args.length?args:[clock.toISOString()]));} static now(){return clock.getTime();} }
  const context=vm.createContext({URL,URLSearchParams,Request,Response,TextEncoder,Date:FixtureDate,Map,Set,crypto:webcrypto,btoa,setTimeout,Deno:{serve(){},env:{get:n=>({RESEND_API_KEY:'mock',RESEND_FROM:'TroyLabs <hello@usctroylabs.com>',TWILIO_ACCOUNT_SID:'mock',TWILIO_AUTH_TOKEN:'mock',TWILIO_FROM:'+12135550000',SUPABASE_URL:'https://fixture.invalid'})[n]}},fetch:async(url,init)=>{sends.push({url,body:String(init.body)});return new Response(JSON.stringify({sid:`SM${sends.length}`,status:'queued'}),{status:201});}});
  const root=new URL('../../supabase/functions/',import.meta.url),modules=new Map();
  for(const name of ['sms','audience','recurrence'])modules.set(`../_shared/${name}.ts`,new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL(`_shared/${name}.ts`,root),'utf8')),{context}));
  const client=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',()=>{throw Error('No network database allowed')})},{context});
  const mod=new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('send-message/index.ts',root),'utf8'))+'\nexport {sendDue,deliver};',{context});
  await mod.link(name=>name.startsWith('npm:')?client:modules.get(name));await mod.evaluate();
  await q("insert into profiles(id,full_name,status,approved,is_test,phone,phone_opt_in) values($1,'Admin','alum',true,false,'+12135550001',false),($2,'Selected','alum',true,false,'+12135550002',true)",[author,audience.profile_ids[0]]);
  const advanceClock=async iso=>{clock=new Date(iso);await q("select set_config('fixture.now',$1,false)",[iso]);};
  s=await insertSeries();
  assert.equal((await mod.namespace.deliver(svc,s.id,author,{email:null,phone:null})).status,409,'template cannot be sent directly');
  await Promise.all([mod.namespace.sendDue(svc,clock.toISOString()),mod.namespace.sendDue(svc,clock.toISOString())]);
  assert.equal(sends.length,1,'concurrent worker invocations share DB occurrence and claim locks');
  parent=(await q('select * from messages where id=$1',[s.id]))[0];assert.equal(parent.state,'scheduled');assert.equal(parent.recurrence_index,1);
  assert.equal((await q('select state from messages where parent_series_id=$1',[s.id]))[0].state,'sent');
  await advanceClock('2026-10-07T17:05:00Z');await q('update profiles set phone_opt_in=false where id=$1',[audience.profile_ids[0]]);
  await mod.namespace.sendDue(svc,clock.toISOString());assert.equal(sends.length,1,'opt-out after first occurrence suppresses second');
  assert.equal((await q('select state from messages where parent_series_id=$1 order by occurrence_at desc',[s.id]))[0].state,'draft','failed occurrence retained independently');
  await q('update profiles set phone_opt_in=true,phone=$1 where id=$2',['+12135550009',audience.profile_ids[0]]);
  await advanceClock('2026-10-10T17:05:00Z');await mod.namespace.sendDue(svc,clock.toISOString());
  assert.equal(sends.length,2,'downtime coalesces three slots into one send');assert.equal(new URLSearchParams(sends.at(-1).body).get('To'),'+12135550009','current contact used');
  parent=(await q('select * from messages where id=$1',[s.id]))[0];assert.equal(parent.state,'completed');assert.equal(parent.recurrence_index,5);assert.equal(parent.recurrence_skipped,2);
  assert.equal((await q('select * from messages where parent_series_id=$1',[s.id])).length,3,'history contains only actual occurrence attempts');
  await mod.namespace.sendDue(svc,clock.toISOString());assert.equal(sends.length,2,'completed series never repeats');
  const one=await insertSeries({recurrence:null,scheduled_for:'2026-10-10T17:00:00Z'});await mod.namespace.sendDue(svc,clock.toISOString());assert.equal((await q('select state from messages where id=$1',[one.id]))[0].state,'sent','legacy one-time scheduled sends unchanged');
  // A crash after materialization leaves a queued child. A later run cancels it before newer delivery.
  await advanceClock('2026-10-06T17:05:00Z');
  const crashed=await insertSeries();await materialize(crashed);
  await advanceClock('2026-10-10T17:05:00Z');const before=sends.length;
  await mod.namespace.sendDue(svc,clock.toISOString());assert.equal(sends.length,before+1);
  const history=await q('select state,occurrence_at from messages where parent_series_id=$1 order by occurrence_at',[crashed.id]);
  assert.equal(history.length,2);assert.equal(history[0].state,'cancelled');assert.equal(history[1].state,'sent','only latest queued occurrence is claimed after downtime');
  // Cancelling a parent stops already-materialized but unclaimed children too.
  await advanceClock('2026-10-06T17:05:00Z');const cancelled=await insertSeries();await materialize(cancelled);await q("update messages set state='cancelled' where id=$1",[cancelled.id]);
  const beforeCancel=sends.length;await mod.namespace.sendDue(svc,clock.toISOString());assert.equal(sends.length,beforeCancel);
  console.log('PASS: actual edge scheduler + PostgreSQL RPC, concurrent invocations send once, fresh opt-outs/phone, independent child history/failure, missed-slot coalescing, count exhaustion, unchanged one-time delivery');
  console.log('PASS: authenticated atomic replacement, stale queued child coalescing after crash, cancellation of materialized pending children');
} finally { await db.close(); }
