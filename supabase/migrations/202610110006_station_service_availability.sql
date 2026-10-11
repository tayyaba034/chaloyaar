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

create policy "Read service prices"
  on public.service_prices for select
  to anon, authenticated
  using (true);

create policy "Admins manage service prices"
  on public.service_prices for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin() and updated_by = auth.uid());
