begin;

create table if not exists public.driver_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 1 and 60),
  vehicle_type text not null check (vehicle_type in ('car', 'motorcycle', 'van', 'truck')),
  fuel_type text not null check (fuel_type in ('petrol', 'diesel', 'cng')),
  estimated_km_per_litre numeric(6,2) check (estimated_km_per_litre > 0 and estimated_km_per_litre <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists driver_vehicles_owner_idx on public.driver_vehicles(user_id, created_at);
alter table public.driver_vehicles enable row level security;
revoke all on public.driver_vehicles from anon, authenticated;
grant select, delete on public.driver_vehicles to authenticated;
grant insert(user_id,nickname,vehicle_type,fuel_type,estimated_km_per_litre),
      update(nickname,vehicle_type,fuel_type,estimated_km_per_litre,updated_at) on public.driver_vehicles to authenticated;
create policy "Drivers read own vehicles" on public.driver_vehicles for select to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) = 'driver');
create policy "Drivers insert own vehicles" on public.driver_vehicles for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.current_app_role()) = 'driver');
create policy "Drivers update own vehicles" on public.driver_vehicles for update to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) = 'driver')
  with check (user_id = (select auth.uid()) and (select public.current_app_role()) = 'driver');
create policy "Drivers delete own vehicles" on public.driver_vehicles for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) = 'driver');

alter table public.fuel_logs add column if not exists vehicle_id uuid references public.driver_vehicles(id) on delete set null;
create index if not exists fuel_logs_vehicle_date_idx on public.fuel_logs(vehicle_id, logged_at);
grant insert(vehicle_id) on public.fuel_logs to authenticated;
grant delete on public.fuel_logs to authenticated;
create policy "Drivers delete own fuel logs" on public.fuel_logs for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) = 'driver');

alter table public.profiles
  add column if not exists driver_auto_read boolean not null default false,
  add column if not exists driver_notifications boolean not null default true,
  add column if not exists driver_reduced_motion boolean not null default false;
grant update(driver_auto_read,driver_notifications,driver_reduced_motion) on public.profiles to authenticated;

-- Quotes are supplied by a trusted operator/backend, never by a Driver client.
create table if not exists public.driver_service_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.providers(id),
  service_type text not null check (service_type in ('puncture','battery','towing')),
  pickup_latitude numeric(9,6) not null check (pickup_latitude between -90 and 90),
  pickup_longitude numeric(9,6) not null check (pickup_longitude between -180 and 180),
  amount_pkr numeric(12,2) not null check (amount_pkr >= 0),
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > verified_at)
);
create index if not exists driver_quotes_owner_expiry_idx on public.driver_service_quotes(user_id,expires_at);
create index if not exists driver_quotes_provider_idx on public.driver_service_quotes(provider_id);
alter table public.driver_service_quotes enable row level security;
revoke all on public.driver_service_quotes from anon, authenticated;
grant select on public.driver_service_quotes to authenticated;
create policy "Drivers read own verified quotes" on public.driver_service_quotes for select to authenticated
  using (user_id = (select auth.uid()) and (select public.current_app_role()) = 'driver');

alter table public.service_requests
  add column if not exists quote_id uuid references public.driver_service_quotes(id),
  add column if not exists quote_amount_pkr numeric(12,2),
  add column if not exists vehicle_id uuid references public.driver_vehicles(id) on delete set null,
  add column if not exists contact_phone text check (contact_phone is null or char_length(contact_phone) between 7 and 30);
create unique index if not exists service_requests_quote_once_idx on public.service_requests(quote_id) where quote_id is not null;
create index if not exists service_requests_vehicle_idx on public.service_requests(vehicle_id);
grant insert(quote_id,vehicle_id,contact_phone) on public.service_requests to authenticated;

create or replace function public.validate_driver_owned_vehicle() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.vehicle_id is not null and not exists (
    select 1 from public.driver_vehicles where id = new.vehicle_id and user_id = new.user_id
  ) then raise exception 'Vehicle must belong to the record owner'; end if;
  return new;
end;
$$;
create trigger fuel_log_vehicle_owner before insert or update of vehicle_id,user_id on public.fuel_logs
  for each row execute function public.validate_driver_owned_vehicle();

create or replace function public.validate_driver_service_quote() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare q public.driver_service_quotes; p public.providers;
begin
  if (select public.current_app_role()) = 'driver' then
    if new.is_demo then raise exception 'Sample requests must remain in the preview'; end if;
    select * into q from public.driver_service_quotes where id = new.quote_id and user_id = (select auth.uid());
    if q.id is null or q.expires_at <= now() or q.verified_at > now() or q.service_type <> new.service_type
       or abs(q.pickup_latitude - new.latitude) > 0.001 or abs(q.pickup_longitude - new.longitude) > 0.001
       or new.latitude is null or new.longitude is null then
      raise exception 'A current verified quote matching this pickup is required';
    end if;
    select * into p from public.providers where id = q.provider_id;
    if p.id is null or p.verification_status <> 'approved' or not p.active or p.is_demo
       or not (q.service_type = any(p.service_types)) then raise exception 'Provider is not eligible'; end if;
    if new.contact_phone is null then raise exception 'Contact phone is required'; end if;
    new.assigned_provider_id := q.provider_id;
    new.quote_amount_pkr := q.amount_pkr;
    new.status := 'requested';
  end if;
  return new;
end;
$$;
create trigger driver_service_quote_guard before insert on public.service_requests
  for each row execute function public.validate_driver_service_quote();
create trigger service_request_vehicle_owner before insert or update of vehicle_id,user_id on public.service_requests
  for each row execute function public.validate_driver_owned_vehicle();

commit;
