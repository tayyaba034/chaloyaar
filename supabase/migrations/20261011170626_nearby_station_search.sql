begin;

alter table public.stations add column verified_at timestamptz;

-- Import/update time is not evidence of a human verification.
create or replace view public.station_public with (security_invoker = true) as
select id, name, brand, address,
  extensions.st_y(location::extensions.geometry) as latitude,
  extensions.st_x(location::extensions.geometry) as longitude,
  supported_fuels, verification_status, is_demo, source, source_url, updated_at, verified_at
from public.stations;

create function public.nearby_stations(
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
    and (requested_fuel is null or requested_fuel = any(s.supported_fuels))
  order by extensions.st_distance(s.location, origin), s.id
  limit 50;
end;
$$;
revoke all on function public.nearby_stations(double precision, double precision, double precision, text) from public;
grant execute on function public.nearby_stations(double precision, double precision, double precision, text) to anon, authenticated;

create index availability_reports_station_fuel_latest_idx on public.availability_reports (station_id, fuel_type, reported_at desc)
where moderation_status = 'approved' and not is_demo;

-- Only public facts are returned; no reporter identity or search location is stored.
create function public.station_latest_reports(station_ids uuid[], requested_fuel text)
returns table (station_id uuid, reported_status text, source_type text, reported_at timestamptz, expires_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if station_ids is null or cardinality(station_ids) > 50 or requested_fuel is null
    or requested_fuel not in ('petrol', 'diesel', 'cng') then
    raise exception 'Invalid report lookup' using errcode = '22023';
  end if;
  return query
  select distinct on (r.station_id) r.station_id, r.reported_status, r.source_type, r.reported_at, r.expires_at
  from public.availability_reports r
  join public.stations s on s.id = r.station_id
  where r.station_id = any(station_ids) and r.fuel_type = requested_fuel
    and r.moderation_status = 'approved' and not r.is_demo and not s.is_demo
    and s.verification_status <> 'rejected' and r.reported_at <= now()
  order by r.station_id, r.reported_at desc, r.id desc;
end;
$$;
revoke all on function public.station_latest_reports(uuid[], text) from public;
grant execute on function public.station_latest_reports(uuid[], text) to anon, authenticated;

create function public.admin_update_station_details(
  target_station_id uuid, target_name text, target_brand text, target_address text,
  target_supported_fuels text[], target_verification_status text,
  target_latitude double precision, target_longitude double precision,
  target_source text, target_source_url text, details_checked boolean
)
returns public.stations language plpgsql security definer set search_path = '' as $$
declare updated_station public.stations;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin role is required'; end if;
  if target_latitude is null or target_latitude not between -90 and 90
    or target_longitude is null or target_longitude not between -180 and 180
    or target_source is null or length(trim(target_source)) not between 1 and 200
    or length(coalesce(target_source_url, '')) > 2000
    or (coalesce(target_source_url, '') <> '' and target_source_url !~ '^https?://')
    or target_verification_status is null
    or exists(select 1 from unnest(target_supported_fuels) fuel where fuel is null)
    or (target_verification_status = 'verified' and details_checked is distinct from true) then
    raise exception 'Check the pin, source and details before verifying';
  end if;
  perform public.admin_update_station(target_station_id, target_name, target_brand, target_address, target_supported_fuels, target_verification_status);
  update public.stations set
    location = extensions.st_setsrid(extensions.st_makepoint(target_longitude, target_latitude), 4326)::extensions.geography,
    source = trim(target_source), source_url = nullif(trim(target_source_url), ''),
    verified_at = case when target_verification_status = 'verified' then now() else null end
  where id = target_station_id returning * into updated_station;
  insert into public.admin_audit_log(actor_id, action, entity_type, entity_id, details)
    values(auth.uid(), 'review_station_details', 'station', target_station_id::text,
      jsonb_build_object('latitude', target_latitude, 'longitude', target_longitude,
        'source', target_source, 'source_url', target_source_url,
        'details_checked', details_checked, 'verified_at', updated_station.verified_at));
  return updated_station;
end;
$$;
revoke execute on function public.admin_update_station(uuid, text, text, text, text[], text) from public, anon, authenticated;
revoke all on function public.admin_update_station_details(uuid, text, text, text, text[], text, double precision, double precision, text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_update_station_details(uuid, text, text, text, text[], text, double precision, double precision, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
