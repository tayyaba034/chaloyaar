-- REVIEW ONLY: apply to isolated staging after reviewing the earlier migration.
begin;

create or replace function public.nearby_stations(
  search_latitude double precision, search_longitude double precision,
  radius_km double precision default 15, requested_fuel text default null
)
returns table (
  id uuid, name text, brand text, address text, latitude double precision,
  longitude double precision, supported_fuels text[], verification_status text,
  is_demo boolean, source text, source_url text, updated_at timestamptz,
  verified_at timestamptz, distance_km double precision
)
language plpgsql stable security invoker set search_path = '' as $$
declare origin extensions.geography;
begin
  if search_latitude is null or search_latitude not between -90 and 90
    or search_longitude is null or search_longitude not between -180 and 180
    or radius_km is null or radius_km not between 1 and 30
    or (requested_fuel is not null and requested_fuel not in ('petrol', 'diesel', 'cng')) then
    raise exception 'Invalid station search' using errcode = '22023';
  end if;
  origin := extensions.st_setsrid(extensions.st_makepoint(search_longitude, search_latitude), 4326)::extensions.geography;
  return query
  select s.id, s.name, s.brand, s.address,
    extensions.st_y(s.location::extensions.geometry), extensions.st_x(s.location::extensions.geometry),
    s.supported_fuels, s.verification_status, s.is_demo, s.source, s.source_url,
    s.updated_at, s.verified_at, extensions.st_distance(s.location, origin) / 1000
  from public.stations s
  where not s.is_demo and s.verification_status <> 'rejected'
    and extensions.st_dwithin(s.location, origin, radius_km * 1000)
    and (requested_fuel is null or (s.verification_status = 'verified' and s.verified_at <= now()
      and requested_fuel = any(s.supported_fuels)))
  order by extensions.st_distance(s.location, origin), s.id
  limit 50;
end;
$$;
revoke all on function public.nearby_stations(double precision, double precision, double precision, text) from public;
grant execute on function public.nearby_stations(double precision, double precision, double precision, text) to anon, authenticated;


notify pgrst, 'reload schema';
commit;
