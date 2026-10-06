-- Admins edit other members' profiles (Bryan, 2026-10-06), and years are always real years.
-- 1. Years: Mirella typed "26" as the year she joined and the form stored the number 26 (cohort "SP"). The page now
--    reads a two-digit year as 20xx and refuses anything else; the database refuses a year outside 1990–2100.
-- 2. Photos: admins may put a photo in anyone's folder (members still only their own).
-- 3. Accountability: every edit an admin makes to someone else's profile is in that person's timeline
--    (profile_events 'admin_edit', with who and which fields changed). Sign-in emails and email/text consent stay the
--    member's own: the page doesn't offer them, and this trigger refuses them from an admin who isn't that member.

update public.profiles set join_year = 2000 + join_year where join_year between 0 and 99;
update public.profiles set grad_year = 2000 + grad_year where grad_year between 0 and 99;
alter table public.profiles drop constraint if exists profiles_years_real;
alter table public.profiles add constraint profiles_years_real check
  ((join_year is null or join_year between 1990 and 2100) and (grad_year is null or grad_year between 1990 and 2100));

drop policy if exists avatars_admin_write on storage.objects;
create policy avatars_admin_write on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and public.is_admin());
drop policy if exists avatars_admin_update on storage.objects;
create policy avatars_admin_update on storage.objects for update to authenticated using (bucket_id = 'avatars' and public.is_admin());

alter table public.profile_events drop constraint if exists profile_events_event_check;
alter table public.profile_events add constraint profile_events_event_check check (event in ('joined', 'submitted', 'approved',
  'declined', 'restored', 'access_removed', 'email_on', 'email_off', 'texts_on', 'texts_off', 'linkedin_changed', 'admin_edit'));

create or replace function public.profiles_admin_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid(); changed text[];
begin
  if who is null or who = new.id or not public.is_admin() then return new; end if;
  if new.usc_email is distinct from old.usc_email or new.personal_email is distinct from old.personal_email
     or new.email_opt_in is distinct from old.email_opt_in or new.phone_opt_in is distinct from old.phone_opt_in then
    raise exception 'Only the member can change their sign-in emails or what they get emailed and texted.' using errcode = '42501';
  end if;
  select array_agg(n.key order by n.key) into changed
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value
      and n.key in ('full_name', 'status', 'grad_term', 'grad_year', 'join_term', 'join_year', 'divisions', 'linkedin_url',
                    'bio', 'industries', 'startups', 'city_id', 'phone', 'avatar_path');
  if changed is not null then
    insert into public.profile_events (profile_id, event, actor, detail) values (new.id, 'admin_edit', who, jsonb_build_object('fields', changed));
  end if;
  return new;
end $$;
drop trigger if exists profiles_admin_edit on public.profiles;
create trigger profiles_admin_edit before update on public.profiles for each row execute function public.profiles_admin_edit();
revoke all on function public.profiles_admin_edit() from public, anon, authenticated;
