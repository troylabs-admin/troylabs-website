-- Sign-up is one explicit step (Bryan, 2026-10-05): a new person fills in the whole required profile and presses
-- SUBMIT FOR APPROVAL. Only then do admins see them. Every submission is also copied, as it was at that moment, into
-- profile_submissions: an append-only record nothing in the app can change or delete — a backup in case anything
-- later goes wrong with the profile itself.

alter table public.profiles add column if not exists submitted_at timestamptz;

-- the backup: no foreign key on purpose, so the record outlives a deleted account
create table if not exists public.profile_submissions (
  id bigserial primary key,
  profile_id uuid not null,
  email text,
  submitted_at timestamptz not null default now(),
  snapshot jsonb not null
);
create index if not exists profile_submissions_profile on public.profile_submissions (profile_id, submitted_at desc);
alter table public.profile_submissions enable row level security;
drop policy if exists submissions_admin_read on public.profile_submissions;
create policy submissions_admin_read on public.profile_submissions for select to authenticated using (public.is_admin());
revoke all on public.profile_submissions from anon, authenticated;
grant select on public.profile_submissions to authenticated;
revoke all on sequence public.profile_submissions_id_seq from anon, authenticated;

-- append-only for everyone, the service role included: rows can be added, never edited or removed
create or replace function public.profile_submissions_append_only() returns trigger language plpgsql as $$
begin raise exception 'profile_submissions is an append-only backup: rows cannot be changed or deleted' using errcode = '42501'; end $$;
drop trigger if exists profile_submissions_no_change on public.profile_submissions;
create trigger profile_submissions_no_change before update or delete on public.profile_submissions for each row execute function public.profile_submissions_append_only();
drop trigger if exists profile_submissions_no_truncate on public.profile_submissions;
create trigger profile_submissions_no_truncate before truncate on public.profile_submissions for each statement execute function public.profile_submissions_append_only();

-- SUBMIT FOR APPROVAL: checks the required answers on the server, marks the profile submitted (first time only),
-- and writes the backup copy. Called again when someone still waiting edits their profile, so the backup keeps every
-- version they sent. Members who are already approved don't go through it.
create or replace function public.submit_application() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare p public.profiles%rowtype; mail text; city text;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'No profile for this account' using errcode = '42501'; end if;
  if p.approved then return p.submitted_at; end if;
  if coalesce(btrim(p.full_name), '') = '' or p.grad_year is null or p.join_year is null or p.join_term is null
     or coalesce(cardinality(p.divisions), 0) = 0 or p.city_id is null then
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

-- people can't mark themselves submitted (or un-submitted) by editing the row: only submit_application can
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid()
    and approved = (select p.approved from public.profiles p where p.id = auth.uid())
    and declined_at is not distinct from (select p.declined_at from public.profiles p where p.id = auth.uid())
    and submitted_at is not distinct from (select p.submitted_at from public.profiles p where p.id = auth.uid()));
