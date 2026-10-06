-- Record keeping before members arrive (Bryan, 2026-10-06: "once we start getting people in, there's no going back").
-- What already existed: when the account was made (profiles.created_at = first sign-in), last sign-in and last visit,
-- when the application was submitted (+ an append-only copy of it in profile_submissions), when someone was declined,
-- when LinkedIn last imported. What was missing, added here:
--   1. WHO approved or declined someone and WHEN they were approved (approved was only a yes/no).
--   2. WHEN someone turned email announcements or texts on or off: the consent record carriers and Twilio's
--      toll-free verification ask for (time, the phone number it applied to, who made the change).
--   3. A membership timeline per person (profile_events): joined, submitted, approved, declined, restored, access
--      removed, opt-ins, LinkedIn link changed. Append-only; it goes away only with the account itself.
-- The columns are set by a trigger from what actually changed, so no page (and no member) can write them directly.

alter table public.profiles
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists declined_by uuid,
  add column if not exists email_opt_in_changed_at timestamptz,
  add column if not exists phone_opt_in_changed_at timestamptz;

create table if not exists public.profile_events (
  id bigserial primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  at timestamptz not null default now(),
  event text not null check (event in ('joined', 'submitted', 'approved', 'declined', 'restored', 'access_removed',
    'email_on', 'email_off', 'texts_on', 'texts_off', 'linkedin_changed')),
  actor uuid,                 -- who did it (auth.uid()); null = the member's own sign-up, the system, or a backfill
  detail jsonb not null default '{}'::jsonb
);
create index if not exists profile_events_profile on public.profile_events (profile_id, at desc);
alter table public.profile_events enable row level security;
revoke all on public.profile_events from anon, authenticated;
grant select on public.profile_events to authenticated;
drop policy if exists profile_events_read on public.profile_events;
create policy profile_events_read on public.profile_events for select to authenticated using (public.is_admin() or profile_id = auth.uid());
revoke all on sequence public.profile_events_id_seq from anon, authenticated;

-- append-only (the account's own deletion still removes its rows through the foreign key)
create or replace function public.profile_events_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles where id = old.profile_id) then return old; end if;
  raise exception 'profile_events is append-only' using errcode = '42501';
end $$;
drop trigger if exists profile_events_no_change on public.profile_events;
create trigger profile_events_no_change before update or delete on public.profile_events
  for each row execute function public.profile_events_append_only();

-- 1 + 2: the columns follow the change, whatever page or function made it
create or replace function public.profiles_record_keeping() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.approved_at := case when new.approved then now() end;
    new.approved_by := case when new.approved then auth.uid() end;
    new.declined_by := case when new.declined_at is not null then auth.uid() end;
    new.email_opt_in_changed_at := now();
    new.phone_opt_in_changed_at := case when new.phone_opt_in then now() end;
    return new;
  end if;
  -- UPDATE: never taken from the request, only from the transition
  new.approved_at := old.approved_at; new.approved_by := old.approved_by; new.declined_by := old.declined_by;
  new.email_opt_in_changed_at := old.email_opt_in_changed_at; new.phone_opt_in_changed_at := old.phone_opt_in_changed_at;
  if new.approved and not old.approved then new.approved_at := now(); new.approved_by := auth.uid(); end if;
  if new.declined_at is not null and old.declined_at is null then new.declined_by := auth.uid(); end if;
  if new.declined_at is null then new.declined_by := null; end if;
  if new.email_opt_in is distinct from old.email_opt_in then new.email_opt_in_changed_at := now(); end if;
  if new.phone_opt_in is distinct from old.phone_opt_in then new.phone_opt_in_changed_at := now(); end if;
  return new;
end $$;
drop trigger if exists profiles_record_keeping on public.profiles;
create trigger profiles_record_keeping before insert or update on public.profiles
  for each row execute function public.profiles_record_keeping();

-- 3: the timeline, written after the change is saved
create or replace function public.profiles_log_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.profile_events (profile_id, event, actor) values (new.id, 'joined', who);
    if new.approved then insert into public.profile_events (profile_id, event, actor) values (new.id, 'approved', who); end if;
    if new.phone_opt_in then insert into public.profile_events (profile_id, event, actor, detail) values (new.id, 'texts_on', who, jsonb_build_object('phone', new.phone)); end if;
    return new;
  end if;
  if new.submitted_at is not null and old.submitted_at is null then
    insert into public.profile_events (profile_id, event, actor) values (new.id, 'submitted', who); end if;
  if new.approved and not old.approved then
    insert into public.profile_events (profile_id, event, actor) values (new.id, 'approved', who); end if;
  if old.approved and not new.approved then
    insert into public.profile_events (profile_id, event, actor) values (new.id, 'access_removed', who); end if;
  if new.declined_at is not null and old.declined_at is null then
    insert into public.profile_events (profile_id, event, actor) values (new.id, 'declined', who); end if;
  if new.declined_at is null and old.declined_at is not null and not new.approved then
    insert into public.profile_events (profile_id, event, actor) values (new.id, 'restored', who); end if;
  if new.email_opt_in is distinct from old.email_opt_in then
    insert into public.profile_events (profile_id, event, actor, detail) values (new.id, case when new.email_opt_in then 'email_on' else 'email_off' end, who, '{}'::jsonb); end if;
  if new.phone_opt_in is distinct from old.phone_opt_in then
    insert into public.profile_events (profile_id, event, actor, detail) values (new.id, case when new.phone_opt_in then 'texts_on' else 'texts_off' end, who, jsonb_build_object('phone', coalesce(new.phone, old.phone))); end if;
  if new.linkedin_url is distinct from old.linkedin_url then
    insert into public.profile_events (profile_id, event, actor, detail) values (new.id, 'linkedin_changed', who, jsonb_build_object('from', old.linkedin_url, 'to', new.linkedin_url)); end if;
  return new;
end $$;
drop trigger if exists profiles_log_events on public.profiles;
create trigger profiles_log_events after insert or update on public.profiles
  for each row execute function public.profiles_log_events();
revoke all on function public.profiles_record_keeping() from public, anon, authenticated;
revoke all on function public.profiles_log_events() from public, anon, authenticated;

-- backfill the people already here, marked as backfilled (who approved them wasn't recorded at the time)
alter table public.profiles disable trigger profiles_record_keeping;
update public.profiles set approved_at = coalesce(submitted_at, created_at) where approved and approved_at is null;
alter table public.profiles enable trigger profiles_record_keeping;
insert into public.profile_events (profile_id, at, event, detail)
  select id, created_at, 'joined', '{"backfilled": true}'::jsonb from public.profiles p
  where not exists (select 1 from public.profile_events e where e.profile_id = p.id and e.event = 'joined');
insert into public.profile_events (profile_id, at, event, detail)
  select id, submitted_at, 'submitted', '{"backfilled": true}'::jsonb from public.profiles p
  where submitted_at is not null and not exists (select 1 from public.profile_events e where e.profile_id = p.id and e.event = 'submitted');
insert into public.profile_events (profile_id, at, event, detail)
  select id, approved_at, 'approved', '{"backfilled": true}'::jsonb from public.profiles p
  where approved and not exists (select 1 from public.profile_events e where e.profile_id = p.id and e.event = 'approved');
