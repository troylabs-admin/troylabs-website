-- First admin. The admin list is a table only admins can edit, so somebody has to be first: Bryan
-- (Head of Tech) becomes an admin and an approved member the moment he first signs in. Later admins
-- are added from Admin › Members.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare on_roster boolean; bootstrap boolean;
begin
  bootstrap := lower(new.email) in ('bryanram@usc.edu');
  select exists (select 1 from public.roster r where r.usc_email = new.email) into on_roster;
  insert into public.profiles (id, full_name, usc_email, personal_email, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.email ilike '%usc.edu' then new.email end,
    case when new.email not ilike '%usc.edu' then new.email end,
    on_roster or bootstrap
  );
  if bootstrap then insert into public.admins (user_id) values (new.id) on conflict do nothing; end if;
  return new;
end $$;
