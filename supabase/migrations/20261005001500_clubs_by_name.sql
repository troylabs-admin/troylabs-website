-- Clubs by name too (2026-10-05): someone's LinkedIn can point "TroyLabs" or "LavaLab" at another LinkedIn page (an old
-- or duplicate one, so another company id). New company rows with a known club name start as clubs.
create or replace function public.mark_known_clubs() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.name ~* '^\s*(troy ?labs|lava ?lab|quant ?sc)\s*$' then new.is_club := true; end if;
  return new;
end $$;
drop trigger if exists companies_known_clubs on public.companies;
create trigger companies_known_clubs before insert on public.companies for each row execute function public.mark_known_clubs();
update public.companies set is_club = true where name ~* '^\s*(troy ?labs|lava ?lab|quant ?sc)\s*$';
