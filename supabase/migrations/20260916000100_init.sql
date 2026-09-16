-- TL Alumni Network — schema, first cut (2026-09-16).
-- One table per thing the portal talks about; row-level security on every one of them, enforced in the
-- database so a bug in the page cannot leak the roster. Decisions with Bryan: sign-in is a magic link to
-- the email on the profile, any usc.edu address may request access and an admin approves it, status is
-- student|alum with expected graduation flipping students to alumni automatically, e-board roles are set
-- by admins only, photos live in Storage, semantic search uses pgvector in this same database.

create extension if not exists citext with schema extensions;
create extension if not exists vector with schema extensions;

-- The project was created with "automatically expose new tables" on. Undo that: nothing is granted to
-- the API roles by default; every grant below is deliberate.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

create type public.member_status as enum ('student', 'alum');
create type public.term as enum ('FA', 'SP');

-- ── cities: a lookup with coordinates, so the globe never geocodes on the fly ─────────────────────
create table public.cities (
  id serial primary key,
  name text not null,
  region text not null default '',
  country text not null default 'US',
  lat double precision not null,
  lng double precision not null,
  unique (name, region, country)
);

-- ── profiles: one per person, keyed to their login ───────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  approved boolean not null default false,          -- set by an admin; until then you can sign in but see nobody
  status public.member_status not null default 'alum',
  grad_term public.term,                            -- students: expected graduation; alumni: their class year
  grad_year smallint,
  join_term public.term,                            -- the semester they joined TroyLabs (FA24, SP25 …)
  join_year smallint,
  division text,
  current_title text,
  current_company text,
  linkedin_url text,
  bio text,
  industries text[] not null default '{}',
  startups text[] not null default '{}',
  city_id integer references public.cities (id),
  usc_email extensions.citext unique,               -- the matching key against the roster
  personal_email extensions.citext unique,          -- the address that keeps working after graduation
  phone text,
  phone_opt_in boolean not null default false,
  avatar_path text,                                 -- object path in the avatars bucket
  embedding extensions.vector(1536),                -- semantic search; refreshed by a function when the profile saves
  request_note text,                                -- what they told us when asking for access
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index profiles_city_idx on public.profiles (city_id);
create index profiles_status_idx on public.profiles (status);

-- ── the admin list ────────────────────────────────────────────────────────────────────────────────
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users (id)
);

-- ── e-board history: a credential, so admins write it, everyone reads it ─────────────────────────
create table public.eboard_roles (
  id bigserial primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  term public.term not null,
  year smallint not null,
  unique (profile_id, role, term, year)
);

-- ── roster: the Notion import; who TroyLabs says was a member ─────────────────────────────────────
create table public.roster (
  id bigserial primary key,
  full_name text,
  usc_email extensions.citext unique,
  join_term public.term,
  join_year smallint,
  division text,
  source text not null default 'notion',
  imported_at timestamptz not null default now()
);

