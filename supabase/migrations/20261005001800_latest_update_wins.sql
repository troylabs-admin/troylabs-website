-- The latest update wins, everywhere (Bryan, 2026-10-05): a LinkedIn sync after a hand edit → LinkedIn's dates decide
-- "there now"; a hand edit after the sync → the edit decides (typed current company = there now). So the time of the
-- last hand edit of the current job is kept and compared with linkedin_synced_at.
alter table public.profiles add column if not exists current_job_edited_at timestamptz;
create or replace function public.stamp_job_edit() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.current_title is distinct from old.current_title or new.current_company is distinct from old.current_company)
     and new.current_job_source is distinct from 'linkedin' then
    new.current_job_edited_at := now();
  end if;
  return new;
end $$;
drop trigger if exists profiles_stamp_job_edit on public.profiles;
create trigger profiles_stamp_job_edit before update of current_title, current_company, current_job_source on public.profiles
  for each row execute function public.stamp_job_edit();

-- typed after the last sync ("hand edit is newer")
create or replace function public.typed_job_is_newer(p public.profiles) returns boolean
language sql stable set search_path = public as $$
  select p.current_job_source is distinct from 'linkedin' and p.current_job_edited_at is not null
     and p.current_job_edited_at > coalesce(p.linkedin_synced_at, '-infinity'::timestamptz);
$$;

create or replace function public.company_directory()
returns table (linkedin_id text, name text, logo_path text, people integer, current_people integer)
language sql stable security invoker set search_path = public as $$
  with stints as (
    select w.company_linkedin_id as id, w.profile_id, (w.end_year is null) as now
    from public.work_experiences w join public.profiles p on p.id = w.profile_id and p.approved
    where w.company_linkedin_id is not null
    union all   -- a typed current company: counts when their LinkedIn doesn't list it, or when the edit is newer than the sync
    select c.linkedin_id, p.id, true
    from public.companies c join public.profiles p on p.approved and lower(trim(p.current_company)) = lower(c.name)
    where public.typed_job_is_newer(p)
       or not exists (select 1 from public.work_experiences w2 where w2.profile_id = p.id and w2.company_linkedin_id = c.linkedin_id)
  )
  select c.linkedin_id, c.name, c.logo_path, count(distinct s.profile_id)::int, count(distinct s.profile_id) filter (where s.now)::int
  from public.companies c join stints s on s.id = c.linkedin_id
  where not c.is_club
  group by c.linkedin_id, c.name, c.logo_path
  order by 4 desc, 2;
$$;
