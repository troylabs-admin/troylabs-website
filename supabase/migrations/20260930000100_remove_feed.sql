-- The posts feature comes out for now (Bryan, 2026-09-30: "get rid of the post feature… something
-- simple"). Its tables and the startup-profile columns that came with it were empty when removed
-- (0 posts, 0 replies, 0 profiles with startup fields), so nothing is lost.
begin;
drop table if exists public.network_replies;
drop table if exists public.network_posts;
drop function if exists public.network_reply_open();
alter table public.profiles
  drop column if exists work_roles,
  drop column if exists venture_name,
  drop column if exists venture_bio,
  drop column if exists venture_url,
  drop column if exists venture_sectors,
  drop column if exists venture_stage,
  drop column if exists recruiting;
commit;
