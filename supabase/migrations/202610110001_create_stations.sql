create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  address text,
  osm_type text,
  osm_id bigint,
  location extensions.geography(Point, 4326) not null,
  supported_fuels text[] not null default '{}',
  opening_info jsonb,
  source text not null,
  source_url text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (osm_type, osm_id)
);

create index if not exists stations_location_gix
  on public.stations using gist (location);

alter table public.stations enable row level security;

drop policy if exists "Stations are publicly browsable" on public.stations;
create policy "Stations are publicly browsable"
  on public.stations for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.stations from anon, authenticated;
grant select on public.stations to anon, authenticated;

create or replace view public.station_public
with (security_invoker = true)
as
select
  id,
  name,
  brand,
  address,
  st_y(location::geometry) as latitude,
  st_x(location::geometry) as longitude,
  supported_fuels,
  verification_status,
  is_demo,
  source,
  source_url,
  updated_at
from public.stations;

grant select on public.station_public to anon, authenticated;
