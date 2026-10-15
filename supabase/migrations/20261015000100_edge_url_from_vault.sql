-- The database's own calls to our edge functions (the five-minute scheduled send, the LinkedIn worker, the embedding
-- trigger) used to write the live project's address into the SQL. A copy of this database built from these migrations
-- (a local or CI test stack) would then call PRODUCTION. The address now comes from Vault ('project_url', set once per
-- environment, outside the migrations); a database without it makes no calls at all (2026-10-15).

create or replace function public.edge_function_url(fn text) returns text
language sql stable security definer set search_path = public as $$
  select rtrim(decrypted_secret, '/') || '/functions/v1/' || fn from vault.decrypted_secrets where name = 'project_url'
$$;
revoke all on function public.edge_function_url(text) from public, anon, authenticated;

select cron.unschedule('send-due-messages') where exists (select 1 from cron.job where jobname = 'send-due-messages');
select cron.schedule('send-due-messages', '*/5 * * * *', $cron$
  select net.http_post(
    url := public.edge_function_url('send-message'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'send_message_cron_secret')),
    body := '{"mode":"due"}'::jsonb)
  where public.edge_function_url('send-message') is not null
    and exists (select 1 from public.messages where state = 'scheduled' and scheduled_for <= now())
$cron$);

select cron.unschedule('linkedin-sync-worker') where exists (select 1 from cron.job where jobname = 'linkedin-sync-worker');
select cron.schedule('linkedin-sync-worker', '* * * * *', $cron$
  select net.http_post(
    url := public.edge_function_url('linkedin-sync'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'send_message_cron_secret')),
    body := '{"mode":"worker"}'::jsonb,
    timeout_milliseconds := 150000)
  where public.edge_function_url('linkedin-sync') is not null
    and exists (select 1 from public.linkedin_sync_queue q join auth.users u on u.id = q.profile_id
                where q.next_try_at <= now() and (q.claimed_at is null or q.claimed_at < now() - interval '10 minutes')
                  and u.email not like 'tl-qa-%@example.com')
$cron$);

create or replace function public.queue_profile_embedding() returns trigger
language plpgsql security definer set search_path = public as $$
declare secret text; url text;
begin
  if not new.approved then return new; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'send_message_cron_secret';
  url := public.edge_function_url('semantic');
  if secret is null or url is null then return new; end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('mode', 'embed', 'ids', jsonb_build_array(new.id)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    timeout_milliseconds := 20000);
  return new;
end $$;
