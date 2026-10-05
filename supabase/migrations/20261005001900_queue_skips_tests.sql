-- The scheduled import never takes temporary test accounts (tl-qa-…@example.com), and test runs only take their own
-- (2026-10-05: with the schedule on, tests giving an approved test account a link queued a real Apify scrape of a fake
-- profile and raced the test's own worker calls).
drop function if exists public.claim_linkedin_batch(integer);
create or replace function public.claim_linkedin_batch(n integer, tests boolean default false) returns table (profile_id uuid, linkedin_url text, attempts smallint)
language sql security definer set search_path = public as $$
  with picked as materialized (
    select q2.profile_id from public.linkedin_sync_queue q2 join auth.users u on u.id = q2.profile_id
    where q2.next_try_at <= now() and (q2.claimed_at is null or q2.claimed_at < now() - interval '10 minutes')
      and (u.email like 'tl-qa-%@example.com') = tests
    order by q2.requested_at limit greatest(1, least(n, 25)) for update of q2 skip locked
  ), claimed as (
    update public.linkedin_sync_queue q set claimed_at = now(), attempts = q.attempts + 1
    from picked where q.profile_id = picked.profile_id
    returning q.profile_id, q.attempts
  )
  select c.profile_id, p.linkedin_url, c.attempts from claimed c join public.profiles p on p.id = c.profile_id;
$$;
revoke all on function public.claim_linkedin_batch(integer, boolean) from public, anon, authenticated;

-- and the schedule only calls the worker when a real person is waiting
select cron.unschedule('linkedin-sync-worker') where exists (select 1 from cron.job where jobname = 'linkedin-sync-worker');
select cron.schedule('linkedin-sync-worker', '* * * * *', $cron$
  select net.http_post(
    url := 'https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/linkedin-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'send_message_cron_secret')),
    body := '{"mode":"worker"}'::jsonb,
    timeout_milliseconds := 150000)
  where exists (select 1 from public.linkedin_sync_queue q join auth.users u on u.id = q.profile_id
                where q.next_try_at <= now() and (q.claimed_at is null or q.claimed_at < now() - interval '10 minutes')
                  and u.email not like 'tl-qa-%@example.com')
$cron$);
