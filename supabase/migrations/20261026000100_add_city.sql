-- A city nobody has picked yet (San Francisco, 2026-10-26) couldn't be added from the profile's LOCATION box: the live
-- project refused the page's direct write to cities ("permission denied for table cities"), so only cities already in
-- the list (Los Angeles, New York) worked. New cities now go through add_city(), which doesn't depend on members being
-- able to write the table, checks what it stores, and hands back the existing row when the city is already there.
-- Members keep reading cities as before; writing the table directly is no longer allowed (nothing on the site does it).

create or replace function public.add_city(new_name text, new_region text, new_country text, new_lat double precision, new_lng double precision)
returns public.cities language plpgsql security definer set search_path = public as $$
declare c public.cities;
begin
  if auth.uid() is null then raise exception 'sign in to add a city' using errcode = '42501'; end if;
  new_name := btrim(coalesce(new_name, '')); new_region := upper(btrim(coalesce(new_region, ''))); new_country := upper(btrim(coalesce(new_country, '')));
  if new_name = '' or length(new_name) > 100 or length(new_region) > 10 or new_country !~ '^([A-Z]{2})?$'
     or new_lat is null or new_lng is null or new_lat not between -90 and 90 or new_lng not between -180 and 180 then
    raise exception 'that isn''t a city we can place' using errcode = '22023';
  end if;
  insert into public.cities (name, region, country, lat, lng) values (new_name, new_region, new_country, new_lat, new_lng)
    on conflict (name, region, country) do nothing returning * into c;
  if c.id is null then select * into c from public.cities where name = new_name and region = new_region and country = new_country; end if;
  return c;
end $$;
revoke all on function public.add_city(text, text, text, double precision, double precision) from public, anon;
grant execute on function public.add_city(text, text, text, double precision, double precision) to authenticated;

revoke insert, update, delete, truncate on public.cities from authenticated;
drop policy if exists cities_add on public.cities;
grant select on public.cities to authenticated;

-- the starting list again, for a project that is missing any of it (the live one had no San Francisco); a no-op elsewhere
insert into public.cities (name, region, country, lat, lng) values
  ('Los Angeles', 'CA', 'US', 34.0522, -118.2437), ('San Francisco', 'CA', 'US', 37.7749, -122.4194), ('Palo Alto', 'CA', 'US', 37.4419, -122.1430),
  ('San Jose', 'CA', 'US', 37.3382, -121.8863), ('Oakland', 'CA', 'US', 37.8044, -122.2712), ('Irvine', 'CA', 'US', 33.6846, -117.8265),
  ('San Diego', 'CA', 'US', 32.7157, -117.1611), ('New York', 'NY', 'US', 40.7128, -74.0060), ('Boston', 'MA', 'US', 42.3601, -71.0589),
  ('Philadelphia', 'PA', 'US', 39.9526, -75.1652), ('Washington', 'DC', 'US', 38.9072, -77.0369), ('Chicago', 'IL', 'US', 41.8781, -87.6298),
  ('Seattle', 'WA', 'US', 47.6062, -122.3321), ('Austin', 'TX', 'US', 30.2672, -97.7431), ('Miami', 'FL', 'US', 25.7617, -80.1918),
  ('Toronto', 'ON', 'CA', 43.6532, -79.3832), ('London', '', 'GB', 51.5074, -0.1278), ('Singapore', '', 'SG', 1.3521, 103.8198),
  ('Tokyo', '', 'JP', 35.6762, 139.6503), ('Mexico City', '', 'MX', 19.4326, -99.1332), ('Denver', 'CO', 'US', 39.7392, -104.9903),
  ('Dallas', 'TX', 'US', 32.7767, -96.7970), ('Houston', 'TX', 'US', 29.7604, -95.3698), ('Atlanta', 'GA', 'US', 33.7490, -84.3880),
  ('Portland', 'OR', 'US', 45.5152, -122.6784), ('Phoenix', 'AZ', 'US', 33.4484, -112.0740), ('Las Vegas', 'NV', 'US', 36.1699, -115.1398),
  ('Sacramento', 'CA', 'US', 38.5816, -121.4944), ('Santa Monica', 'CA', 'US', 34.0195, -118.4912), ('Pasadena', 'CA', 'US', 34.1478, -118.1445)
on conflict do nothing;
