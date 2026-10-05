-- Sign in with either email, and no more blocked sign-ups (2026-10-05).
--
-- The bug (reproduced): profiles.usc_email / personal_email are unique and members could write any address into them,
-- unconfirmed. Typing someone else's address onto your own profile made that person's sign-up fail ("Database error
-- saving new user"), because the sign-up trigger copies their address into the same unique column.
--
-- The standard fix (GitHub, Google): an account can have several addresses; an address counts only once its owner has
-- clicked a confirmation link sent to it; a confirmed address signs in to the same account (the link goes only to the
-- address typed). So:
--   account_emails       confirmed addresses besides the sign-in one (auth.users.email), one account each
--   email_confirmations  pending confirmation links (only a SHA-256 of the token is stored)
--   email_sends          what the `account-email` function sent, for its rate limits
-- Members can no longer write usc_email / personal_email themselves; the function does, after confirmation.

create table if not exists public.account_emails (
  email extensions.citext primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('usc', 'personal')),
  verified_at timestamptz not null default now(),
  unique (user_id, kind)
);
create table if not exists public.email_confirmations (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email extensions.citext not null,
  kind text not null check (kind in ('usc', 'personal')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_confirmations_user on public.email_confirmations (user_id);
create table if not exists public.email_sends (
  id bigint generated always as identity primary key,
  email extensions.citext not null,
  user_id uuid,
  purpose text not null check (purpose in ('sign-in', 'confirm')),
  sent_at timestamptz not null default now()
);
create index if not exists email_sends_recent on public.email_sends (email, sent_at);
-- only the function (service role) touches these
alter table public.account_emails enable row level security;
alter table public.email_confirmations enable row level security;
alter table public.email_sends enable row level security;
revoke all on public.account_emails, public.email_confirmations, public.email_sends from anon, authenticated;

-- the addresses already on profiles were entered by leadership or are the person's own sign-in address: confirmed
insert into public.account_emails (email, user_id, kind)
  select p.usc_email, p.id, 'usc' from public.profiles p join auth.users u on u.id = p.id
  where p.usc_email is not null and lower(p.usc_email) <> lower(u.email)
on conflict do nothing;
insert into public.account_emails (email, user_id, kind)
  select p.personal_email, p.id, 'personal' from public.profiles p join auth.users u on u.id = p.id
  where p.personal_email is not null and lower(p.personal_email) <> lower(u.email)
on conflict do nothing;

-- is this address someone's (sign-in address, confirmed address, or on a profile), other than `me`?
create or replace function public.email_taken(addr text, me uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from auth.users u where lower(u.email) = lower(addr) and u.id is distinct from me)
      or exists (select 1 from public.account_emails a where a.email = addr::citext and a.user_id is distinct from me)
      or exists (select 1 from public.profiles p where (p.usc_email = addr::citext or p.personal_email = addr::citext) and p.id is distinct from me);
$$;
revoke all on function public.email_taken(text, uuid) from public, anon, authenticated;

-- a confirmation link was clicked: atomically record the address and show it on the profile
create or replace function public.confirm_account_email(p_hash text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.email_confirmations%rowtype; auth_email text;
begin
  select * into c from public.email_confirmations where token_hash = p_hash for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if c.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'used', 'email', c.email); end if;
  if c.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired', 'email', c.email); end if;
  if public.email_taken(c.email, c.user_id) then return jsonb_build_object('ok', false, 'reason', 'taken', 'email', c.email); end if;
  update public.email_confirmations set used_at = now() where token_hash = p_hash;
  select u.email into auth_email from auth.users u where u.id = c.user_id;
  delete from public.account_emails where user_id = c.user_id and kind = c.kind;
  if lower(c.email) <> lower(auth_email) then insert into public.account_emails (email, user_id, kind) values (c.email, c.user_id, c.kind); end if;
  if c.kind = 'usc' then update public.profiles set usc_email = c.email where id = c.user_id;
  else update public.profiles set personal_email = c.email where id = c.user_id; end if;
  return jsonb_build_object('ok', true, 'email', c.email, 'kind', c.kind);
end $$;
revoke all on function public.confirm_account_email(text) from public, anon, authenticated;

-- members can no longer write their addresses directly (that's what let one account block another's sign-up)
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and approved = (select p.approved from public.profiles p where p.id = auth.uid())
    and not (declined_at is distinct from (select p.declined_at from public.profiles p where p.id = auth.uid()))
    and not (submitted_at is distinct from (select p.submitted_at from public.profiles p where p.id = auth.uid()))
    and not (usc_email is distinct from (select p.usc_email from public.profiles p where p.id = auth.uid()))
    and not (personal_email is distinct from (select p.personal_email from public.profiles p where p.id = auth.uid()))
  );

-- sign-up never fails over an address: it's copied onto the new profile only if nobody else has it
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.roster%rowtype; bootstrap boolean; free boolean; is_usc boolean;
begin
  -- a confirmed address of another account signs in to THAT account (the sign-in page routes it there); refuse a second account for it
  if exists (select 1 from public.account_emails a where a.email = new.email::extensions.citext and a.user_id <> new.id) then
    raise exception 'This email address is already linked to another TroyLabs account.' using errcode = 'unique_violation';
  end if;
  bootstrap := lower(new.email) in ('bryanram@usc.edu');
  is_usc := new.email ~* '@([a-z0-9-]+\.)*usc\.edu$';
  free := not public.email_taken(new.email, new.id);
  select * into r from public.roster where usc_email = new.email limit 1;
  insert into public.profiles (id, full_name, usc_email, personal_email, approved, status, grad_term, grad_year, join_term, join_year, divisions, phone, linkedin_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), r.full_name, ''),
    case when free and is_usc then new.email end,
    case when free and not is_usc then new.email end,
    (r.id is not null) or bootstrap,
    -- graduated if their class year's spring has ended (spring ends in June)
    case when r.grad_year is not null and (r.grad_year < extract(year from now()) or (r.grad_year = extract(year from now()) and extract(month from now()) >= 6)) then 'alum'::public.member_status else 'student'::public.member_status end,
    case when r.grad_year is not null then 'SP'::public.term end,
    r.grad_year,
    r.join_term, r.join_year,
    coalesce(r.divisions, '{}'),
    r.phone, r.linkedin_url
  );
  if bootstrap then insert into public.admins (user_id) values (new.id) on conflict do nothing; end if;
  return new;
end $$;
