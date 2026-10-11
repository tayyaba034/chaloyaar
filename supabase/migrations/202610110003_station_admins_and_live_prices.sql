-- A station administrator can only update availability for stations assigned by an app admin.
-- Official prices are written by a scheduled OGRA importer or an app admin, never by stations.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('driver', 'provider', 'station_admin', 'admin'));

create table if not exists public.station_admins (
  id uuid primary key references public.profiles(id) on delete cascade,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'approved', 'suspended')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.station_admin_assignments (
  station_id uuid not null references public.stations(id) on delete cascade,
  station_admin_id uuid not null references public.station_admins(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (station_id, station_admin_id)
);

create index if not exists station_admin_assignments_admin_idx
  on public.station_admin_assignments (station_admin_id);

alter table public.station_admins enable row level security;
alter table public.station_admin_assignments enable row level security;

revoke all on public.station_admins, public.station_admin_assignments from anon, authenticated;
grant select on public.station_admins, public.station_admin_assignments to authenticated;

drop policy if exists "Station admins read own record or admin" on public.station_admins;
create policy "Station admins read own record or admin"
  on public.station_admins for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "Station admins read own assignments or admin" on public.station_admin_assignments;
create policy "Station admins read own assignments or admin"
  on public.station_admin_assignments for select to authenticated
  using (station_admin_id = auth.uid() or public.is_admin());

create or replace function public.is_approved_station_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.station_admins sa
    where sa.id = auth.uid()
      and sa.verification_status = 'approved'
      and public.current_app_role() = 'station_admin'
  );
$$;

create or replace function public.set_station_availability(
  target_station_id uuid,
  target_fuel_type text,
  target_status text
)
returns public.availability_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_report public.availability_reports;
begin
  if target_fuel_type not in ('petrol', 'diesel', 'cng') then
    raise exception 'Unsupported fuel type';
  end if;

  if target_status not in ('available', 'unavailable', 'queue_reported') then
    raise exception 'Unsupported availability status';
  end if;

  if not public.is_approved_station_admin() then
    raise exception 'Station administrator approval is required';
  end if;

  if not exists (
    select 1
    from public.station_admin_assignments saa
    where saa.station_id = target_station_id
      and saa.station_admin_id = auth.uid()
  ) then
    raise exception 'You are not assigned to this station';
  end if;

  insert into public.availability_reports (
    station_id,
    fuel_type,
    reported_status,
    source_type,
    reporter_id,
    moderation_status,
    expires_at
  ) values (
    target_station_id,
    target_fuel_type,
    target_status,
    'station',
    auth.uid(),
    'approved',
    now() + interval '2 hours'
  ) returning * into created_report;

  return created_report;
end;
$$;

revoke all on function public.set_station_availability(uuid, text, text) from public;
grant execute on function public.set_station_availability(uuid, text, text) to authenticated;
