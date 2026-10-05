-- "There now" (2026-10-05): when someone's LinkedIn lists the company, its dates decide now vs before; a typed current
-- company only counts for people whose LinkedIn doesn't list it. (Stasia typed "Google" with "Prev. APMM Intern" while
-- her LinkedIn shows the internship ended — she was listed as there now.)
create or replace function public.company_directory()
returns table (linkedin_id text, name text, logo_path text, people integer, current_people integer)
language sql stable security invoker set search_path = public as $$
  with stints as (
    select w.company_linkedin_id as id, w.profile_id, (w.end_year is null) as now
    from public.work_experiences w join public.profiles p on p.id = w.profile_id and p.approved
    where w.company_linkedin_id is not null
    union all
    select c.linkedin_id, p.id, true
    from public.companies c join public.profiles p on p.approved and lower(trim(p.current_company)) = lower(c.name)
    where not exists (select 1 from public.work_experiences w2 where w2.profile_id = p.id and w2.company_linkedin_id = c.linkedin_id)
  )
  select c.linkedin_id, c.name, c.logo_path, count(distinct s.profile_id)::int, count(distinct s.profile_id) filter (where s.now)::int
  from public.companies c join stints s on s.id = c.linkedin_id
  where not c.is_club
  group by c.linkedin_id, c.name, c.logo_path
  order by 4 desc, 2;
$$;
