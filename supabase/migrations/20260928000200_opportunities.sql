-- Member opportunities are separate from leadership's broadcast messages.
-- Only additive profile changes; existing approval and roster flows remain intact.
begin;
alter table public.profiles
  add column work_roles text[] not null default '{}'
    check (work_roles <@ array['Founder', 'Startup team', 'Industry', 'Exploring']::text[]),
  add column venture_name text check (char_length(venture_name) <= 100),
  add column venture_bio text check (char_length(venture_bio) <= 1000),
  add column venture_url text check (char_length(venture_url) <= 500 and venture_url ~ '^https?://[^[:space:]]+'),
  add column venture_sectors text[] not null default '{}'
    check (venture_sectors <@ array['AI', 'Fintech', 'Healthtech', 'Climate', 'Consumer', 'Enterprise', 'Edtech', 'Robotics', 'Other']::text[]),
  add column venture_stage text check (venture_stage in ('Idea', 'Building', 'Launched', 'Growing')),
  add column recruiting boolean not null default false;

create table public.network_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('Hiring', 'Co-founder', 'Collaboration', 'Ask the network')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  company text not null default '' check (char_length(company) <= 100),
  sector text not null default '' check (sector in ('', 'AI', 'Fintech', 'Healthtech', 'Climate', 'Consumer', 'Enterprise', 'Edtech', 'Robotics', 'Other')),
  location text not null default '' check (char_length(location) <= 100),
  commitment text not null default '' check (commitment in ('', 'Full-time', 'Part-time', 'Internship', 'Project', 'Flexible')),
  compensation text not null default '' check (char_length(compensation) <= 160),
  link text not null default '' check (char_length(link) <= 500 and (link = '' or link ~ '^https?://[^[:space:]]+')),
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index network_posts_feed_idx on public.network_posts(created_at desc, id desc);
create index network_posts_author_idx on public.network_posts(author_id);
create table public.network_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.network_posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index network_replies_post_idx on public.network_replies(post_id, created_at, id);
create index network_replies_author_idx on public.network_replies(author_id);
create trigger network_posts_touch before update on public.network_posts for each row execute function public.touch_updated_at();
create trigger network_replies_touch before update on public.network_replies for each row execute function public.touch_updated_at();

-- Lock the parent before replying: closing and replying cannot race through separate RLS snapshots.
create function public.network_reply_open() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.network_posts where id = new.post_id and not closed for update;
  if not found then raise exception 'This opportunity is closed or no longer available.'; end if;
  return new;
end $$;
revoke all on function public.network_reply_open() from public, anon, authenticated;
create trigger network_reply_open before insert on public.network_replies for each row execute function public.network_reply_open();

alter table public.network_posts enable row level security;
alter table public.network_replies enable row level security;
grant select, delete on public.network_posts, public.network_replies to authenticated;
-- Identity, ownership, parent IDs, and timestamps cannot be rewritten by browser clients.
grant insert (kind, title, body, company, sector, location, commitment, compensation, link) on public.network_posts to authenticated;
grant update (kind, title, body, company, sector, location, commitment, compensation, link, closed) on public.network_posts to authenticated;
grant insert (post_id, body) on public.network_replies to authenticated;
grant update (body) on public.network_replies to authenticated;

create policy posts_read on public.network_posts for select to authenticated using (
  public.is_member() and exists (select 1 from public.profiles p where p.id = author_id and p.approved)
  or public.is_admin()
);
create policy posts_add on public.network_posts for insert to authenticated with check (public.is_member() and author_id = auth.uid());
create policy posts_edit on public.network_posts for update to authenticated using (public.is_member() and author_id = auth.uid()) with check (public.is_member() and author_id = auth.uid());
create policy posts_remove on public.network_posts for delete to authenticated using ((public.is_member() and author_id = auth.uid()) or public.is_admin());
create policy replies_read on public.network_replies for select to authenticated using (
  exists (select 1 from public.network_posts p where p.id = post_id)
  and (public.is_admin() or (public.is_member() and exists (select 1 from public.profiles a where a.id = author_id and a.approved)))
);
create policy replies_add on public.network_replies for insert to authenticated with check (
  public.is_member() and author_id = auth.uid() and exists (select 1 from public.network_posts p where p.id = post_id and not p.closed)
);
create policy replies_edit on public.network_replies for update to authenticated using (
  public.is_member() and author_id = auth.uid() and exists (select 1 from public.network_posts p where p.id = post_id and not p.closed)
) with check (public.is_member() and author_id = auth.uid() and exists (select 1 from public.network_posts p where p.id = post_id and not p.closed));
create policy replies_remove on public.network_replies for delete to authenticated using ((public.is_member() and author_id = auth.uid()) or public.is_admin());
commit;
