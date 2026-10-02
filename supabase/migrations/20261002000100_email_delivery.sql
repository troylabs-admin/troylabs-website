-- Email delivery for Admin › Message (Bryan, 2026-10-02: "test out the messaging feature … get started").
-- Sending runs in the `send-message` edge function, which holds the Resend key; the database records
-- the outcome. Texts (SendBlue) are still not connected.
begin;

-- a message being sent right now can't be sent again by a second click or the scheduler
alter table public.messages drop constraint if exists messages_state_check;
alter table public.messages add constraint messages_state_check check (state in ('draft', 'scheduled', 'sending', 'sent', 'cancelled'));
alter table public.messages
  add column if not exists sent_by uuid references auth.users (id),
  add column if not exists sent_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists last_error text;            -- why a send (or a scheduled send) didn't go out

-- one row per person per message: the address used, Resend's id for it, or what went wrong
alter table public.message_recipients
  add column if not exists email text,
  add column if not exists provider_id text,
  add column if not exists error text;

-- every member can turn announcements off on their profile; the footer of each email says where
alter table public.profiles add column if not exists email_opt_in boolean not null default true;

-- scheduled messages: every five minutes, if one is due, the database asks the function to send it.
-- The function only accepts this call with the shared secret kept in Vault (and in the function's secrets).
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'send-due-messages';
select cron.schedule('send-due-messages', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/send-message',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'send_message_cron_secret')),
    body := '{"mode":"due"}'::jsonb)
  where exists (select 1 from public.messages where state = 'scheduled' and scheduled_for <= now())
$cron$);
commit;
