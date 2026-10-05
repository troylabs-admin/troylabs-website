-- AI search (2026-10-05): every approved profile gets an OpenAI embedding (text-embedding-3-small, 1536 numbers that
-- capture what the profile is about); a search is embedded the same way and the closest profiles come back.
-- Only work facts are embedded — title, company, city, divisions, industries, startups, bio, status — never names,
-- emails or phone numbers. The embedding is refreshed by the database itself whenever those facts change or someone
-- is approved (pg_net → the `semantic` function), so no page can forget to.

alter table public.profiles add column if not exists embedding_hash text;   -- fingerprint (SHA-256) of the text last embedded: unchanged text is never re-sent

create index if not exists profiles_embedding_hnsw on public.profiles using hnsw (embedding extensions.vector_cosine_ops);

-- the closest approved profiles to a search. SECURITY INVOKER: it runs as the caller, so row-level security decides
-- what can come back (approved members see approved members; anyone else sees only themselves)
create or replace function public.match_profiles(query_embedding extensions.vector(1536), match_count integer default 40)
returns table (id uuid, similarity double precision)
language sql stable security invoker set search_path = public, extensions as $$
  select p.id, 1 - (p.embedding <=> query_embedding) as similarity
  from public.profiles p
  where p.approved and p.embedding is not null
  order by p.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 100);
$$;
revoke all on function public.match_profiles(extensions.vector, integer) from public, anon;
grant execute on function public.match_profiles(extensions.vector, integer) to authenticated;

-- keep embeddings current: when an approved profile's facts change, or someone is approved, ask the function to embed it
create or replace function public.queue_profile_embedding() returns trigger
language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  if not new.approved then return new; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'send_message_cron_secret';
  if secret is null then return new; end if;
  perform net.http_post(
    url := 'https://ackmhqxyxnceoarbhcrp.supabase.co/functions/v1/semantic',
    body := jsonb_build_object('mode', 'embed', 'ids', jsonb_build_array(new.id)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    timeout_milliseconds := 20000);
  return new;
end $$;

drop trigger if exists profiles_queue_embedding on public.profiles;
create trigger profiles_queue_embedding
  after insert or update of approved, status, grad_year, join_term, join_year, divisions, current_title, current_company, city_id, industries, startups, bio
  on public.profiles for each row execute function public.queue_profile_embedding();
