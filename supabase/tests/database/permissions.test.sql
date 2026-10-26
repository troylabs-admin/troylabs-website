-- Who can see and change what, checked as each kind of person: a visitor who isn't signed in, an approved member,
-- someone still applying, and an admin. Runs on a throwaway database (`supabase test db`, in CI); everything is rolled
-- back. The people: supabase/seed.sql's Seed Admin and Seed Member, plus an applicant and a message made here.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- the cast ------------------------------------------------------------------------------------------------------
\set admin   '''00000000-0000-4000-a000-000000000001'''
\set member  '''00000000-0000-4000-a000-000000000002'''
\set applicant '''00000000-0000-4000-a000-000000000003'''
insert into auth.users (id, email, aud, role, instance_id)
  values (:applicant, 'seed-applicant@example.com', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
update public.profiles set full_name = 'Seed Applicant', submitted_at = now() where id = :applicant;   -- submitted, so approving is refused by the permission rules, not by the "hasn't submitted" check
insert into public.messages (title, body, send_by, audience, state, created_by)
  values ('Seed message', 'Hello', 'text', '{"cells":[{"group":"EVERYONE","who":"current"}]}', 'draft', :admin);
insert into public.profile_events (profile_id, event, actor, detail) values (:admin, 'admin_edit', :admin, '{}');

-- rows a role can see: 0 when it may not read the table at all (both are "can't see it")
create function pg_temp.visible(q text) returns int language plpgsql as $$
declare n int; begin execute 'select count(*) from (' || q || ') x' into n; return n;
exception when insufficient_privilege then return 0; end $$;
grant execute on function pg_temp.visible(text) to anon, authenticated;

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- a visitor who isn't signed in ---------------------------------------------------------------------------------
set local role anon;
select is(pg_temp.visible('select 1 from public.profiles'), 0, 'a visitor sees no profiles');
select is(pg_temp.visible('select 1 from public.messages'), 0, 'a visitor sees no messages');
select is(pg_temp.visible('select 1 from public.profile_events'), 0, 'a visitor sees no history');
reset role;

-- an approved member --------------------------------------------------------------------------------------------
select pg_temp.as_user(:member); set local role authenticated;
select ok((select count(*) from public.profiles where id in (:member, :admin)) = 2, 'a member sees approved members');
select is((select count(*) from public.profiles where id = :applicant)::int, 0, 'a member does not see someone still applying');
select is((select count(*) from public.messages)::int, 0, 'a member sees no messages');
select is((select count(*) from public.message_recipients)::int, 0, 'a member sees no delivery records');
select is((select count(*) from public.profile_events where profile_id <> :member)::int, 0, 'a member sees only their own history');
update public.profiles set full_name = 'Hacked' where id = :admin;
reset role;
select is((select full_name from public.profiles where id = :admin), 'Seed Admin', 'a member cannot change someone else''s profile');
select pg_temp.as_user(:member); set local role authenticated;
select throws_ok($$ insert into public.admins (user_id) values ('00000000-0000-4000-a000-000000000002') $$, '42501', null, 'a member cannot make themselves an admin');
select throws_ok($$ update public.profiles set personal_email = 'x@example.com' where id = '00000000-0000-4000-a000-000000000002' $$, '42501', null, 'a member cannot change their email directly (it needs confirming)');
select lives_ok($$ update public.profiles set bio = 'Hi' where id = '00000000-0000-4000-a000-000000000002' $$, 'a member can edit their own profile');
-- cities: a new one goes through add_city (the live project refused direct writes: "permission denied for table cities")
select is((select name || ', ' || region from public.add_city('Boise', 'id', 'us', 43.6135, -116.2035)), 'Boise, ID', 'a member can add a city nobody has picked yet');
select is((select id from public.add_city('Boise', 'ID', 'US', 43.6, -116.2)), (select id from public.cities where name = 'Boise'), 'adding a listed city hands back the same row');
select throws_ok($$ select public.add_city('Nowhere', '', 'US', 123, 0) $$, '22023', null, 'a city off the map is refused');
select throws_ok($$ insert into public.cities (name, region, country, lat, lng) values ('Direct', '', 'US', 1, 1) $$, '42501', null, 'a member cannot write the cities table directly');
reset role;
set local role anon;
select throws_ok($$ select public.add_city('Boise', 'ID', 'US', 43.6, -116.2) $$, '42501', null, 'a visitor cannot add cities');
reset role;

-- someone still applying ----------------------------------------------------------------------------------------
select pg_temp.as_user(:applicant); set local role authenticated;
select is((select count(*) from public.profiles where id = :applicant)::int, 1, 'an applicant sees their own profile');
select is((select count(*) from public.profiles where id <> :applicant)::int, 0, 'an applicant sees nobody else');
select throws_ok($$ update public.profiles set approved = true where id = '00000000-0000-4000-a000-000000000003' $$, '42501', null, 'an applicant cannot approve themselves');
select throws_ok($$ update public.profiles set submitted_at = now() - interval '1 day' where id = '00000000-0000-4000-a000-000000000003' $$, '42501', null, 'an applicant cannot mark themselves submitted (only the submit step does)');
reset role;

-- an admin ------------------------------------------------------------------------------------------------------
select pg_temp.as_user(:admin); set local role authenticated;
select is((select count(*) from public.profiles where id = :applicant)::int, 1, 'an admin sees applicants');
select is((select count(*) from public.messages)::int, 1, 'an admin sees messages');
select throws_ok($$ update public.profile_events set detail = '{"x":1}' $$, null, null, 'the history cannot be rewritten, not even by an admin');
reset role;

set local role service_role;
select throws_ok($$ update public.profile_events set detail = '{"x":1}' $$, null, null, 'not even the server''s all-access key can rewrite the history');
reset role;

-- test accounts stay test accounts ------------------------------------------------------------------------------
update public.profiles set is_test = true where id = :member;
select is((select is_test from public.profiles where id = :member), false, 'a real account cannot be turned into a test account');

select * from finish();
rollback;
