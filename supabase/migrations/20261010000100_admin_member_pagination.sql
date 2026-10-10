-- Admin Members: filter/count/page on the server, without downloading embeddings or the whole roster.
-- Invoker rights preserve every existing profile/role RLS policy (including hidden test accounts).
begin;
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
    select p.id, p.full_name, p.approved, p.declined_at, p.status, p.grad_term, p.grad_year,
      p.join_term, p.join_year, p.divisions, p.current_title, p.current_company,
      p.linkedin_url, p.industries, p.startups, p.city_id,
      p.usc_email, p.personal_email, p.phone, p.phone_opt_in, p.email_opt_in,
      p.avatar_path, p.created_at, p.updated_at, p.submitted_at, p.approved_at, p.last_seen_at,
      case when c.id is null then null else jsonb_build_object('id',c.id,'name',c.name,'region',c.region,'country',c.country,'lat',c.lat,'lng',c.lng) end as city,
      exists(select 1 from public.admins a where a.user_id = p.id) as is_admin,
      case when p.join_term is not null and p.join_year is not null then p.join_term::text || right(p.join_year::text, 2) else '' end as cohort,
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
      and (cardinality(statuses) = 0 or lower(v.status::text) = any(statuses))
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
    'rows', coalesce((select jsonb_agg(to_jsonb(r) - 'search_text' - 'cohort' order by r.is_admin desc, lower(r.full_name), r.id) from rows_with_roles r), '[]'::jsonb),
    'total', b.total, 'page', b.page, 'page_size', page_size,
    'cohorts', coalesce((select jsonb_agg(c.cohort order by c.year desc, c.season desc) from all_cohorts c), '[]'::jsonb)
  ) into result from bounds b;
  return result;
end $$;
revoke all on function public.admin_member_page(text,text[],text[],text[],integer,integer) from public, anon;
grant execute on function public.admin_member_page(text,text[],text[],text[],integer,integer) to authenticated;
commit;
