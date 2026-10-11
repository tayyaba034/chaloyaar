create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_language text not null default 'ur'
    check (preferred_language in ('ur', 'en', 'ur-Latn', 'pa-Arab')),
  role text not null default 'driver'
    check (role in ('driver', 'provider', 'admin')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.providers (
  id uuid primary key references public.profiles(id) on delete cascade,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'approved', 'suspended')),
  service_types text[] not null default '{}',
  active boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_prices (
  id uuid primary key default gen_random_uuid(),
  fuel_type text not null check (fuel_type in ('petrol', 'diesel', 'cng')),
  price_per_litre numeric(10, 2) not null check (price_per_litre > 0),
  source_name text not null,
  source_url text,
  effective_at timestamptz not null,
  entered_by uuid references public.profiles(id),
  entered_at timestamptz not null default now(),
  is_demo boolean not null default false
);

create index if not exists fuel_prices_current_idx
  on public.fuel_prices (fuel_type, effective_at desc);

create table if not exists public.availability_reports (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  fuel_type text not null check (fuel_type in ('petrol', 'diesel', 'cng')),
  reported_status text not null
    check (reported_status in ('available', 'unavailable', 'queue_reported')),
  source_type text not null check (source_type in ('user', 'station', 'admin')),
  reporter_id uuid references public.profiles(id) on delete set null,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected')),
  reported_at timestamptz not null default now(),
  expires_at timestamptz not null,
  is_demo boolean not null default false
);

create index if not exists reports_station_fuel_time_idx
  on public.availability_reports (station_id, fuel_type, reported_at desc);

create table if not exists public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  litres numeric(10, 3) not null check (litres > 0),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  odometer_km numeric(12, 1) check (odometer_km >= 0),
  logged_at timestamptz not null default now(),
  is_demo boolean not null default false
);

create index if not exists fuel_logs_user_date_idx
  on public.fuel_logs (user_id, logged_at desc);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_provider_id uuid references public.providers(id),
  service_type text not null check (service_type in ('puncture', 'battery', 'towing')),
  status text not null default 'requested'
    check (status in ('requested', 'quoted', 'confirmed', 'en_route', 'completed', 'cancelled')),
  safe_public_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_demo boolean not null default false
);

create index if not exists service_requests_owner_idx
  on public.service_requests (user_id, created_at desc);

create index if not exists service_requests_provider_idx
  on public.service_requests (assigned_provider_id, created_at desc);

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_request_id uuid references public.service_requests(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  is_demo boolean not null default false
);

create index if not exists complaints_status_created_idx
  on public.complaints (status, created_at desc);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.create_profile_for_auth_user();

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

alter table public.profiles enable row level security;
alter table public.providers enable row level security;
alter table public.fuel_prices enable row level security;
alter table public.availability_reports enable row level security;
alter table public.fuel_logs enable row level security;
alter table public.service_requests enable row level security;
alter table public.complaints enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.profiles, public.providers, public.fuel_prices,
  public.availability_reports, public.fuel_logs, public.service_requests,
  public.complaints, public.admin_audit_log from anon, authenticated;

grant select on public.profiles, public.providers, public.fuel_prices,
  public.availability_reports, public.fuel_logs, public.service_requests,
  public.complaints
  to authenticated;
grant select on public.fuel_prices, public.availability_reports to anon;
grant insert on public.availability_reports to authenticated;
grant insert, update, delete on public.fuel_logs to authenticated;
grant insert on public.service_requests to authenticated;

drop policy if exists "Read own profile or admin profiles" on public.profiles;
create policy "Read own profile or admin profiles"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "Update own safe profile fields" on public.profiles;
create policy "Update own safe profile fields"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Read own provider profile or admin" on public.providers;
create policy "Read own provider profile or admin"
  on public.providers for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "Read current public fuel prices" on public.fuel_prices;
create policy "Read current public fuel prices"
  on public.fuel_prices for select to anon, authenticated
  using (effective_at <= now());

drop policy if exists "Admins manage fuel prices" on public.fuel_prices;
create policy "Admins manage fuel prices"
  on public.fuel_prices for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Read approved current availability" on public.availability_reports;
create policy "Read approved current availability"
  on public.availability_reports for select to anon, authenticated
  using (
    moderation_status = 'approved'
    or reporter_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "Drivers submit own reports" on public.availability_reports;
create policy "Drivers submit own reports"
  on public.availability_reports for insert to authenticated
  with check (reporter_id = auth.uid() and moderation_status = 'pending');

drop policy if exists "Read own fuel logs" on public.fuel_logs;
create policy "Read own fuel logs"
  on public.fuel_logs for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Write own fuel logs" on public.fuel_logs;
create policy "Write own fuel logs"
  on public.fuel_logs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.current_app_role() = 'driver');

drop policy if exists "Read owned or eligible provider requests" on public.service_requests;
create policy "Read owned or eligible provider requests"
  on public.service_requests for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or (
      assigned_provider_id = auth.uid()
      and public.current_app_role() = 'provider'
      and exists (
        select 1 from public.providers p
        where p.id = auth.uid()
          and p.verification_status = 'approved'
          and p.active
      )
    )
  );

drop policy if exists "Drivers create own service requests" on public.service_requests;
create policy "Drivers create own service requests"
  on public.service_requests for insert to authenticated
  with check (user_id = auth.uid() and public.current_app_role() = 'driver');

drop policy if exists "Read own complaints or admin" on public.complaints;
create policy "Read own complaints or admin"
  on public.complaints for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Drivers submit own complaints" on public.complaints;
create policy "Drivers submit own complaints"
  on public.complaints for insert to authenticated
  with check (user_id = auth.uid() and public.current_app_role() = 'driver');

drop policy if exists "Admins read audit log" on public.admin_audit_log;
create policy "Admins read audit log"
  on public.admin_audit_log for select to authenticated
  using (public.is_admin());

revoke insert, update, delete, truncate on public.profiles, public.providers,
  public.fuel_prices, public.availability_reports, public.fuel_logs,
  public.service_requests, public.complaints, public.admin_audit_log from anon, authenticated;
grant update (display_name, preferred_language) on public.profiles to authenticated;
grant insert on public.availability_reports to authenticated;
grant insert, update, delete on public.fuel_logs to authenticated;
grant insert on public.service_requests to authenticated;
grant insert on public.complaints to authenticated;
