-- Student clubs aren't companies (Bryan, 2026-10-05: "LavaLab filtered out as a club, same with Quant SC, TroyLabs
-- definitely — this is a TroyLabs website"). Clubs stay out of Companies; admins mark new ones from a company's page.
-- TroyLabs itself is a club here too, and the member pages leave it out of the experience timeline.
alter table public.companies add column if not exists is_club boolean not null default false;
update public.companies set is_club = true
  where linkedin_id in ('18216697', '3663395', '70992462')                      -- TroyLabs, LavaLab, Quant SC
     or name ~* '^\s*(troy ?labs|lava ?lab|quant ?sc)\s*$';

-- admins may flip is_club (and only through this policy; everything else about a company is the sync's)
grant update (is_club) on public.companies to authenticated;
drop policy if exists companies_admin_club on public.companies;
create policy companies_admin_club on public.companies for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- the list leaves clubs out
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
  )
  select c.linkedin_id, c.name, c.logo_path, count(distinct s.profile_id)::int, count(distinct s.profile_id) filter (where s.now)::int
  from public.companies c join stints s on s.id = c.linkedin_id
  where not c.is_club
  group by c.linkedin_id, c.name, c.logo_path
  order by 4 desc, 2;
$$;
