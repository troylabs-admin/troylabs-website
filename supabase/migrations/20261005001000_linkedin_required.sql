-- A LinkedIn profile link, a phone number and a personal (non-USC) email are required to apply (Bryan, 2026-10-05:
-- "the whole point is for people to be connected"). The LinkedIn link: it's how members see each other on LinkedIn, how
-- leadership checks an applicant is who they say, and the only way the work-history import can find them. The link
-- is stored in one form by the normalize_linkedin_url trigger; here the server refuses a missing or non-profile link.
-- Members approved before this keep working without one (they're asked for it on their profile).
create or replace function public.submit_application() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p public.profiles%rowtype; mail text; city text;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'No profile for this account' using errcode = '42501'; end if;
  if p.approved then return p.submitted_at; end if;
  if coalesce(btrim(p.full_name), '') = '' or p.grad_year is null or p.join_year is null or p.join_term is null
     or coalesce(cardinality(p.divisions), 0) = 0 or p.city_id is null
     or coalesce(p.linkedin_url, '') !~ '^https://www\.linkedin\.com/in/[^/?#[:space:]]+$'
     or p.phone is null
     or coalesce(p.personal_email::text, '') = '' or p.personal_email::text ~* '@([a-z0-9-]+\.)*usc\.edu$' then
    raise exception 'The profile is missing required answers' using errcode = '22023';
  end if;
  update public.profiles set submitted_at = coalesce(submitted_at, now()) where id = p.id returning * into p;
  select u.email into mail from auth.users u where u.id = p.id;
  select c.name || coalesce(', ' || nullif(c.region, ''), '') into city from public.cities c where c.id = p.city_id;
  insert into public.profile_submissions (profile_id, email, snapshot)
    values (p.id, mail, to_jsonb(p) - 'embedding' || jsonb_build_object('city', city, 'sign_in_email', mail));
  return p.submitted_at;
end $$;
revoke all on function public.submit_application() from public, anon;
grant execute on function public.submit_application() to authenticated;
