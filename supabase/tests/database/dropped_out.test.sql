-- Dropped out (2026-11-09): an alum who left USC before graduating. The database's side of it, as each kind of person:
-- the impossible mix is refused, a member can say it about themselves, the nightly graduation job leaves it alone, the
-- admin list filters ALUM and DROPPED OUT separately (option A), and an admin changing it is recorded. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\set admin   '''00000000-0000-4000-a000-000000000001'''
\set member  '''00000000-0000-4000-a000-000000000002'''
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.page(statuses text[]) returns jsonb language sql as $$ select public.admin_member_page('', statuses, '{}', '{}', 1, 100) $$;
grant execute on function pg_temp.page(text[]) to authenticated;

select is((select dropped_out from public.profiles where id = :member), false, 'everyone starts as not dropped out');

-- the mix that can't be true -------------------------------------------------------------------------------------
select throws_ok($$ update public.profiles set status = 'student', dropped_out = true where id = '00000000-0000-4000-a000-000000000002' $$,
  '23514', null, 'a current student cannot be marked dropped out');

-- a member says it about themselves ------------------------------------------------------------------------------
select pg_temp.as_user(:member); set local role authenticated;
select lives_ok($$ update public.profiles set status = 'alum', dropped_out = true, grad_term = 'FA', grad_year = 2024 where id = '00000000-0000-4000-a000-000000000002' $$,
  'a member can mark themselves dropped out, with their last semester');
reset role;
select is((select dropped_out from public.profiles where id = :member), true, 'and it is saved');

-- the nightly graduation job only ever touches students ----------------------------------------------------------
select public.graduate_students();
select is((select status::text || '/' || dropped_out::text from public.profiles where id = :member), 'alum/true', 'graduate_students() leaves a dropout as they are');

-- Admin › Members: three separate answers -------------------------------------------------------------------------
update public.profiles set status = 'alum', dropped_out = false, grad_year = 2023 where id = :admin;
select pg_temp.as_user(:admin); set local role authenticated;
select ok((select bool_or((r->>'id')::uuid = :member) from jsonb_array_elements(pg_temp.page('{dropped out}')->'rows') r), 'DROPPED OUT lists the dropout');
select ok(not (select coalesce(bool_or((r->>'id')::uuid = :admin), false) from jsonb_array_elements(pg_temp.page('{dropped out}')->'rows') r), 'DROPPED OUT leaves out a graduate');
select ok(not (select coalesce(bool_or((r->>'id')::uuid = :member), false) from jsonb_array_elements(pg_temp.page('{alum}')->'rows') r), 'ALUM leaves out the dropout (graduates only)');
select ok((select bool_or((r->>'id')::uuid = :admin) from jsonb_array_elements(pg_temp.page('{alum}')->'rows') r), 'ALUM lists a graduate');
select is((pg_temp.page('{alum,dropped out}')->>'total')::int, (pg_temp.page('{}')->>'total')::int - (select count(*)::int from public.profiles where approved and status = 'student'),
  'ALUM + DROPPED OUT = everyone who has left USC');
select is((select r->'dropped_out' from jsonb_array_elements(pg_temp.page('{dropped out}')->'rows') r where (r->>'id')::uuid = :member), 'true'::jsonb, 'each row carries dropped_out for the page');
select ok(not (pg_temp.page('{dropped out}')->'rows'->0 ? 'standing'), 'the internal standing column is not sent');

-- an admin changing it is recorded like any other field ------------------------------------------------------------
update public.profiles set dropped_out = false where id = :member;
reset role;
select ok((select detail->'fields' ? 'dropped_out' from public.profile_events where profile_id = :member and event = 'admin_edit' order by id desc limit 1),
  'an admin changing it leaves an admin_edit event naming dropped_out');

select * from finish();
rollback;
