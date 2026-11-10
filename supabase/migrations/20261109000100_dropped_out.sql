-- Dropped out (Charlotte and Bryan, 2026-11-09): some members left USC before graduating, many to build their startups.
-- They are alumni in every sense the system uses (no longer at USC: alumni messages, the globe's count, analytics, and the
-- nightly graduate_students() job, which only touches students), plus one fact: they left before graduating. For them
-- grad_term + grad_year hold the LAST SEMESTER they were at USC. Pages and edge functions read the pair through
-- supabase/functions/_shared/standing.ts.
begin;

alter table public.profiles add column if not exists dropped_out boolean not null default false;
comment on column public.profiles.dropped_out is 'Left USC before graduating; grad_term/grad_year are then their last semester at USC. Only with status alum.';
-- a current student hasn't dropped out: refuse the mix instead of letting a page store it
alter table public.profiles drop constraint if exists profiles_dropped_out_is_alum;
alter table public.profiles add constraint profiles_dropped_out_is_alum check (not dropped_out or status = 'alum');

-- an admin changing it is recorded like every other field they change (same function as 20261006000600, plus dropped_out)
create or replace function public.profiles_admin_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid(); changed text[];
begin
  if who is null or who = new.id or not public.is_admin() then return new; end if;
  select array_agg(n.key order by n.key) into changed
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value
      and n.key in ('full_name', 'status', 'dropped_out', 'grad_term', 'grad_year', 'join_term', 'join_year', 'divisions', 'linkedin_url',
                    'bio', 'industries', 'startups', 'city_id', 'phone', 'avatar_path', 'usc_email', 'personal_email',
                    'email_opt_in', 'phone_opt_in');
  if changed is not null then
    insert into public.profile_events (profile_id, event, actor, detail) values (new.id, 'admin_edit', who, jsonb_build_object('fields', changed));
  end if;
  return new;
end $$;
revoke all on function public.profiles_admin_edit() from public, anon, authenticated;

-- Admin › Members: STATUS filters on the three standings, each on its own (Bryan, 2026-11-09, option A): 'alum' is
-- graduates only, 'dropped out' is dropouts only. Same function as 20261010000100 otherwise; rows now carry dropped_out.
create or replace function public.admin_member_page(
  p_search text default '',
  p_statuses text[] default '{}',
  p_cohorts text[] default '{}',
  p_divisions text[] default '{}',
  p_page integer default 1,
  p_page_size integer default 25
) returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare result jsonb;
  needle text := lower(btrim(coalesce(p_search, '')));
  requested_page integer := greatest(1, coalesce(p_page, 1));
  page_size integer := least(100, greatest(1, coalesce(p_page_size, 25)));
  statuses text[] := array(select lower(btrim(s)) from unnest(coalesce(p_statuses, '{}'::text[])) s);
  cohorts text[] := array(select upper(btrim(c)) from unnest(coalesce(p_cohorts, '{}'::text[])) c);
  selected_divisions text[] := array(select case when upper(btrim(d)) = 'PRODUCT' then 'PRODUCT MANAGEMENT' else upper(btrim(d)) end from unnest(coalesce(p_divisions, '{}'::text[])) d);
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  with visible as materialized (
    select p.id, p.full_name, p.approved, p.declined_at, p.status, p.dropped_out, p.grad_term, p.grad_year,
      p.join_term, p.join_year, p.divisions, p.current_title, p.current_company,
      p.linkedin_url, p.industries, p.startups, p.city_id,
      p.usc_email, p.personal_email, p.phone, p.phone_opt_in, p.email_opt_in,
      p.avatar_path, p.created_at, p.updated_at, p.submitted_at, p.approved_at, p.last_seen_at,
      case when c.id is null then null else jsonb_build_object('id',c.id,'name',c.name,'region',c.region,'country',c.country,'lat',c.lat,'lng',c.lng) end as city,
      exists(select 1 from public.admins a where a.user_id = p.id) as is_admin,
      case when p.join_term is not null and p.join_year is not null then p.join_term::text || right(p.join_year::text, 2) else '' end as cohort,
      case when p.status = 'student' then 'student' when p.dropped_out then 'dropped out' else 'alum' end as standing,
      lower(concat_ws(' ', p.full_name, p.usc_email::text, p.personal_email::text, p.current_company,
        c.name, c.region, c.country,
        concat(c.name, case when coalesce(c.region, '') <> '' then ', ' || c.region else '' end,
          case when coalesce(c.country, '') not in ('', 'US') then ' ' || c.country else '' end),
        array_to_string(p.divisions, ' '), replace(array_to_string(p.divisions, ', '), 'PRODUCT MANAGEMENT', 'PRODUCT'))) as search_text
    from public.profiles p left join public.cities c on c.id = p.city_id
    where p.approved
  ), filtered as materialized (
    select * from visible v where
      (needle = '' or strpos(v.search_text, needle) > 0)
      and (cardinality(statuses) = 0 or v.standing = any(statuses))
      and (cardinality(cohorts) = 0 or v.cohort = any(cohorts))
      and (cardinality(selected_divisions) = 0 or v.divisions && selected_divisions)
  ), bounds as (
    select count(*) as total,
      least(requested_page::bigint, greatest(1, (count(*) + page_size - 1) / page_size)) as page
    from filtered
  ), paged as (
    select f.* from filtered f
    order by f.is_admin desc, lower(f.full_name), f.id
    limit page_size offset (select (b.page - 1) * page_size from bounds b)
  ), rows_with_roles as (
    select p.*, coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'profile_id',r.profile_id,'role',r.role,'term',r.term,'year',r.year)
      order by r.year desc, r.term, r.role, r.id) from public.eboard_roles r where r.profile_id = p.id), '[]'::jsonb) as roles
    from paged p
  ), all_cohorts as (
    select v.cohort, max(v.join_year) as year, max(case when v.join_term::text = 'FA' then 1 else 0 end) as season
    from visible v where v.cohort <> '' group by v.cohort
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(r) - 'search_text' - 'cohort' - 'standing' order by r.is_admin desc, lower(r.full_name), r.id) from rows_with_roles r), '[]'::jsonb),
    'total', b.total, 'page', b.page, 'page_size', page_size,
    'cohorts', coalesce((select jsonb_agg(c.cohort order by c.year desc, c.season desc) from all_cohorts c), '[]'::jsonb)
  ) into result from bounds b;
  return result;
end $$;
revoke all on function public.admin_member_page(text,text[],text[],text[],integer,integer) from public, anon;
grant execute on function public.admin_member_page(text,text[],text[],text[],integer,integer) to authenticated;

commit;
