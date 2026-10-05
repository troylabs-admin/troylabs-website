-- The worker's claim took every queued person instead of n (caught by the 30-approvals test, 2026-10-05): with
-- "where id in (select … limit n for update skip locked)" joined to profiles, Postgres may run that subquery again for
-- each outer row, and each run skips the rows the last one locked, so it walks the whole queue. The standard fix:
-- pick the batch once, in a materialized CTE, then claim exactly those.
create or replace function public.claim_linkedin_batch(n integer) returns table (profile_id uuid, linkedin_url text, attempts smallint)
language sql security definer set search_path = public as $$
  with picked as materialized (
    select q2.profile_id from public.linkedin_sync_queue q2
    where q2.next_try_at <= now() and (q2.claimed_at is null or q2.claimed_at < now() - interval '10 minutes')
    order by q2.requested_at limit greatest(1, least(n, 25)) for update skip locked
  ), claimed as (
    update public.linkedin_sync_queue q set claimed_at = now(), attempts = q.attempts + 1
    from picked where q.profile_id = picked.profile_id
    returning q.profile_id, q.attempts
  )
  select c.profile_id, p.linkedin_url, c.attempts from claimed c join public.profiles p on p.id = c.profile_id;
$$;
revoke all on function public.claim_linkedin_batch(integer) from public, anon, authenticated;
