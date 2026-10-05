-- Work history from LinkedIn (2026-10-05). The member puts their LinkedIn link on their profile; nothing is read until
-- an admin approves them (Bryan). Approving puts them in a queue; a worker (the `linkedin-sync` function, every minute)
-- reads up to 10 queued profiles in ONE Apify run — the scraper ColorStack uses, from the public page, no LinkedIn
-- login — and REPLACES that person's work history with what their LinkedIn shows now.
--
-- Why replace, not merge: ColorStack merges new LinkedIn jobs into saved ones with a fuzzy score (oyster,
-- packages/core/src/modules/linkedin.ts doesExperienceMatch) against a snapshot taken before the sync, so a
-- renamed job ("Incoming Software Engineering Intern" → "Software Engineering Intern") or the scraper's own repeat of
-- one job (it returns Bryan's NVIDIA internship twice) became duplicates that never go away. Here the imported list
-- is swapped in one transaction; repeats inside one scrape are merged before saving; a failed or empty scrape never
-- wipes anything.

alter table public.profiles add column if not exists linkedin_synced_at timestamptz;   -- last successful import
alter table public.profiles add column if not exists linkedin_sync_error text;         -- why the last try failed, if it did

create table if not exists public.work_experiences (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  sort integer not null,                    -- LinkedIn's own order (newest first)
  title text not null,
  company text not null,
  company_linkedin_id text, company_linkedin_url text, company_logo text,
  employment_type text,                     -- Full-time, Internship, … as LinkedIn says it
  workplace_type text,                      -- On-site, Hybrid, Remote
  location text,
  start_year smallint, start_month smallint,
  end_year smallint, end_month smallint,    -- both null = present
  description text,
  synced_at timestamptz not null default now()
);
create index if not exists work_experiences_profile on public.work_experiences (profile_id, sort);
alter table public.work_experiences enable row level security;
grant select on public.work_experiences to authenticated;   -- row-level security below decides which rows
-- readable like the profile it belongs to; written only by the sync (service role)
drop policy if exists work_experiences_read on public.work_experiences;
create policy work_experiences_read on public.work_experiences for select to authenticated
  using (profile_id = auth.uid() or public.is_admin() or (public.is_member() and exists (select 1 from public.profiles p where p.id = profile_id and p.approved)));

-- the queue: one row per person at most, so double-clicking APPROVE or SYNC can't queue anyone twice
create table if not exists public.linkedin_sync_queue (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('approved', 'member', 'admin')),
  requested_at timestamptz not null default now(),
  next_try_at timestamptz not null default now(),
  claimed_at timestamptz,                   -- a worker took it; a claim older than 10 minutes is taken again
  attempts smallint not null default 0,
  last_error text
);
alter table public.linkedin_sync_queue enable row level security;
revoke all on public.linkedin_sync_queue from anon, authenticated;

-- every scrape, for the monthly spending cap (Apify's free plan is $5/month ≈ 1,250 profiles)
create table if not exists public.linkedin_scrapes (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  profiles integer not null,
  ok integer not null default 0
);
alter table public.linkedin_scrapes enable row level security;
revoke all on public.linkedin_scrapes from anon, authenticated;

-- approving someone with a LinkedIn link queues their first import
create or replace function public.queue_linkedin_on_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.approved and not coalesce(old.approved, false) and nullif(trim(new.linkedin_url), '') is not null then
    insert into public.linkedin_sync_queue (profile_id, reason) values (new.id, 'approved') on conflict (profile_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists profiles_queue_linkedin on public.profiles;
create trigger profiles_queue_linkedin after update of approved on public.profiles
  for each row execute function public.queue_linkedin_on_approval();

-- the worker takes up to n people; two workers running at once never take the same person (skip locked)
create or replace function public.claim_linkedin_batch(n integer) returns table (profile_id uuid, linkedin_url text, attempts smallint)
language sql security definer set search_path = public as $$
  update public.linkedin_sync_queue q set claimed_at = now(), attempts = q.attempts + 1
  from public.profiles p
  where p.id = q.profile_id and q.profile_id in (
    select q2.profile_id from public.linkedin_sync_queue q2
    where q2.next_try_at <= now() and (q2.claimed_at is null or q2.claimed_at < now() - interval '10 minutes')
    order by q2.requested_at limit greatest(1, least(n, 25)) for update skip locked)
  returning q.profile_id, p.linkedin_url, q.attempts;
$$;

-- swap in a person's imported work history in one transaction and take them off the queue
create or replace function public.replace_work_history(p_profile uuid, p_rows jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.work_experiences where profile_id = p_profile;
  insert into public.work_experiences (profile_id, sort, title, company, company_linkedin_id, company_linkedin_url, company_logo, employment_type, workplace_type, location, start_year, start_month, end_year, end_month, description)
  select p_profile, (r.ord - 1)::int, r.e->>'title', r.e->>'company', r.e->>'company_linkedin_id', r.e->>'company_linkedin_url', r.e->>'company_logo',
         r.e->>'employment_type', r.e->>'workplace_type', r.e->>'location',
         (r.e->>'start_year')::smallint, (r.e->>'start_month')::smallint, (r.e->>'end_year')::smallint, (r.e->>'end_month')::smallint, r.e->>'description'
  from jsonb_array_elements(p_rows) with ordinality as r(e, ord);
  get diagnostics n = row_count;
  update public.profiles set linkedin_synced_at = now(), linkedin_sync_error = null where id = p_profile;
  delete from public.linkedin_sync_queue where profile_id = p_profile;
  return n;
end $$;

revoke all on function public.claim_linkedin_batch(integer), public.replace_work_history(uuid, jsonb), public.queue_linkedin_on_approval() from public, anon, authenticated;
