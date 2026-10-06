-- The one confirmation text after someone turns texts off on the website (send-message 'optout-text', 2026-10-06) is
-- recorded in their timeline like the welcome text.
alter table public.profile_events drop constraint if exists profile_events_event_check;
alter table public.profile_events add constraint profile_events_event_check check (event in ('joined', 'submitted', 'approved',
  'declined', 'restored', 'access_removed', 'email_on', 'email_off', 'texts_on', 'texts_off', 'linkedin_changed', 'admin_edit',
  'texts_welcome', 'texts_goodbye'));
