-- AI search scores a person by their best-matching piece (2026-10-05). One embedding per profile averaged everything
-- together: after a LinkedIn sync added 14 jobs, skills and honors, "someone who interned at Jane Street" ranked a
-- member with no LinkedIn data above the one who interned there (measured). Standard fix for long documents: embed
-- pieces (core facts, each job, honors, publications, …) and take the best piece per person.

create table if not exists public.profile_chunks (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  piece smallint not null,                         -- 0 = the core facts
  embedding extensions.vector(1536) not null
);
create index if not exists profile_chunks_profile on public.profile_chunks (profile_id);
create index if not exists profile_chunks_hnsw on public.profile_chunks using hnsw (embedding extensions.vector_cosine_ops);
alter table public.profile_chunks enable row level security;
grant select on public.profile_chunks to authenticated;
-- readable like the profile (match_profiles runs as the caller, so this decides whose pieces can match)
drop policy if exists profile_chunks_read on public.profile_chunks;
create policy profile_chunks_read on public.profile_chunks for select to authenticated
  using (profile_id = auth.uid() or public.is_admin() or (public.is_member() and exists (select 1 from public.profiles p where p.id = profile_id and p.approved)));

-- the nearest pieces through the index, then each person's best one
create or replace function public.match_profiles(query_embedding extensions.vector(1536), match_count integer default 40)
returns table (id uuid, similarity double precision)
language sql stable security invoker set search_path = public, extensions as $$
  with near as (
    select c.profile_id, 1 - (c.embedding <=> query_embedding) as sim
    from public.profile_chunks c
    order by c.embedding <=> query_embedding
    limit 500
  )
  select n.profile_id, max(n.sim)
  from near n join public.profiles p on p.id = n.profile_id and p.approved
  group by n.profile_id
  order by 2 desc
  limit least(greatest(match_count, 1), 100);
$$;
revoke all on function public.match_profiles(extensions.vector, integer) from public, anon;
grant execute on function public.match_profiles(extensions.vector, integer) to authenticated;
