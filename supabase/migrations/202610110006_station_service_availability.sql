create table if not exists public.station_service_availability (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  service_type text not null
    check (service_type in ('petrol', 'diesel', 'cng', 'tyre_repair', 'battery_help', 'towing', 'portable_diesel_delivery')),
  status text not null check (status in ('available', 'unavailable')),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (station_id, service_type)
);

create index if not exists station_service_availability_station_idx
  on public.station_service_availability (station_id, service_type);

alter table public.station_service_availability enable row level security;

revoke all on public.station_service_availability from anon, authenticated;
grant select on public.station_service_availability to anon, authenticated;
grant insert, update, delete on public.station_service_availability to authenticated;

drop policy if exists "Read station service availability" on public.station_service_availability;
create policy "Read station service availability"
  on public.station_service_availability for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins manage station service availability" on public.station_service_availability;
create policy "Admins manage station service availability"
  on public.station_service_availability for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin() and updated_by = auth.uid());

create table if not exists public.service_prices (
  id uuid primary key default gen_random_uuid(),
  service_type text not null unique
    check (service_type in ('tyre_repair', 'battery_help', 'towing', 'portable_diesel_delivery')),
  price_pkr numeric(12, 2) not null check (price_pkr >= 0),
  source_name text not null,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.service_prices enable row level security;
revoke all on public.service_prices from anon, authenticated;
grant select on public.service_prices to anon, authenticated;
grant insert, update, delete on public.service_prices to authenticated;

drop policy if exists "Read service prices" on public.service_prices;
create policy "Read service prices"
  on public.service_prices for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins manage service prices" on public.service_prices;
create policy "Admins manage service prices"
  on public.service_prices for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin() and updated_by = auth.uid());

create or replace function public.admin_update_station(
  target_station_id uuid,
  target_name text,
  target_brand text,
  target_address text,
  target_supported_fuels text[],
  target_verification_status text
)
returns public.stations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_station public.stations;
begin
  if not public.is_admin() then
    raise exception 'Admin role is required';
  end if;
  if target_name is null or length(trim(target_name)) = 0 or length(target_name) > 200 then
    raise exception 'Invalid station name';
  end if;
  if target_verification_status not in ('unverified', 'pending', 'verified', 'rejected') then
    raise exception 'Invalid verification status';
  end if;
  if target_supported_fuels is null
     or exists (
       select 1 from unnest(target_supported_fuels) fuel
       where fuel not in ('petrol', 'diesel', 'cng')
     ) then
    raise exception 'Invalid supported fuels';
  end if;

  update public.stations
  set name = trim(target_name),
      brand = nullif(trim(target_brand), ''),
      address = nullif(trim(target_address), ''),
      supported_fuels = target_supported_fuels,
      verification_status = target_verification_status,
      updated_at = now()
  where id = target_station_id
  returning * into updated_station;

  if updated_station.id is null then
    raise exception 'Station not found';
  end if;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'update_station',
    'station',
    target_station_id::text,
    jsonb_build_object(
      'name', target_name,
      'brand', target_brand,
      'address', target_address,
      'supported_fuels', target_supported_fuels,
      'verification_status', target_verification_status
    )
  );
  return updated_station;
end;
$$;

revoke all on function public.admin_update_station(uuid, text, text, text, text[], text) from public;
grant execute on function public.admin_update_station(uuid, text, text, text, text[], text) to authenticated;
