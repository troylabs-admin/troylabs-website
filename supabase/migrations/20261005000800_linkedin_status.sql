-- What the profile page shows about my LinkedIn import (2026-10-05): members can't read the queue itself.
create or replace function public.my_linkedin_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'queued', exists (select 1 from public.linkedin_sync_queue q where q.profile_id = auth.uid()),
    'synced_at', p.linkedin_synced_at, 'error', p.linkedin_sync_error)
  from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.my_linkedin_status() from public, anon;
grant execute on function public.my_linkedin_status() to authenticated;

-- a LinkedIn profile link is stored in one form (https://www.linkedin.com/in/<handle>), whatever was pasted. A trigger
-- converts it instead of a check refusing it: the page live today saves the box as typed, and a refusal would turn a
-- pasted ".../in/name/" into an error. Anything that isn't a profile link is kept as typed (the sync explains why it
-- can't use it). Existing links (e.g. ".../in/stasia-ramirez/") are converted once below.
create or replace function public.normalize_linkedin_url() returns trigger
language plpgsql set search_path = public as $$
declare handle text;
begin
  if new.linkedin_url is not null then
    new.linkedin_url := nullif(trim(new.linkedin_url), '');
    handle := substring(new.linkedin_url from '(?i)^(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/in/([^/?#[:space:]]+)');
    if handle is not null then new.linkedin_url := 'https://www.linkedin.com/in/' || lower(handle); end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_normalize_linkedin on public.profiles;
create trigger profiles_normalize_linkedin before insert or update of linkedin_url on public.profiles
  for each row execute function public.normalize_linkedin_url();
alter table public.profiles drop constraint if exists profiles_linkedin_url_form;
update public.profiles set linkedin_url = linkedin_url where linkedin_url is not null;   -- runs the conversion on what's there
