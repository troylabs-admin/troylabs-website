// Exercises the proposed trigger in a rollback-only transaction: no accounts, queue jobs,
// migration changes, emails or external imports survive. Works before or after deployment.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sql } from './helpers.mjs';

const migration = readFileSync(new URL('../../supabase/migrations/20261006000100_roster_linkedin_import.sql', import.meta.url), 'utf8');
const result = sql(`begin;
${migration}
do $$
declare
  roster_id uuid := gen_random_uuid();
  pending_id uuid := gen_random_uuid();
  bare_id uuid := gen_random_uuid();
  roster_email text := 'tl-qa-' || roster_id || '@example.com';
begin
  insert into public.roster (usc_email, full_name, linkedin_url)
    values (roster_email, 'Roster import QA', 'linkedin.com/in/TL-QA-Roster/');
  insert into auth.users (id, email, raw_user_meta_data)
    values (roster_id, roster_email, '{}'::jsonb);
  if not exists (select 1 from public.profiles where id = roster_id and approved
      and linkedin_url = 'https://www.linkedin.com/in/tl-qa-roster') then
    raise exception 'Roster must create an approved profile with a normalized link';
  end if;
  if not exists (select 1 from public.linkedin_sync_queue where profile_id = roster_id and reason = 'approved') then
    raise exception 'Roster sign-up must queue its first import';
  end if;
  update public.profiles set approved = true where id = roster_id;
  if (select count(*) from public.linkedin_sync_queue where profile_id = roster_id) <> 1 then
    raise exception 'Repeated approval must not duplicate the import';
  end if;

  insert into auth.users (id, email, raw_user_meta_data)
    values (pending_id, 'tl-qa-' || pending_id || '@example.com', '{}'::jsonb);
  update public.profiles set linkedin_url = 'linkedin.com/in/tl-qa-pending' where id = pending_id;
  if exists (select 1 from public.linkedin_sync_queue where profile_id = pending_id) then
    raise exception 'Pending applications must not import before approval';
  end if;
  update public.profiles set approved = true where id = pending_id;
  if not exists (select 1 from public.linkedin_sync_queue where profile_id = pending_id and reason = 'approved') then
    raise exception 'Normal admin approval must still queue an import';
  end if;

  insert into public.roster (usc_email, full_name)
    values ('tl-qa-' || bare_id || '@example.com', 'No link QA');
  insert into auth.users (id, email, raw_user_meta_data)
    values (bare_id, 'tl-qa-' || bare_id || '@example.com', '{}'::jsonb);
  if exists (select 1 from public.linkedin_sync_queue where profile_id = bare_id) then
    raise exception 'No LinkedIn link must not create a useless import';
  end if;
  delete from public.linkedin_sync_queue where profile_id = roster_id;
  update public.profiles set approved = true where id = roster_id;
  if exists (select 1 from public.linkedin_sync_queue where profile_id = roster_id) then
    raise exception 'Already-approved profile must not queue again on unrelated saves';
  end if;
end $$;
select true as passed;
rollback;`);
assert.equal(result.rows?.[0]?.passed, true);
console.log('PASS: roster approval imports, admin approval regression, normalized links, pending/no-link exclusion, no duplicate imports; all rolled back');
