-- Work history stays current on its own (2026-10-06). Until now LinkedIn imported once at approval and then only when the
-- member pressed SYNC NOW, so a job change months later never reached the site. Every day at 3 AM Pacific, members
-- whose last import is older than 90 days go back in the queue (oldest first, at most 30 a day), and the
-- every-minute worker imports them like any other sync: replace, never wipe on an empty or failed scrape, an uploaded
-- photo is never replaced. A member whose last import failed is skipped (their profile says why). Cost: about $4 per 1,000 profiles, so 100 members four times a year is about $1.60.
-- The worker's monthly cap (1,000) still applies. Temporary test accounts are never queued.

alter table public.linkedin_sync_queue drop constraint if exists linkedin_sync_queue_reason_check;
alter table public.linkedin_sync_queue add constraint linkedin_sync_queue_reason_check
  check (reason in ('approved', 'member', 'admin', 'link_changed', 'refresh'));

create or replace function public.queue_stale_linkedin(days integer default 90, n integer default 30) returns integer
language plpgsql security definer set search_path = public as $$
declare added integer;
begin
  insert into public.linkedin_sync_queue (profile_id, reason)
    select p.id, 'refresh' from public.profiles p join auth.users u on u.id = p.id
    where p.approved and nullif(trim(p.linkedin_url), '') is not null
      and p.linkedin_synced_at is not null and p.linkedin_synced_at < now() - make_interval(days => days)
      and p.linkedin_sync_error is null   -- a failed import waits for the member (their profile shows why, with SYNC NOW); retrying it daily would pay for the same failure every day
      and u.email not like 'tl-qa-%@example.com'
      and not exists (select 1 from public.linkedin_sync_queue q where q.profile_id = p.id)
    order by p.linkedin_synced_at
    limit n
  on conflict (profile_id) do nothing;
  get diagnostics added = row_count;
  return added;
end $$;
revoke all on function public.queue_stale_linkedin(integer, integer) from public, anon, authenticated;

select cron.unschedule('linkedin-refresh') where exists (select 1 from cron.job where jobname = 'linkedin-refresh');
select cron.schedule('linkedin-refresh', '0 10 * * *', $cron$ select public.queue_stale_linkedin(90, 30) $cron$);
