-- The profile has no job boxes any more (Bryan, 2026-10-05: "remove this for now, the work history will import it"):
-- the card's current job is LinkedIn's. Applied now to everyone already imported, from their stored work history:
-- the first current job (LinkedIn's order) that isn't TroyLabs or a club; none → cleared.
update public.profiles p set
  current_title = j.title, current_company = j.company, current_job_source = 'linkedin'
from (
  select pr.id,
    (select w.title from public.work_experiences w left join public.companies c on c.linkedin_id = w.company_linkedin_id
      where w.profile_id = pr.id and w.end_year is null and not coalesce(c.is_club, false) and coalesce(w.company_linkedin_id, '') <> '18216697'
        and w.company !~* '^\s*(troy\s?labs|lava\s?lab|quant\s?sc)\s*$' order by w.sort limit 1) as title,
    (select w.company from public.work_experiences w left join public.companies c on c.linkedin_id = w.company_linkedin_id
      where w.profile_id = pr.id and w.end_year is null and not coalesce(c.is_club, false) and coalesce(w.company_linkedin_id, '') <> '18216697'
        and w.company !~* '^\s*(troy\s?labs|lava\s?lab|quant\s?sc)\s*$' order by w.sort limit 1) as company
  from public.profiles pr where pr.linkedin_synced_at is not null
) j
where p.id = j.id;
