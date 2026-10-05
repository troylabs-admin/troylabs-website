-- Company pages (2026-10-05, the ColorStack idea Bryan picked): every company TroyLabs members have worked at, and on
-- each company's page who worked there and who's there now. Built from LinkedIn work history (work_experiences, keyed
-- by LinkedIn's company id) plus members whose typed "current company" is that company's name.
-- Both functions run as the caller: row-level security decides whose jobs count (approved members only, for members).

alter table public.companies add column if not exists linkedin_url text;   -- the company's own LinkedIn page

-- the list: every company with at least one approved member, how many worked there and how many are there now
create or replace function public.company_directory()
returns table (linkedin_id text, name text, logo_path text, people integer, current_people integer)
language sql stable security invoker set search_path = public as $$
  with stints as (
    select w.company_linkedin_id as id, w.profile_id, (w.end_year is null) as now
    from public.work_experiences w join public.profiles p on p.id = w.profile_id and p.approved
    where w.company_linkedin_id is not null
    union all   -- someone who typed the company as their current one, without a LinkedIn import
    select c.linkedin_id, p.id, true
    from public.companies c join public.profiles p on p.approved and lower(trim(p.current_company)) = lower(c.name)
  )
  select c.linkedin_id, c.name, c.logo_path, count(distinct s.profile_id)::int, count(distinct s.profile_id) filter (where s.now)::int
  from public.companies c join stints s on s.id = c.linkedin_id
  group by c.linkedin_id, c.name, c.logo_path
  order by 4 desc, 2;
$$;
revoke all on function public.company_directory() from public, anon;
grant execute on function public.company_directory() to authenticated;
