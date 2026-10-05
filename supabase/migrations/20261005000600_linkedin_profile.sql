-- Everything a LinkedIn sync brings in (2026-10-05, Bryan: "we're making a database here"), stored in two layers:
--   linkedin_snapshots  the scrape as it came, the member's own sections only (no guessed emails, no "people also
--                       viewed", no recommendations): nothing is lost and new features can be built without re-scraping
--   linkedin_items      honors, publications, certifications, organizations and schools: one shape, one table
--   profiles            LinkedIn's headline, about and skills, kept apart from what the member typed
--   companies           one row per LinkedIn company; its logo copied once into the public `company-logos` bucket
--                       (LinkedIn's logo links are signed and expire within weeks — ColorStack copies them too)
-- Photos: LinkedIn's photo is used only when the member has none, or still has the one an earlier sync brought
-- (avatar_source = 'linkedin'); a photo they upload is never replaced (ColorStack replaces it on every sync).

create table if not exists public.linkedin_snapshots (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  url text not null,
  scraped_at timestamptz not null default now(),
  data jsonb not null
);
alter table public.linkedin_snapshots enable row level security;
grant select on public.linkedin_snapshots to authenticated;
drop policy if exists linkedin_snapshots_read on public.linkedin_snapshots;
create policy linkedin_snapshots_read on public.linkedin_snapshots for select to authenticated using (profile_id = auth.uid() or public.is_admin());

create table if not exists public.linkedin_items (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('honor', 'publication', 'certification', 'organization', 'education')),
  sort integer not null,
  title text not null,
  issuer text,                 -- who gave it / published it
  detail text,                 -- degree and field, position held, credential id
  year smallint, month smallint, end_year smallint, end_month smallint,
  is_current boolean not null default false,
  link text,
  description text,
  is_usc boolean not null default false   -- schools: USC is everyone's, so pages show only the others
);
create index if not exists linkedin_items_profile on public.linkedin_items (profile_id, kind, sort);
alter table public.linkedin_items enable row level security;
grant select on public.linkedin_items to authenticated;
drop policy if exists linkedin_items_read on public.linkedin_items;
create policy linkedin_items_read on public.linkedin_items for select to authenticated
  using (profile_id = auth.uid() or public.is_admin() or (public.is_member() and exists (select 1 from public.profiles p where p.id = profile_id and p.approved)));

create table if not exists public.companies (
  linkedin_id text primary key,
  name text not null,
  logo_path text,              -- in the public company-logos bucket
  updated_at timestamptz not null default now()
);
alter table public.companies enable row level security;
grant select on public.companies to authenticated;
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies for select to authenticated using (true);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do nothing;

alter table public.profiles add column if not exists linkedin_headline text;
alter table public.profiles add column if not exists linkedin_about text;
alter table public.profiles add column if not exists linkedin_skills text[] not null default '{}';
alter table public.profiles add column if not exists avatar_source text check (avatar_source in ('upload', 'linkedin'));
alter table public.profiles add column if not exists avatar_linkedin_key text;   -- which LinkedIn photo is in use (its image id)

-- one sync, all at once: work history, items, snapshot and LinkedIn fields replaced together, then off the queue
create or replace function public.replace_linkedin_profile(p_profile uuid, p_url text, p_snapshot jsonb, p_work jsonb, p_items jsonb, p_headline text, p_about text, p_skills text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare nw integer; ni integer;
begin
  delete from public.work_experiences where profile_id = p_profile;
  insert into public.work_experiences (profile_id, sort, title, company, company_linkedin_id, company_linkedin_url, company_logo, employment_type, workplace_type, location, start_year, start_month, end_year, end_month, description)
  select p_profile, (r.ord - 1)::int, r.e->>'title', r.e->>'company', r.e->>'company_linkedin_id', r.e->>'company_linkedin_url', r.e->>'company_logo',
         r.e->>'employment_type', r.e->>'workplace_type', r.e->>'location',
         (r.e->>'start_year')::smallint, (r.e->>'start_month')::smallint, (r.e->>'end_year')::smallint, (r.e->>'end_month')::smallint, r.e->>'description'
  from jsonb_array_elements(p_work) with ordinality as r(e, ord);
  get diagnostics nw = row_count;
  delete from public.linkedin_items where profile_id = p_profile;
  insert into public.linkedin_items (profile_id, kind, sort, title, issuer, detail, year, month, end_year, end_month, is_current, link, description, is_usc)
  select p_profile, r.e->>'kind', (r.ord - 1)::int, r.e->>'title', r.e->>'issuer', r.e->>'detail',
         (r.e->>'year')::smallint, (r.e->>'month')::smallint, (r.e->>'end_year')::smallint, (r.e->>'end_month')::smallint,
         coalesce((r.e->>'current')::boolean, false), r.e->>'link', r.e->>'description', coalesce((r.e->>'is_usc')::boolean, false)
  from jsonb_array_elements(p_items) with ordinality as r(e, ord);
  get diagnostics ni = row_count;
  insert into public.linkedin_snapshots (profile_id, url, data, scraped_at) values (p_profile, p_url, p_snapshot, now())
    on conflict (profile_id) do update set url = excluded.url, data = excluded.data, scraped_at = excluded.scraped_at;
  update public.profiles set linkedin_headline = p_headline, linkedin_about = p_about, linkedin_skills = coalesce(p_skills, '{}'),
    linkedin_synced_at = now(), linkedin_sync_error = null where id = p_profile;
  delete from public.linkedin_sync_queue where profile_id = p_profile;
  return jsonb_build_object('work', nw, 'items', ni);
end $$;
revoke all on function public.replace_linkedin_profile(uuid, text, jsonb, jsonb, jsonb, text, text, text[]) from public, anon, authenticated;

-- a sync changes what AI search should know: re-embed when it lands (the semantic function reads work history and items)
drop trigger if exists profiles_queue_embedding on public.profiles;
create trigger profiles_queue_embedding
  after insert or update of approved, status, grad_year, join_term, join_year, divisions, current_title, current_company, city_id, industries, startups, bio, linkedin_synced_at
  on public.profiles for each row execute function public.queue_profile_embedding();
