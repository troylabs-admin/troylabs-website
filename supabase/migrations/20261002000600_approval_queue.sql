-- The approval queue at scale (Bryan, 2026-10-02: "what if there's a hundred approvals?").
-- 1. claimed_roles: the e-board roles a person says they held when they apply ([{role, term, year}]). They
--    write it themselves while waiting; it becomes their e-board record (eboard_roles, a credential only
--    admins write) when leadership approves them, so leadership still decides.
-- 2. approve_members / decline_members: one call for one person or a hundred, admins only, atomic.
alter table public.profiles add column if not exists claimed_roles jsonb not null default '[]'::jsonb
  check (jsonb_typeof(claimed_roles) = 'array' and jsonb_array_length(claimed_roles) <= 30);

create or replace function public.approve_members(ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  update public.profiles set approved = true, declined_at = null where id = any(ids) and not approved;
  get diagnostics n = row_count;
  insert into public.eboard_roles (profile_id, role, term, year)
    select p.id, left(c->>'role', 60), (c->>'term')::public.term, (c->>'year')::smallint
    from public.profiles p cross join lateral jsonb_array_elements(p.claimed_roles) c
    where p.id = any(ids) and coalesce(c->>'role', '') <> '' and c->>'term' in ('FA', 'SP')
      and (c->>'year') ~ '^\d{4}$' and (c->>'year')::int between 1990 and 2100
  on conflict do nothing;
  return n;
end $$;

create or replace function public.decline_members(ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  update public.profiles set approved = false, declined_at = now() where id = any(ids) and declined_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.approve_members(uuid[]), public.decline_members(uuid[]) from public, anon;
grant execute on function public.approve_members(uuid[]), public.decline_members(uuid[]) to authenticated;

-- 3. a declined person could clear their own declined_at and put themselves back in the queue; only admins can now
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid()
    and approved = (select p.approved from public.profiles p where p.id = auth.uid())
    and declined_at is not distinct from (select p.declined_at from public.profiles p where p.id = auth.uid()));
