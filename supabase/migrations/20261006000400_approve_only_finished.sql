-- Only a finished application can be approved (2026-10-06, Bryan: "it won't be possible where they won't have
-- nothing, correct?"). The Members page only ever offered APPROVE for submitted applications, but approve_members
-- (and the admin update policy) would approve anyone by id. Now the database refuses it, for every path an admin
-- has: the RPC skips people who never pressed SUBMIT, and a trigger refuses any other approval of an unsubmitted
-- profile. Not affected: the service role and the database itself (auth.uid() is null: one-off admin setup, tests),
-- and roster sign-ups approved inside handle_new_user's INSERT.

create or replace function public.approve_members(ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  update public.profiles set approved = true, declined_at = null
    where id = any(ids) and not approved and submitted_at is not null;
  get diagnostics n = row_count;
  insert into public.eboard_roles (profile_id, role, term, year)
    select p.id, left(c->>'role', 60), (c->>'term')::public.term, (c->>'year')::smallint
    from public.profiles p cross join lateral jsonb_array_elements(p.claimed_roles) c
    where p.id = any(ids) and p.approved and coalesce(c->>'role', '') <> '' and c->>'term' in ('FA', 'SP')
      and (c->>'year') ~ '^\d{4}$' and (c->>'year')::int between 1990 and 2100
  on conflict do nothing;
  return n;
end $$;

create or replace function public.profiles_approve_finished_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.approved and not old.approved and new.submitted_at is null and auth.uid() is not null then
    raise exception 'This person hasn’t submitted their profile yet, so they can’t be approved.' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists profiles_approve_finished_only on public.profiles;
create trigger profiles_approve_finished_only before update of approved on public.profiles
  for each row execute function public.profiles_approve_finished_only();
revoke all on function public.profiles_approve_finished_only() from public, anon, authenticated;
