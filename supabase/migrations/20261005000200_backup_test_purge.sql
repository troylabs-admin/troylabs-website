-- The backup table is append-only. The one exception: rows written by the automated tests' throwaway accounts
-- (tl-qa-…@example.com), so test runs don't pile fake applicants into the real backup. Only the service role can call
-- this, and the trigger lets a delete through only for those addresses, only inside this function.
create or replace function public.profile_submissions_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('tl.purge_test_backups', true) = 'on' and old.email like 'tl-qa-%@example.com' then return old; end if;
  raise exception 'profile_submissions is an append-only backup: rows cannot be changed or deleted' using errcode = '42501';
end $$;

create or replace function public.purge_test_backups() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform set_config('tl.purge_test_backups', 'on', true);
  delete from public.profile_submissions where email like 'tl-qa-%@example.com';
  get diagnostics n = row_count;
  perform set_config('tl.purge_test_backups', 'off', true);
  return n;
end $$;
revoke all on function public.purge_test_backups() from public, anon, authenticated;
grant execute on function public.purge_test_backups() to service_role;
