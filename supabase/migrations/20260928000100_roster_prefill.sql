-- The roster carries what Notion knows (2026-09-28), so a person's profile is pre-filled the first time
-- they sign in instead of starting blank: divisions, the semesters they were active, graduation year,
-- phone, LinkedIn. Source: the "TroyLabs Fam" database (one table; the per-semester pages are views of it).
alter table public.roster
  add column if not exists divisions text[] not null default '{}',
  add column if not exists semesters text[] not null default '{}',          -- e.g. {FA24,SP25}
  add column if not exists grad_year smallint,
  add column if not exists phone text,
  add column if not exists linkedin_url text,
  add column if not exists major text,
  add column if not exists hometown text,
  add column if not exists notion_id text;                                 -- to recognise the same person on a re-import

-- first sign-in: create the profile, and if they are on the roster, copy what we know across
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.roster%rowtype; bootstrap boolean;
begin
  bootstrap := lower(new.email) in ('bryanram@usc.edu');
  select * into r from public.roster where usc_email = new.email limit 1;
  insert into public.profiles (id, full_name, usc_email, personal_email, approved, status, grad_term, grad_year, join_term, join_year, divisions, phone, linkedin_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), r.full_name, ''),
    case when new.email ilike '%usc.edu' then new.email end,
    case when new.email not ilike '%usc.edu' then new.email end,
    (r.id is not null) or bootstrap,
    -- graduated if their class year's spring has ended (spring ends in June)
    case when r.grad_year is not null and (r.grad_year < extract(year from now()) or (r.grad_year = extract(year from now()) and extract(month from now()) >= 6)) then 'alum' else 'student' end,
    case when r.grad_year is not null then 'SP' end,
    r.grad_year,
    r.join_term, r.join_year,
    coalesce(r.divisions, '{}'),
    r.phone, r.linkedin_url
  );
  if bootstrap then insert into public.admins (user_id) values (new.id) on conflict do nothing; end if;
  return new;
end $$;
