-- A failed replacement must not erase a member's existing leadership history.
create or replace function public.replace_eboard_roles(target_profile uuid, new_roles jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if new_roles is null or jsonb_typeof(new_roles) <> 'array' then raise exception 'Roles must be an array'; end if;
  perform 1 from public.profiles where id = target_profile for update;
  if not found then raise exception 'Member not found'; end if;
  if exists (
    select 1 from jsonb_to_recordset(new_roles) as r(role text, term public.term, year integer)
    where r.role is null or btrim(r.role) = '' or r.term is null or r.year is null or r.year not between 1900 and 2100
  ) then raise exception 'Every role needs a name, semester and year between 1900 and 2100'; end if;
  delete from public.eboard_roles where profile_id = target_profile;
  insert into public.eboard_roles(profile_id, role, term, year)
    select target_profile, btrim(r.role), r.term, r.year
    from jsonb_to_recordset(new_roles) as r(role text, term public.term, year integer);
end;
$$;
revoke all on function public.replace_eboard_roles(uuid, jsonb) from public, anon;
grant execute on function public.replace_eboard_roles(uuid, jsonb) to authenticated;
