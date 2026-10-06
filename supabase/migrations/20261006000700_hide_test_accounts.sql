-- Temporary test accounts are invisible to real people (2026-10-06: Bryan saw "Plain Member QA" in search while a test
-- ran against the live database). The automated tests create approved accounts (tl-qa-…@example.com) for a minute and
-- delete them; until now every member could see them meanwhile. Now:
--   profiles.is_test   set from the sign-in address when the profile is created, and never changeable afterwards.
--   real viewers       never see a test profile, or its jobs, LinkedIn items, roles or search pieces (restrictive RLS:
--                      search, the globe, member and company pages, Admin counts, AI search all read through these).
--   test viewers       see test accounts (and real ones), so the tests still exercise everything.
--   group messages     a real admin's message never counts or reaches a test account, and a test admin's message only
--                      ever goes to test accounts (send-message reads profiles.is_test).

alter table public.profiles add column if not exists is_test boolean not null default false;
update public.profiles p set is_test = true from auth.users u where u.id = p.id and u.email like 'tl-qa-%@example.com' and not p.is_test;

create or replace function public.profiles_is_test() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.is_test := exists (select 1 from auth.users u where u.id = new.id and u.email like 'tl-qa-%@example.com');
  else
    new.is_test := old.is_test;   -- nobody can flip it, not even an admin
  end if;
  return new;
end $$;
drop trigger if exists profiles_a_is_test on public.profiles;
create trigger profiles_a_is_test before insert or update on public.profiles for each row execute function public.profiles_is_test();
revoke all on function public.profiles_is_test() from public, anon, authenticated;

-- is the person looking a test account? / may they see this profile's data?
create or replace function public.viewer_is_test() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_test from public.profiles where id = auth.uid()), false);
$$;
create or replace function public.profile_visible(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pid = auth.uid() or not coalesce((select is_test from public.profiles where id = pid), false) or public.viewer_is_test();
$$;
grant execute on function public.viewer_is_test() to authenticated;
grant execute on function public.profile_visible(uuid) to authenticated;

drop policy if exists profiles_hide_tests on public.profiles;
create policy profiles_hide_tests on public.profiles as restrictive for select to authenticated
  using (id = auth.uid() or not is_test or public.viewer_is_test());
drop policy if exists work_experiences_hide_tests on public.work_experiences;
create policy work_experiences_hide_tests on public.work_experiences as restrictive for select to authenticated using (public.profile_visible(profile_id));
drop policy if exists linkedin_items_hide_tests on public.linkedin_items;
create policy linkedin_items_hide_tests on public.linkedin_items as restrictive for select to authenticated using (public.profile_visible(profile_id));
drop policy if exists eboard_roles_hide_tests on public.eboard_roles;
create policy eboard_roles_hide_tests on public.eboard_roles as restrictive for select to authenticated using (public.profile_visible(profile_id));
drop policy if exists profile_chunks_hide_tests on public.profile_chunks;
create policy profile_chunks_hide_tests on public.profile_chunks as restrictive for select to authenticated using (public.profile_visible(profile_id));
