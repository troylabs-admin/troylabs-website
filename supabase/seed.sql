-- Local and CI test stacks only (`supabase db start` / `db reset` load this; production never runs it).
-- Two made-up REAL-world accounts (not tl-qa test accounts), so the SQL tests have a real admin and a real member to
-- look through. Fixed ids and example.com addresses; nobody here exists.
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-a000-000000000001', 'seed-admin@example.com', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-a000-000000000002', 'seed-member@example.com', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000')
on conflict (id) do nothing;
update public.profiles set full_name = 'Seed Admin', approved = true, submitted_at = now() where id = '00000000-0000-4000-a000-000000000001';
update public.profiles set full_name = 'Seed Member', approved = true, submitted_at = now() where id = '00000000-0000-4000-a000-000000000002';
insert into public.admins (user_id) values ('00000000-0000-4000-a000-000000000001') on conflict do nothing;
