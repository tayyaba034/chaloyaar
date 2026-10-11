-- End-to-end roadside assistance request flow.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('driver', 'provider', 'station_admin', 'admin'));

alter table public.service_requests
  add column if not exists latitude numeric(8, 5),
  add column if not exists longitude numeric(8, 5),
  add column if not exists notes text;

alter table public.service_requests
  drop constraint if exists service_requests_location_check;
alter table public.service_requests
  add constraint service_requests_location_check
  check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  );

alter table public.service_requests
  drop constraint if exists service_requests_notes_length_check;
alter table public.service_requests
  add constraint service_requests_notes_length_check
  check (notes is null or char_length(notes) <= 500);

create table if not exists public.service_request_provider_declines (
  request_id uuid not null references public.service_requests(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, provider_id)
);

alter table public.service_request_provider_declines enable row level security;
revoke all on public.service_request_provider_declines from anon, authenticated;
grant select, insert on public.service_request_provider_declines to authenticated;

drop policy if exists "Providers read own request declines" on public.service_request_provider_declines;
create policy "Providers read own request declines"
  on public.service_request_provider_declines for select to authenticated
  using (provider_id = auth.uid() or public.is_admin());

drop policy if exists "Providers decline eligible requests" on public.service_request_provider_declines;
create policy "Providers decline eligible requests"
  on public.service_request_provider_declines for insert to authenticated
  with check (
    provider_id = auth.uid()
    and public.current_app_role() = 'provider'
    and exists (
      select 1
      from public.providers p
      where p.id = auth.uid()
        and p.verification_status = 'approved'
        and p.active
    )
  );

drop policy if exists "Read owned or eligible provider requests" on public.service_requests;
create policy "Read owned or eligible provider requests"
  on public.service_requests for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or (
      public.current_app_role() = 'provider'
      and exists (
        select 1
        from public.providers p
        where p.id = auth.uid()
          and p.verification_status = 'approved'
          and p.active
          and service_requests.service_type = any(p.service_types)
      )
      and (
        assigned_provider_id = auth.uid()
        or (
          assigned_provider_id is null
          and status = 'requested'
          and not exists (
            select 1
            from public.service_request_provider_declines d
            where d.request_id = service_requests.id
              and d.provider_id = auth.uid()
          )
      )
    )
  )
  );

drop policy if exists "Drivers create own service requests" on public.service_requests;
create policy "Drivers create own service requests"
  on public.service_requests for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.current_app_role() = 'driver'
  );

revoke insert on public.service_requests from authenticated;
grant insert (
  user_id, service_type, latitude, longitude, notes, is_demo
) on public.service_requests to authenticated;

create or replace function public.claim_service_request(target_request_id uuid)
returns public.service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed public.service_requests;
begin
  if public.current_app_role() <> 'provider' then
    raise exception 'Provider role is required';
  end if;

  update public.service_requests sr
  set assigned_provider_id = auth.uid(),
      status = 'confirmed',
      updated_at = now()
  where sr.id = target_request_id
    and sr.status = 'requested'
    and sr.assigned_provider_id is null
    and exists (
      select 1
      from public.providers p
      where p.id = auth.uid()
        and p.verification_status = 'approved'
        and p.active
        and sr.service_type = any(p.service_types)
    )
    and not exists (
      select 1
      from public.service_request_provider_declines d
      where d.request_id = sr.id
        and d.provider_id = auth.uid()
    )
  returning sr.* into claimed;

  if claimed.id is null then
    raise exception 'Request is no longer available';
  end if;
  return claimed;
end;
$$;

create or replace function public.decline_service_request(target_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_app_role() <> 'provider' then
    raise exception 'Provider role is required';
  end if;
  if not exists (
    select 1
    from public.service_requests sr
    join public.providers p on p.id = auth.uid()
    where sr.id = target_request_id
      and sr.status = 'requested'
      and sr.assigned_provider_id is null
      and p.verification_status = 'approved'
      and p.active
      and sr.service_type = any(p.service_types)
  ) then
    raise exception 'Request is no longer available';
  end if;
  insert into public.service_request_provider_declines (request_id, provider_id)
  values (target_request_id, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.transition_service_request(
  target_request_id uuid,
  target_status text
)
returns public.service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_request public.service_requests;
begin
  if target_status not in ('en_route', 'completed') then
    raise exception 'Unsupported provider transition';
  end if;

  update public.service_requests sr
  set status = target_status,
      updated_at = now()
  where sr.id = target_request_id
    and sr.assigned_provider_id = auth.uid()
    and (
      (sr.status = 'confirmed' and target_status = 'en_route')
      or (sr.status = 'en_route' and target_status = 'completed')
    )
  returning sr.* into updated_request;

  if updated_request.id is null then
    raise exception 'Request cannot move to that status';
  end if;
  return updated_request;
end;
$$;

create or replace function public.cancel_service_request(target_request_id uuid)
returns public.service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cancelled public.service_requests;
begin
  update public.service_requests sr
  set status = 'cancelled',
      updated_at = now()
  where sr.id = target_request_id
    and sr.user_id = auth.uid()
    and sr.status in ('requested', 'confirmed');

  if not found then
    raise exception 'Request cannot be cancelled';
  end if;

  select * into cancelled from public.service_requests where id = target_request_id;
  return cancelled;
end;
$$;

revoke all on function public.claim_service_request(uuid) from public;
revoke all on function public.decline_service_request(uuid) from public;
revoke all on function public.transition_service_request(uuid, text) from public;
revoke all on function public.cancel_service_request(uuid) from public;
grant execute on function public.claim_service_request(uuid) to authenticated;
grant execute on function public.decline_service_request(uuid) to authenticated;
grant execute on function public.transition_service_request(uuid, text) to authenticated;
grant execute on function public.cancel_service_request(uuid) to authenticated;
