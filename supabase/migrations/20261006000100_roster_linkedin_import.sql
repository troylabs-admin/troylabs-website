-- A roster member is approved inside handle_new_user's INSERT, so the old UPDATE-only
-- trigger missed their first LinkedIn import. Both onboarding routes use the same queue.
create or replace function public.queue_linkedin_on_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.approved or nullif(trim(new.linkedin_url), '') is null then return new; end if;
  if tg_op = 'UPDATE' then
    if coalesce(old.approved, false) then return new; end if;
  end if;
  insert into public.linkedin_sync_queue (profile_id, reason)
    values (new.id, 'approved') on conflict (profile_id) do nothing;
  return new;
end $$;

drop trigger if exists profiles_queue_linkedin on public.profiles;
create trigger profiles_queue_linkedin after insert or update of approved on public.profiles
  for each row execute function public.queue_linkedin_on_approval();

revoke all on function public.queue_linkedin_on_approval() from public, anon, authenticated;
