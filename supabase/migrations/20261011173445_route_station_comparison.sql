begin;
alter table public.fuel_prices
  add column expires_at timestamptz,
  add column verified_at timestamptz,
  add column station_id uuid references public.stations(id) on delete cascade,
  add constraint fuel_price_validity check (expires_at is null or expires_at > effective_at);
-- Old prices stay unusable for TrueCost until deliberately reviewed with an expiry.
create function public.route_stations(route_geometry jsonb, requested_fuel text)
returns table (id uuid, name text, brand text, address text, latitude double precision,
  longitude double precision, supported_fuels text[], verification_status text, is_demo boolean,
  source text, source_url text, updated_at timestamptz, verified_at timestamptz,
  corridor_distance_km double precision, price jsonb)
language plpgsql stable security invoker set search_path = '' as $$
declare line extensions.geometry; corridor extensions.geography;
begin
  if auth.uid() is null or requested_fuel is null or requested_fuel not in ('petrol','diesel')
    or route_geometry->>'type' is distinct from 'LineString'
    or jsonb_typeof(route_geometry->'coordinates') is distinct from 'array'
    or jsonb_array_length(route_geometry->'coordinates') not between 2 and 20000 then
    raise exception 'Invalid route corridor' using errcode = '22023';
  end if;
  line := extensions.st_setsrid(extensions.st_geomfromgeojson(route_geometry),4326);
  if not extensions.st_isvalid(line) or extensions.st_xmin(line) < -180 or extensions.st_xmax(line) > 180
    or extensions.st_ymin(line) < -90 or extensions.st_ymax(line) > 90 then
    raise exception 'Invalid route coordinates' using errcode = '22023';
  end if;
  corridor := line::extensions.geography;
  if extensions.st_length(corridor) > 150000 then raise exception 'Pilot route is too long' using errcode = '22023'; end if;
  return query
  select s.id,s.name,s.brand,s.address,extensions.st_y(s.location::extensions.geometry),extensions.st_x(s.location::extensions.geometry),
    s.supported_fuels,s.verification_status,s.is_demo,s.source,s.source_url,s.updated_at,s.verified_at,
    extensions.st_distance(s.location,corridor)/1000,
    case when p.id is null then null else jsonb_build_object('amount',p.price_per_litre,'source',p.source_name,
      'sourceUrl',p.source_url,'effectiveAt',p.effective_at,'expiresAt',p.expires_at,'verifiedAt',p.verified_at,
      'stationId',p.station_id,'isDemo',p.is_demo) end
  from public.stations s
  left join lateral (
    select fp.* from public.fuel_prices fp where fp.fuel_type=requested_fuel
      and (fp.station_id=s.id or fp.station_id is null) and not fp.is_demo
      and fp.verified_at <= now() and fp.effective_at <= now() and fp.expires_at > now()
      and length(trim(fp.source_name)) > 0
    order by (fp.station_id is not null) desc,fp.effective_at desc,fp.entered_at desc,fp.id limit 1
  ) p on true
  where not s.is_demo and s.verification_status <> 'rejected' and requested_fuel=any(s.supported_fuels)
    and extensions.st_dwithin(s.location,corridor,2000)
  order by extensions.st_distance(s.location,corridor),s.id limit 6;
end;
$$;
revoke all on function public.route_stations(jsonb,text) from public,anon,authenticated;
grant execute on function public.route_stations(jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