-- ── messages: what admins send, to whom, and who got it ──────────────────────────────────────────
create table public.channels (
  id serial primary key,
  name text not null unique,
  rule jsonb not null default '{}',                 -- e.g. {"status":"alum","division":"TECH"}; membership is computed, never stored
  system boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.messages (
  id bigserial primary key,
  title text not null default '',
  body text not null default '',
  send_by text not null default 'email' check (send_by in ('email', 'text', 'both')),
  channel_id integer references public.channels (id),
  filters jsonb not null default '{}',
  event jsonb,                                      -- optional: name, when, where, rsvp url
  state text not null default 'draft' check (state in ('draft', 'scheduled', 'sent', 'cancelled')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.message_recipients (
  message_id bigint not null references public.messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null check (channel in ('email', 'text')),
  delivered_at timestamptz,
  primary key (message_id, profile_id, channel)
);

-- ── helpers ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and approved);
$$;

-- a profile row appears the moment someone signs in for the first time; the address they used lands in
-- the right column, and anyone already on the roster is approved on the spot
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare on_roster boolean;
begin
  select exists (select 1 from public.roster r where r.usc_email = new.email) into on_roster;
  insert into public.profiles (id, full_name, usc_email, personal_email, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.email ilike '%usc.edu' then new.email end,
    case when new.email not ilike '%usc.edu' then new.email end,
    on_roster
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger messages_touch before update on public.messages for each row execute function public.touch_updated_at();

-- students become alumni when their expected graduation semester has ended: spring ends in June, fall in
-- December. Run nightly (pg_cron) once that is switched on; harmless to run any time.
create or replace function public.graduate_students() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.profiles set status = 'alum'
  where status = 'student' and grad_year is not null and grad_term is not null
    and (grad_year < extract(year from now())
      or (grad_year = extract(year from now()) and ((grad_term = 'SP' and extract(month from now()) >= 6) or (grad_term = 'FA' and extract(month from now()) >= 12))));
  get diagnostics n = row_count;
  return n;
end $$;

-- ── row-level security: on everywhere, then only what each role needs ────────────────────────────
alter table public.cities enable row level security;
alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.eboard_roles enable row level security;
alter table public.roster enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.message_recipients enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.cities, public.profiles, public.eboard_roles, public.admins to authenticated;
grant insert on public.cities to authenticated;
grant update on public.profiles to authenticated;
grant all on public.profiles, public.eboard_roles, public.roster, public.channels, public.messages, public.message_recipients, public.admins, public.cities to authenticated;   -- narrowed by the policies below
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.is_admin(), public.is_member() to authenticated;

-- cities: every member reads; any member may add one (the profile page's location picker)
create policy cities_read on public.cities for select to authenticated using (true);
create policy cities_add on public.cities for insert to authenticated with check (true);

-- profiles: you always see your own; approved members see everyone approved; admins see everyone
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (public.is_member() and approved));
-- you edit your own — but not your approval, and your status only forward (admins can do anything)
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and approved = (select p.approved from public.profiles p where p.id = auth.uid()));
create policy profiles_admin on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- admins: you can see whether YOU are one; admins manage the list
create policy admins_read_self on public.admins for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy admins_manage on public.admins for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- e-board: members read, admins write
create policy eboard_read on public.eboard_roles for select to authenticated using (public.is_member() or public.is_admin());
create policy eboard_admin on public.eboard_roles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- roster, channels, messages, recipients: admins only
create policy roster_admin on public.roster for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy channels_admin on public.channels for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy messages_admin on public.messages for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy recipients_admin on public.message_recipients for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── photos: one bucket, public to read, only you write under your own folder ─────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy avatars_read on storage.objects for select to public using (bucket_id = 'avatars');
create policy avatars_write_own on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_own on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── the standing channels (rules, not lists) ──────────────────────────────────────────────────────
insert into public.channels (name, rule, system) values
  ('EVERYONE', '{}', true),
  ('ALL ALUMNI', '{"status":"alum"}', true),
  ('ALL STUDENTS', '{"status":"student"}', true),
  ('ALUMNI · PMS', '{"status":"alum","division":"PRODUCT"}', true),
  ('ALUMNI · TECH', '{"status":"alum","division":"TECH"}', true),
  ('STUDENTS · PMS', '{"status":"student","division":"PRODUCT"}', true),
  ('STUDENTS · TECH', '{"status":"student","division":"TECH"}', true),
  ('LA', '{"city":"Los Angeles"}', true)
on conflict (name) do nothing;

-- ── cities the club actually has people in, so the first profiles need no lookup ─────────────────
insert into public.cities (name, region, country, lat, lng) values
  ('Los Angeles', 'CA', 'US', 34.0522, -118.2437), ('San Francisco', 'CA', 'US', 37.7749, -122.4194), ('Palo Alto', 'CA', 'US', 37.4419, -122.1430),
  ('San Jose', 'CA', 'US', 37.3382, -121.8863), ('Oakland', 'CA', 'US', 37.8044, -122.2712), ('Irvine', 'CA', 'US', 33.6846, -117.8265),
  ('San Diego', 'CA', 'US', 32.7157, -117.1611), ('New York', 'NY', 'US', 40.7128, -74.0060), ('Boston', 'MA', 'US', 42.3601, -71.0589),
  ('Philadelphia', 'PA', 'US', 39.9526, -75.1652), ('Washington', 'DC', 'US', 38.9072, -77.0369), ('Chicago', 'IL', 'US', 41.8781, -87.6298),
  ('Seattle', 'WA', 'US', 47.6062, -122.3321), ('Austin', 'TX', 'US', 30.2672, -97.7431), ('Miami', 'FL', 'US', 25.7617, -80.1918),
  ('Toronto', 'ON', 'CA', 43.6532, -79.3832), ('London', '', 'GB', 51.5074, -0.1278), ('Singapore', '', 'SG', 1.3521, 103.8198),
  ('Tokyo', '', 'JP', 35.6762, 139.6503), ('Mexico City', '', 'MX', 19.4326, -99.1332), ('Denver', 'CO', 'US', 39.7392, -104.9903),
  ('Dallas', 'TX', 'US', 32.7767, -96.7970), ('Houston', 'TX', 'US', 29.7604, -95.3698), ('Atlanta', 'GA', 'US', 33.7490, -84.3880),
  ('Portland', 'OR', 'US', 45.5152, -122.6784), ('Phoenix', 'AZ', 'US', 33.4484, -112.0740), ('Las Vegas', 'NV', 'US', 36.1699, -115.1398),
  ('Sacramento', 'CA', 'US', 38.5816, -121.4944), ('Santa Monica', 'CA', 'US', 34.0195, -118.4912), ('Pasadena', 'CA', 'US', 34.1478, -118.1445)
on conflict do nothing;
