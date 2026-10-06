-- The confirmation text sent when someone turns texts on (send-message mode 'welcome-text', 2026-10-06) is recorded in
-- their timeline: which number, whether Twilio took it, who turned texts on. It also rate-limits the welcome.
alter table public.profile_events drop constraint if exists profile_events_event_check;
alter table public.profile_events add constraint profile_events_event_check check (event in ('joined', 'submitted', 'approved',
  'declined', 'restored', 'access_removed', 'email_on', 'email_off', 'texts_on', 'texts_off', 'linkedin_changed', 'admin_edit',
  'texts_welcome'));
