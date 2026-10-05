-- When a member removes or changes their LinkedIn link (2026-10-05, edge-case pass): everything imported from the old
-- link goes at once — work history (so they leave those company pages), honors/publications/…, the stored copy,
-- headline/about/skills, and a current job or photo that came from LinkedIn (one they set themselves stays). A new
-- link of an approved member is queued; edits within 2 minutes become one import (and the monthly cap still applies).
-- BEFORE trigger named to run after profiles_normalize_linkedin (same timing, alphabetical order), so both links are
-- compared in their one stored form.
create or replace function public.linkedin_link_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.linkedin_url is not distinct from old.linkedin_url then return new; end if;
  delete from public.work_experiences where profile_id = new.id;
  delete from public.linkedin_items where profile_id = new.id;
  delete from public.linkedin_snapshots where profile_id = new.id;
  delete from public.linkedin_sync_queue where profile_id = new.id;
  new.linkedin_headline := null; new.linkedin_about := null; new.linkedin_skills := '{}';
  new.linkedin_synced_at := null; new.linkedin_sync_error := null;
  if new.current_job_source = 'linkedin' then new.current_title := null; new.current_company := null; end if;
  if new.avatar_source = 'linkedin' then new.avatar_path := null; new.avatar_source := null; new.avatar_linkedin_key := null; end if;
  if new.approved and new.linkedin_url ~ '^https://www\.linkedin\.com/in/[^/?#[:space:]]+$' then
    insert into public.linkedin_sync_queue (profile_id, reason, next_try_at) values (new.id, 'member', now() + interval '2 minutes');
  end if;
  return new;
end $$;
drop trigger if exists profiles_zz_linkedin_changed on public.profiles;
create trigger profiles_zz_linkedin_changed before update of linkedin_url on public.profiles
  for each row execute function public.linkedin_link_changed();
