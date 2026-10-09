-- Recurring templates never send directly. Each actual occurrence is its own immutable message.
begin;
alter table public.messages
  add column recurrence jsonb,
  add column recurrence_index integer not null default 0 check (recurrence_index >= 0),
  add column recurrence_skipped integer not null default 0 check (recurrence_skipped >= 0),
  add column parent_series_id bigint references public.messages(id) on delete restrict,
  add column occurrence_at timestamptz;
alter table public.messages drop constraint messages_state_check;
alter table public.messages add constraint messages_state_check check (state in ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'completed'));
alter table public.messages add constraint messages_occurrence_shape check (
  (parent_series_id is null and occurrence_at is null) or
  (parent_series_id is not null and occurrence_at is not null and recurrence is null)
);
create unique index messages_series_occurrence on public.messages(parent_series_id, occurrence_at) where parent_series_id is not null;
create index messages_due_scheduled on public.messages(scheduled_for) where state = 'scheduled';

create or replace function public.guard_message_recurrence() returns trigger
language plpgsql set search_path = public as $$
declare r jsonb := new.recurrence; n numeric; local_start timestamp; end_day date;
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.parent_series_id is not null or new.recurrence_index <> 0 or new.recurrence_skipped <> 0 then
        raise exception 'Only the scheduler can create occurrences or advance a repeat schedule';
      end if;
    else
      if new.parent_series_id is distinct from old.parent_series_id or new.occurrence_at is distinct from old.occurrence_at
        or new.recurrence_index <> old.recurrence_index or new.recurrence_skipped <> old.recurrence_skipped then
        raise exception 'Only the scheduler can change occurrence bookkeeping';
      end if;
      if old.recurrence_index > 0 and (new.recurrence is distinct from old.recurrence or new.scheduled_for is distinct from old.scheduled_for) then
        raise exception 'Create a new schedule to change a repeat series that has started';
      end if;
    end if;
  end if;
  if r is not null then
    if jsonb_typeof(r) <> 'object' or coalesce(r->>'frequency', '') not in ('daily','weekly','monthly','yearly') then raise exception 'Invalid repeat frequency'; end if;
    if jsonb_typeof(r->'interval') is distinct from 'number' then raise exception 'Invalid repeat interval'; end if;
    n := (r->>'interval')::numeric;
    if n <> trunc(n) or n < 1 or n > 999 then raise exception 'Repeat interval must be 1 to 999'; end if;
    if not exists(select 1 from pg_timezone_names where name = r->>'timezone') then raise exception 'Invalid repeat time zone'; end if;
    if coalesce(r->>'start_local', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'Invalid repeat start'; end if;
    local_start := (r->>'start_local')::timestamp;
    if to_char(local_start, 'YYYY-MM-DD"T"HH24:MI') <> r->>'start_local' then raise exception 'Invalid repeat start'; end if;
    if jsonb_typeof(r->'end') is distinct from 'object' or coalesce(r#>>'{end,type}', '') not in ('never','count','until') then raise exception 'Invalid repeat ending'; end if;
    if r#>>'{end,type}' = 'count' then
      if jsonb_typeof(r#>'{end,count}') is distinct from 'number' then raise exception 'Invalid occurrence count'; end if;
      n := (r#>>'{end,count}')::numeric;
      if n <> trunc(n) or n < 1 or n > 10000 then raise exception 'Occurrence count must be 1 to 10000'; end if;
    elsif r#>>'{end,type}' = 'until' then
      if coalesce(r#>>'{end,until}', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid repeat end date'; end if;
      end_day := (r#>>'{end,until}')::date;
      if end_day < local_start::date then raise exception 'Repeat ending is before its start'; end if;
    end if;
    if r->>'frequency' = 'weekly' and r ? 'weekdays' then
      if jsonb_typeof(r->'weekdays') <> 'array' then raise exception 'Invalid weekdays'; end if;
      if jsonb_array_length(r->'weekdays') = 0 then raise exception 'Choose at least one weekday'; end if;
      if exists(select 1 from jsonb_array_elements(r->'weekdays') d where jsonb_typeof(d) <> 'number' or d::text !~ '^[0-6]$') then raise exception 'Invalid weekdays'; end if;
    end if;
    if new.send_by <> 'text' then raise exception 'Repeat schedules support texts only'; end if;
    if new.state in ('sending','sent') then raise exception 'A repeat template cannot be sent directly'; end if;
    if new.state = 'scheduled' and new.scheduled_for is null then raise exception 'A repeat schedule needs its next send time'; end if;
  end if;
  return new;
end $$;
create trigger messages_recurrence_guard before insert or update on public.messages for each row execute function public.guard_message_recurrence();

-- Cancel only unclaimed occurrences; a provider request already in flight cannot be recalled.
create or replace function public.cancel_message_series_children() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recurrence is not null and new.state = 'cancelled' and old.state <> 'cancelled' then
    update public.messages set state = 'cancelled' where parent_series_id = new.id and state = 'scheduled';
  end if;
  return new;
end $$;
create trigger messages_cancel_series after update on public.messages for each row execute function public.cancel_message_series_children();

-- The edge worker computes calendar times with the shared helper, then commits the child AND next
-- cursor in one row-locked transaction. Expected version protects against concurrent admin edits.
create or replace function public.materialize_message_occurrence(
  p_series_id bigint, p_expected_updated_at timestamptz, p_expected_at timestamptz,
  p_occurrence_at timestamptz, p_next_at timestamptz, p_next_index integer, p_skipped integer
) returns bigint language plpgsql security definer set search_path = public as $$
declare s public.messages; child_id bigint;
begin
  select * into s from public.messages where id = p_series_id for update;
  if not found or s.state <> 'scheduled' or s.recurrence is null or s.parent_series_id is not null
    or s.updated_at is distinct from p_expected_updated_at or s.scheduled_for is distinct from p_expected_at then return null; end if;
  if p_occurrence_at is null or p_occurrence_at < s.scheduled_for or p_occurrence_at > now()
    or p_next_index is null or p_skipped is null or p_skipped < 0
    or p_next_index <> s.recurrence_index + p_skipped + 1
    or (p_next_at is not null and (p_next_at <= now() or p_next_at <= p_occurrence_at)) then
    raise exception 'Invalid occurrence advancement';
  end if;
  -- Coalesce any previously materialized but unclaimed backlog, never replay a burst after downtime.
  update public.messages set state = 'cancelled', last_error = 'Skipped after a newer recurrence became due.'
    where parent_series_id = s.id and state = 'scheduled' and occurrence_at < p_occurrence_at;
  insert into public.messages(title, body, send_by, audience, event, created_by, state, scheduled_for, parent_series_id, occurrence_at)
    values(s.title, s.body, s.send_by, s.audience, s.event, s.created_by, 'scheduled', p_occurrence_at, s.id, p_occurrence_at)
    on conflict (parent_series_id, occurrence_at) where parent_series_id is not null do nothing returning id into child_id;
  if child_id is null then return null; end if;
  update public.messages set scheduled_for = p_next_at, recurrence_index = p_next_index,
    recurrence_skipped = recurrence_skipped + p_skipped,
    state = case when p_next_at is null then 'completed' else 'scheduled' end, last_error = null where id = s.id;
  return child_id;
end $$;
revoke all on function public.materialize_message_occurrence(bigint,timestamptz,timestamptz,timestamptz,timestamptz,integer,integer) from public, anon, authenticated;
grant execute on function public.materialize_message_occurrence(bigint,timestamptz,timestamptz,timestamptz,timestamptz,integer,integer) to service_role;

-- Replacing a running series is one transaction: no window with two active templates, and no lost
-- original schedule if the replacement fails validation. Invoker RLS + is_admin enforce caller rights.
create or replace function public.replace_message_series(p_series_id bigint, p_expected_updated_at timestamptz, p_message jsonb)
returns public.messages language plpgsql set search_path = public as $$
declare old_series public.messages; replacement public.messages;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into old_series from public.messages where id = p_series_id for update;
  if not found or old_series.recurrence is null or old_series.parent_series_id is not null
    or old_series.updated_at is distinct from p_expected_updated_at or old_series.state not in ('scheduled','draft') then
    raise exception 'This schedule changed. Reload before replacing it.';
  end if;
  if coalesce(p_message->>'state','') not in ('draft','scheduled') then raise exception 'Invalid replacement schedule'; end if;
  if p_message->>'state' = 'scheduled' and (p_message->>'scheduled_for' is null or (p_message->>'scheduled_for')::timestamptz <= now()) then
    raise exception 'The replacement must start in the future';
  end if;
  insert into public.messages(title,body,send_by,audience,event,recurrence,state,scheduled_for,created_by)
    values(coalesce(p_message->>'title',''),coalesce(p_message->>'body',''),'text',coalesce(p_message->'audience','{}'),
      nullif(p_message->'event','null'::jsonb),nullif(p_message->'recurrence','null'::jsonb),p_message->>'state',
      (p_message->>'scheduled_for')::timestamptz,old_series.created_by)
    returning * into replacement;
  update public.messages set state = 'cancelled' where id = old_series.id;
  return replacement;
end $$;
revoke all on function public.replace_message_series(bigint,timestamptz,jsonb) from public, anon;
grant execute on function public.replace_message_series(bigint,timestamptz,jsonb) to authenticated;
commit;
