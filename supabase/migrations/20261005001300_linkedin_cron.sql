-- The LinkedIn import runs on its own (2026-10-05): every minute, if anyone is waiting in the queue, the database calls
-- the linkedin-sync worker (same shared secret as the scheduled-email job). One call takes at most 10 people in one
-- Apify run, so 30 approvals at once go through in about three minutes; an empty queue costs nothing (no call is made).
select cron.unschedule('linkedin-sync-worker') where exists (select 1 from cron.job where jobname = 'linkedin-sync-worker');
select cron.schedule('linkedin-sync-worker', '* * * * *', $cron$
  select net.http_post(
    url := 'https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/linkedin-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'send_message_cron_secret')),
    body := '{"mode":"worker"}'::jsonb,
    timeout_milliseconds := 150000)
  where exists (select 1 from public.linkedin_sync_queue where next_try_at <= now() and (claimed_at is null or claimed_at < now() - interval '10 minutes'))
$cron$);
