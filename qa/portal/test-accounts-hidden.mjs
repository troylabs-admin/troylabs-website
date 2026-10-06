// Temporary test accounts are invisible to real people (2026-10-06: "Plain Member QA" showed in live search while a test
// ran). In one rolled-back transaction: a test account with a job, seen as a real admin, a real member, and itself.
// Real accounts are only read (as the viewer), never changed; nothing survives the rollback.
import assert from 'node:assert/strict';
import { sql } from './helpers.mjs';
const result = sql(`begin;
create temp table r(k text, v text); grant all on r to authenticated;
do $$ declare t uuid := gen_random_uuid();
  boss uuid := (select a.user_id from admins a join profiles p on p.id = a.user_id where not p.is_test limit 1);
  real_member uuid := (select id from profiles where approved and not is_test and id not in (select user_id from admins) limit 1);
begin
  insert into auth.users (id, email, aud, role, instance_id) values (t, 'tl-qa-hidden-' || t || '@example.com', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into profiles (id, full_name) values (t, 'Hidden QA') on conflict (id) do nothing;
  update profiles set approved = true, submitted_at = now(), is_test = false where id = t;
  insert into work_experiences (profile_id, title, company, sort) values (t, 'QA job', 'QA Co', 0);
  insert into r select 'is_test', (select is_test::text from profiles where id = t);
  perform set_config('request.jwt.claims', json_build_object('sub', boss, 'role', 'authenticated')::text, true); set local role authenticated;
  insert into r select 'admin_profile', (select count(*)::text from profiles where id = t);
  insert into r select 'admin_job', (select count(*)::text from work_experiences where profile_id = t);
  reset role;
  if real_member is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', real_member, 'role', 'authenticated')::text, true); set local role authenticated;
    insert into r select 'member_profile', (select count(*)::text from profiles where id = t);
    reset role;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true); set local role authenticated;
  insert into r select 'self', (select count(*)::text from profiles where id = t) || '+' || (select count(*)::text from work_experiences where profile_id = t);
  insert into r select 'self_sees_real', (select (count(*) > 0)::text from profiles where approved and not is_test);
  reset role;
end $$;
select json_object_agg(k, v) as out from r;
rollback;`);
const out = result.rows?.[0]?.out ?? result[0]?.out;
assert.equal(out.is_test, 'true', 'a tl-qa sign-in is marked as a test account, and an update can\'t unmark it');
assert.deepEqual([out.admin_profile, out.admin_job], ['0', '0'], 'a real admin sees neither the test profile nor its job');
if (out.member_profile !== undefined) assert.equal(out.member_profile, '0', 'a real member doesn\'t see it');
assert.deepEqual([out.self, out.self_sees_real], ['1+1', 'true'], 'the test account sees itself, its job, and real members');
console.log('PASS: test accounts are marked on creation (not changeable); real admins and members never see them or their jobs; tests still see everything; rolled back');
