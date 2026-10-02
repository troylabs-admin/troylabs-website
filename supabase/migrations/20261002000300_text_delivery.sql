-- Texts through Twilio (2026-10-02). Twilio accepting a text is not the phone getting it: carriers can still
-- filter it. Twilio reports the outcome later to the send-message function (StatusCallback), which writes it
-- here by the message's Twilio id. Emails keep status null (Resend's accept is what we record for them).
alter table public.message_recipients add column if not exists status text
  check (status is null or status in ('queued', 'sent', 'delivered', 'undelivered', 'failed'));
create index if not exists message_recipients_provider_id on public.message_recipients (provider_id) where provider_id is not null;
