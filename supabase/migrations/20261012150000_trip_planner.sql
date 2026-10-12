-- Errand trip planner: businesses, availability verification, itineraries, trips and outcomes.
-- Units are explicit in column names. Availability is never inferred from opening hours.

-- ---------------------------------------------------------------------------
-- Businesses and memberships
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  category text not null check (category in ('mechanic', 'workshop', 'clinic', 'pharmacy', 'office', 'shop', 'other_service')),
  description text check (description is null or char_length(description) <= 1000),
  phone text check (phone is null or phone ~ '^[+0-9 ()-]{7,30}$'),
  address text check (address is null or char_length(address) <= 300),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  location extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude::double precision, latitude::double precision), 4326)::extensions.geography
  ) stored,
  search_text text generated always as (lower(name || ' ' || coalesce(description, '') || ' ' || coalesce(address, ''))) stored,
  place_id uuid references public.places(id) on delete set null,
  source text not null check (source in ('owner_registered', 'osm_import', 'admin', 'demo')),
  osm_type text check (osm_type is null or osm_type in ('node', 'way', 'relation')),
  osm_id bigint,
  published_hours_text text check (published_hours_text is null or char_length(published_hours_text) <= 300),
  listing_status text not null default 'pending_review' check (listing_status in ('unclaimed', 'pending_review', 'active', 'suspended', 'rejected')),
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (osm_type, osm_id),
  check (is_demo = (source = 'demo'))
);
create index if not exists businesses_location_gix on public.businesses using gist (location);
create index if not exists businesses_search_trgm on public.businesses using gin (search_text extensions.gin_trgm_ops);
create index if not exists businesses_category_idx on public.businesses (category, listing_status);

create table if not exists public.business_users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  invited_by uuid references public.profiles(id) on delete set null,
  claim_note text check (claim_note is null or char_length(claim_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index if not exists business_users_user_idx on public.business_users (user_id, status);

create or replace function public.is_business_member(target_business uuid, allowed_roles text[] default array['owner', 'staff'])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.business_users m
    where m.business_id = target_business and m.user_id = auth.uid()
      and m.status = 'active' and m.role = any (allowed_roles)
  );
$$;
revoke all on function public.is_business_member(uuid, text[]) from public;
grant execute on function public.is_business_member(uuid, text[]) to authenticated;

create or replace function public.business_is_public(target_business uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.businesses b where b.id = target_business and b.listing_status in ('active', 'unclaimed'));
$$;
grant execute on function public.business_is_public(uuid) to anon, authenticated;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  tag text check (tag is null or tag ~ '^[a-z0-9_]{2,40}$'),
  description text check (description is null or char_length(description) <= 500),
  duration_minutes integer not null default 30 check (duration_minutes between 1 and 480),
  price_note text check (price_note is null or char_length(price_note) <= 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists services_business_idx on public.services (business_id, is_active);

create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  closes_next_day boolean not null default false,
  is_closed boolean not null default false,
  valid_on date,
  source text not null default 'owner' check (source in ('owner', 'osm', 'admin', 'demo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_next_day or closes_at > opens_at or is_closed)
);
create index if not exists business_hours_business_idx on public.business_hours (business_id, weekday);

-- ---------------------------------------------------------------------------
-- Availability state machine (stored states) and freshness policies
-- Derived states: UNKNOWN (no update), PENDING_CONFIRMATION (open request), EXPIRED (aged out).
-- ---------------------------------------------------------------------------
create table if not exists public.verification_policies (
  category text not null check (category in ('mechanic', 'workshop', 'clinic', 'pharmacy', 'office', 'shop', 'other_service')),
  state text not null check (state in ('CONFIRMED', 'UNAVAILABLE')),
  freshness_minutes integer not null check (freshness_minutes between 5 and 10080),
  updated_at timestamptz not null default now(),
  primary key (category, state)
);
insert into public.verification_policies (category, state, freshness_minutes) values
  ('mechanic', 'CONFIRMED', 60), ('workshop', 'CONFIRMED', 60), ('clinic', 'CONFIRMED', 60),
  ('pharmacy', 'CONFIRMED', 120), ('office', 'CONFIRMED', 120), ('shop', 'CONFIRMED', 120), ('other_service', 'CONFIRMED', 90),
  ('mechanic', 'UNAVAILABLE', 240), ('workshop', 'UNAVAILABLE', 240), ('clinic', 'UNAVAILABLE', 240),
  ('pharmacy', 'UNAVAILABLE', 240), ('office', 'UNAVAILABLE', 240), ('shop', 'UNAVAILABLE', 240), ('other_service', 'UNAVAILABLE', 240)
on conflict (category, state) do nothing;

create table if not exists public.verification_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  itinerary_id uuid,
  itinerary_stop_id uuid,
  channel text not null check (channel in ('in_app', 'manual', 'whatsapp')),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'declined', 'expired', 'cancelled', 'failed', 'not_configured')),
  question text not null check (char_length(trim(question)) between 3 and 200),
  window_start timestamptz,
  window_end timestamptz,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  responded_at timestamptz,
  responded_by uuid references public.profiles(id) on delete set null,
  response_note text check (response_note is null or char_length(response_note) <= 300),
  availability_update_id uuid,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 200),
  is_demo boolean not null default false,
  check (window_end is null or window_start is null or window_end > window_start)
);
create index if not exists verification_events_business_idx on public.verification_events (business_id, status, requested_at desc);
create index if not exists verification_events_requester_idx on public.verification_events (requested_by, requested_at desc);

create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  itinerary_stop_id uuid,
  window_start timestamptz not null,
  window_end timestamptz not null,
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'expired', 'cancelled')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  expires_at timestamptz not null default now() + interval '2 hours',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_end > window_start and window_end - window_start <= interval '8 hours')
);
create index if not exists appointment_requests_business_idx on public.appointment_requests (business_id, status, window_start);
create index if not exists appointment_requests_user_idx on public.appointment_requests (user_id, created_at desc);

create table if not exists public.availability_updates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  resource_label text check (resource_label is null or char_length(resource_label) <= 80),
  state text not null check (state in ('UNCONFIRMED', 'CONFIRMED', 'UNAVAILABLE', 'TEMPORARILY_CLOSED')),
  source text not null check (source in ('business_dashboard', 'appointment_accepted', 'messaging', 'manual_confirmation', 'external_provider', 'system')),
  part_available boolean,
  part_label text check (part_label is null or char_length(part_label) <= 80),
  note text check (note is null or char_length(note) <= 300),
  submitted_by uuid references public.profiles(id) on delete set null,
  submitter_role text not null check (submitter_role in ('owner', 'staff', 'admin', 'system')),
  submitted_at timestamptz not null default now(),
  valid_until timestamptz,
  verification_event_id uuid references public.verification_events(id) on delete set null,
  appointment_request_id uuid references public.appointment_requests(id) on delete set null,
  is_demo boolean not null default false,
  -- Tie-breaker for updates submitted in the same instant.
  sequence_no bigint generated always as identity,
  check (state <> 'TEMPORARILY_CLOSED' or valid_until is not null),
  check (valid_until is null or valid_until > submitted_at)
);
create index if not exists availability_updates_latest_idx on public.availability_updates (business_id, submitted_at desc, sequence_no desc);
alter table public.verification_events
  add constraint verification_events_update_fk foreign key (availability_update_id) references public.availability_updates(id) on delete set null;

-- Effective state for a business (and optionally one service) at a point in time.
create or replace function public.current_availability(target_business uuid, target_service uuid default null, at_time timestamptz default now())
returns table (
  state text, stored_state text, source text, submitter_role text, submitted_at timestamptz,
  effective_until timestamptz, note text, part_available boolean, part_label text, resource_label text,
  open_request_id uuid, explanation text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  business_category text;
  closure public.availability_updates;
  latest public.availability_updates;
  freshness integer;
  until_at timestamptz;
  pending uuid;
begin
  select b.category into business_category from public.businesses b where b.id = target_business;
  if business_category is null then return; end if;

  select ve.id into pending from public.verification_events ve
  where ve.business_id = target_business and ve.status = 'requested' and ve.expires_at > at_time
    and (target_service is null or ve.service_id is null or ve.service_id = target_service)
  order by ve.requested_at desc limit 1;

  -- A business-wide temporary closure overrides service-level updates while it lasts.
  select * into closure from public.availability_updates u
  where u.business_id = target_business and u.service_id is null and u.submitted_at <= at_time
  order by u.submitted_at desc, u.sequence_no desc limit 1;
  if closure.state = 'TEMPORARILY_CLOSED' and closure.valid_until > at_time then
    return query select 'TEMPORARILY_CLOSED', closure.state, closure.source, closure.submitter_role, closure.submitted_at,
      closure.valid_until, closure.note, closure.part_available, closure.part_label, closure.resource_label, pending,
      'The business marked itself temporarily closed until the time shown.';
    return;
  end if;

  select * into latest from public.availability_updates u
  where u.business_id = target_business and u.submitted_at <= at_time
    and (case when target_service is null then u.service_id is null else u.service_id = target_service or u.service_id is null end)
  order by u.submitted_at desc, u.sequence_no desc limit 1;

  if latest.id is null then
    return query select case when pending is null then 'UNKNOWN' else 'PENDING_CONFIRMATION' end, null::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::text, null::boolean, null::text, null::text, pending,
      case when pending is null then 'No confirmation from this business yet. Published hours do not show whether anyone is available.'
           else 'A confirmation request was sent and has no answer yet. No answer is not a confirmation.' end;
    return;
  end if;

  select p.freshness_minutes into freshness from public.verification_policies p where p.category = business_category and p.state = latest.state;
  until_at := case
    when latest.state = 'TEMPORARILY_CLOSED' then latest.valid_until
    when latest.state = 'UNCONFIRMED' then null
    else least(coalesce(latest.valid_until, 'infinity'::timestamptz), latest.submitted_at + make_interval(mins => coalesce(freshness, 60)))
  end;

  if until_at is not null and until_at <= at_time then
    return query select case when pending is null then 'EXPIRED' else 'PENDING_CONFIRMATION' end, latest.state, latest.source, latest.submitter_role,
      latest.submitted_at, until_at, latest.note, latest.part_available, latest.part_label, latest.resource_label, pending,
      'The last update is too old to rely on. Ask for a fresh confirmation before travelling.';
    return;
  end if;

  return query select case when latest.state = 'UNCONFIRMED' and pending is not null then 'PENDING_CONFIRMATION' else latest.state end,
    latest.state, latest.source, latest.submitter_role, latest.submitted_at, until_at, latest.note,
    latest.part_available, latest.part_label, latest.resource_label, pending,
    case latest.state
      when 'CONFIRMED' then 'Confirmed by the business or an accepted appointment, valid until the time shown.'
      when 'UNAVAILABLE' then 'The business reported this service, person or part is not available.'
      else 'Information exists but has not been confirmed by the business.'
    end;
end $$;
grant execute on function public.current_availability(uuid, uuid, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Driver-side planning tables
-- ---------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  default_vehicle_id uuid references public.driver_vehicles(id) on delete set null,
  time_weight_pkr_per_minute numeric(8,2) not null default 2 check (time_weight_pkr_per_minute between 0 and 1000),
  failed_visit_penalty_pkr numeric(10,2) not null default 300 check (failed_visit_penalty_pkr between 0 and 100000),
  missed_deadline_penalty_pkr numeric(10,2) not null default 500 check (missed_deadline_penalty_pkr between 0 and 100000),
  max_trip_minutes integer check (max_trip_minutes is null or max_trip_minutes between 10 and 1440),
  preferred_max_cost_pkr numeric(10,2) check (preferred_max_cost_pkr is null or preferred_max_cost_pkr > 0),
  km_per_litre numeric(6,2) check (km_per_litre is null or (km_per_litre > 0 and km_per_litre <= 200)),
  data_sharing_consent boolean not null default false,
  consented_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_price_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fuel_type text not null default 'petrol' check (fuel_type in ('petrol', 'diesel', 'cng')),
  price_pkr_per_litre numeric(8,2) not null check (price_pkr_per_litre > 0 and price_pkr_per_litre <= 5000),
  source text not null check (source in ('user', 'official_reference')),
  reference_fuel_price_id uuid references public.fuel_prices(id) on delete set null,
  set_at timestamptz not null default now()
);
create index if not exists fuel_price_settings_latest_idx on public.fuel_price_settings (user_id, fuel_type, set_at desc);

create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text check (title is null or char_length(title) <= 120),
  request_text text check (request_text is null or char_length(request_text) <= 1000),
  workflow_state text not null default 'DRAFT' check (workflow_state in (
    'DRAFT', 'PARSED', 'NEEDS_INFO', 'SEARCHING', 'VERIFYING', 'AWAITING_CONFIRMATION', 'ROUTING', 'OPTIMIZING',
    'PROPOSED', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'RECALCULATING', 'COMPLETED', 'CANCELLED', 'FAILED')),
  workflow_version integer not null default 0,
  origin_label text check (origin_label is null or char_length(origin_label) <= 160),
  origin_latitude numeric(9,6) check (origin_latitude is null or origin_latitude between -90 and 90),
  origin_longitude numeric(9,6) check (origin_longitude is null or origin_longitude between -180 and 180),
  return_to_origin boolean not null default true,
  depart_at timestamptz,
  vehicle_id uuid references public.driver_vehicles(id) on delete set null,
  km_per_litre numeric(6,2) check (km_per_litre is null or (km_per_litre > 0 and km_per_litre <= 200)),
  price_pkr_per_litre numeric(8,2) check (price_pkr_per_litre is null or (price_pkr_per_litre > 0 and price_pkr_per_litre <= 5000)),
  max_trip_minutes integer check (max_trip_minutes is null or max_trip_minutes between 10 and 1440),
  preferred_max_cost_pkr numeric(10,2) check (preferred_max_cost_pkr is null or preferred_max_cost_pkr > 0),
  weights jsonb not null default '{}'::jsonb check (jsonb_typeof(weights) = 'object'),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  estimate_kind text check (estimate_kind is null or estimate_kind in ('road', 'straight_line', 'mixed')),
  optimality text check (optimality is null or optimality in ('proven_optimal', 'best_found', 'user_order')),
  needs_recalculation boolean not null default false,
  recalculation_reason text check (recalculation_reason is null or char_length(recalculation_reason) <= 300),
  approved_at timestamptz,
  approved_revision integer,
  risk_acknowledged_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((origin_latitude is null) = (origin_longitude is null))
);
create index if not exists itineraries_user_idx on public.itineraries (user_id, updated_at desc);

create table if not exists public.itinerary_stops (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  position integer not null check (position >= 0),
  user_position integer not null check (user_position >= 0),
  errand_label text not null check (char_length(trim(errand_label)) between 1 and 120),
  category text check (category is null or category in ('mechanic', 'workshop', 'clinic', 'pharmacy', 'office', 'shop', 'other_service')),
  service_query text check (service_query is null or char_length(service_query) <= 120),
  business_id uuid references public.businesses(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  place_label text check (place_label is null or char_length(place_label) <= 160),
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  mandatory boolean not null default true,
  deadline_at timestamptz,
  deadline_kind text not null default 'soft' check (deadline_kind in ('hard', 'soft')),
  preferred_from timestamptz,
  preferred_to timestamptz,
  service_minutes integer not null default 15 check (service_minutes between 0 and 480),
  appointment_request_id uuid references public.appointment_requests(id) on delete set null,
  planned_arrival_at timestamptz,
  planned_departure_at timestamptz,
  status text not null default 'planned' check (status in ('planned', 'skipped', 'unavailable', 'visited', 'failed')),
  alternative_of uuid references public.itinerary_stops(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (preferred_to is null or preferred_from is null or preferred_to > preferred_from),
  unique (itinerary_id, position) deferrable initially deferred
);
create index if not exists itinerary_stops_business_idx on public.itinerary_stops (business_id);
alter table public.verification_events
  add constraint verification_events_itinerary_fk foreign key (itinerary_id) references public.itineraries(id) on delete set null,
  add constraint verification_events_stop_fk foreign key (itinerary_stop_id) references public.itinerary_stops(id) on delete set null;
alter table public.appointment_requests
  add constraint appointment_requests_stop_fk foreign key (itinerary_stop_id) references public.itinerary_stops(id) on delete set null;

create table if not exists public.itinerary_revisions (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  revision integer not null check (revision >= 1),
  reason text not null check (reason in ('initial', 'optimized', 'user_edit', 'recalculated', 'alternative')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (itinerary_id, revision)
);

create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  step text not null check (step ~ '^[a-z_]{3,40}$'),
  status text not null check (status in ('started', 'succeeded', 'waiting', 'failed', 'skipped')),
  actor text not null check (actor in ('system', 'llm', 'user')),
  from_state text,
  to_state text,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  error text check (error is null or char_length(error) <= 500),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists workflow_steps_itinerary_idx on public.workflow_steps (itinerary_id, started_at);

create table if not exists public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (action_type in ('send_confirmation_request', 'request_appointment', 'commit_trip')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  summary text not null check (char_length(summary) between 3 and 300),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'executed', 'failed', 'expired')),
  proposed_by text not null check (proposed_by in ('agent', 'user', 'system')),
  approved_at timestamptz,
  executed_at timestamptz,
  result jsonb,
  expires_at timestamptz not null default now() + interval '1 hour',
  created_at timestamptz not null default now()
);
create index if not exists pending_actions_itinerary_idx on public.pending_actions (itinerary_id, status);

-- Server-side cache of road distances; no API role can read or write it.
create table if not exists public.route_estimates (
  id uuid primary key default gen_random_uuid(),
  from_key text not null check (from_key ~ '^-?[0-9]+\.[0-9]+,-?[0-9]+\.[0-9]+$'),
  to_key text not null check (to_key ~ '^-?[0-9]+\.[0-9]+,-?[0-9]+\.[0-9]+$'),
  provider text not null check (provider in ('ors', 'osrm', 'straight_line')),
  distance_m numeric(12,1) not null check (distance_m >= 0),
  duration_s numeric(12,1) not null check (duration_s >= 0),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  unique (from_key, to_key, provider)
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null unique references public.itineraries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.driver_vehicles(id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  planned_distance_km numeric(8,2) not null check (planned_distance_km >= 0),
  planned_estimate_kind text not null check (planned_estimate_kind in ('road', 'straight_line', 'mixed')),
  actual_distance_km numeric(8,2) check (actual_distance_km is null or actual_distance_km >= 0),
  odometer_start_km numeric(10,1),
  odometer_end_km numeric(10,1),
  km_per_litre_snapshot numeric(6,2) not null check (km_per_litre_snapshot > 0 and km_per_litre_snapshot <= 200),
  price_pkr_per_litre_snapshot numeric(8,2) not null check (price_pkr_per_litre_snapshot > 0),
  estimated_fuel_litres numeric(8,3) generated always as (planned_distance_km / km_per_litre_snapshot) stored,
  estimated_fuel_cost_pkr numeric(10,2) generated always as (planned_distance_km / km_per_litre_snapshot * price_pkr_per_litre_snapshot) stored,
  actual_fuel_cost_pkr numeric(10,2) generated always as (actual_distance_km / km_per_litre_snapshot * price_pkr_per_litre_snapshot) stored,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (odometer_end_km is null or odometer_start_km is null or odometer_end_km >= odometer_start_km)
);
create index if not exists trips_user_idx on public.trips (user_id, created_at desc);

create table if not exists public.trip_outcomes (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  itinerary_stop_id uuid not null unique references public.itinerary_stops(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  outcome text not null check (outcome in ('success', 'failed', 'skipped', 'avoided')),
  failure_cause text check (failure_cause is null or failure_cause in ('closed', 'service_unavailable', 'part_unavailable', 'long_wait', 'not_found', 'other')),
  evidence text check (evidence is null or evidence in ('user_feedback', 'business_update', 'appointment_declined')),
  availability_update_id uuid references public.availability_updates(id) on delete set null,
  verification_event_id uuid references public.verification_events(id) on delete set null,
  appointment_request_id uuid references public.appointment_requests(id) on delete set null,
  avoided_round_trip_km numeric(8,2) check (avoided_round_trip_km is null or avoided_round_trip_km >= 0),
  avoided_estimate_kind text check (avoided_estimate_kind is null or avoided_estimate_kind in ('road', 'straight_line', 'mixed')),
  km_per_litre_snapshot numeric(6,2) check (km_per_litre_snapshot is null or (km_per_litre_snapshot > 0 and km_per_litre_snapshot <= 200)),
  price_pkr_per_litre_snapshot numeric(8,2) check (price_pkr_per_litre_snapshot is null or price_pkr_per_litre_snapshot > 0),
  avoided_fuel_cost_pkr numeric(10,2) generated always as (avoided_round_trip_km / km_per_litre_snapshot * price_pkr_per_litre_snapshot) stored,
  note text check (note is null or char_length(note) <= 300),
  recorded_by uuid not null references public.profiles(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  check (outcome <> 'failed' or failure_cause is not null),
  -- A trip only counts as avoided with the user's own feedback plus the verification evidence behind it.
  check (outcome <> 'avoided' or (
    evidence = 'user_feedback'
    and (availability_update_id is not null or verification_event_id is not null or appointment_request_id is not null)
    and avoided_round_trip_km is not null and avoided_estimate_kind is not null
    and km_per_litre_snapshot is not null and price_pkr_per_litre_snapshot is not null))
);
create index if not exists trip_outcomes_itinerary_idx on public.trip_outcomes (itinerary_id);

-- Consent-based, minimised features for a future model. No user id or coordinates.
create table if not exists public.visit_feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  weekday smallint not null check (weekday between 0 and 6),
  hour_bucket smallint not null check (hour_bucket between 0 and 23),
  availability_state_at_departure text,
  confirmation_age_minutes integer,
  confirmation_response_minutes integer,
  service_ready boolean,
  prior_confirmed_visits integer not null default 0,
  prior_successful_visits integer not null default 0,
  outcome text not null check (outcome in ('success', 'failed', 'skipped', 'avoided')),
  failure_cause text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  business_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_business_idx on public.audit_logs (business_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit trigger
-- ---------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
  target_business uuid;
begin
  target_business := case tg_table_name when 'businesses' then (row_data ->> 'id')::uuid else (row_data ->> 'business_id')::uuid end;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, business_id, before_data, after_data)
  values (
    auth.uid(), lower(tg_op), tg_table_name, (row_data ->> 'id')::uuid, target_business,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'phone' - 'search_text' - 'location' end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'phone' - 'search_text' - 'location' end
  );
  return coalesce(new, old);
end $$;
do $$
declare table_name text;
begin
  foreach table_name in array array['businesses', 'business_users', 'services', 'business_hours', 'availability_updates', 'verification_events', 'appointment_requests'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_audit', table_name);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', table_name || '_audit', table_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Workflow state transitions are validated in the database as well as the server.
-- ---------------------------------------------------------------------------
create or replace function public.validate_itinerary_transition()
returns trigger language plpgsql set search_path = ''
as $$
declare
  allowed text[];
begin
  if new.workflow_state = old.workflow_state then return new; end if;
  allowed := case old.workflow_state
    when 'DRAFT' then array['PARSED', 'NEEDS_INFO', 'CANCELLED', 'FAILED']
    when 'PARSED' then array['NEEDS_INFO', 'SEARCHING', 'CANCELLED', 'FAILED']
    when 'NEEDS_INFO' then array['PARSED', 'SEARCHING', 'CANCELLED', 'FAILED']
    when 'SEARCHING' then array['NEEDS_INFO', 'VERIFYING', 'CANCELLED', 'FAILED']
    when 'VERIFYING' then array['AWAITING_CONFIRMATION', 'ROUTING', 'NEEDS_INFO', 'CANCELLED', 'FAILED']
    when 'AWAITING_CONFIRMATION' then array['VERIFYING', 'ROUTING', 'CANCELLED', 'FAILED']
    when 'ROUTING' then array['OPTIMIZING', 'NEEDS_INFO', 'CANCELLED', 'FAILED']
    when 'OPTIMIZING' then array['PROPOSED', 'NEEDS_INFO', 'CANCELLED', 'FAILED']
    when 'PROPOSED' then array['AWAITING_APPROVAL', 'RECALCULATING', 'NEEDS_INFO', 'CANCELLED']
    when 'AWAITING_APPROVAL' then array['APPROVED', 'RECALCULATING', 'PROPOSED', 'NEEDS_INFO', 'CANCELLED']
    when 'APPROVED' then array['IN_PROGRESS', 'RECALCULATING', 'COMPLETED', 'CANCELLED']
    when 'IN_PROGRESS' then array['COMPLETED', 'RECALCULATING', 'CANCELLED']
    when 'RECALCULATING' then array['SEARCHING', 'VERIFYING', 'ROUTING', 'OPTIMIZING', 'PROPOSED', 'NEEDS_INFO', 'CANCELLED', 'FAILED']
    when 'FAILED' then array['DRAFT', 'PARSED', 'SEARCHING', 'ROUTING', 'CANCELLED']
    else array[]::text[]
  end;
  if not (new.workflow_state = any (allowed)) then
    raise exception 'Invalid workflow transition % -> %', old.workflow_state, new.workflow_state using errcode = 'check_violation';
  end if;
  if new.workflow_state = 'APPROVED' and new.approved_at is null then
    raise exception 'Approval time is required' using errcode = 'check_violation';
  end if;
  new.workflow_version := old.workflow_version + 1;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists itineraries_transition on public.itineraries;
create trigger itineraries_transition before update on public.itineraries for each row execute function public.validate_itinerary_transition();

-- Flag active itineraries that include a business whose availability changed, and tell the owner.
create or replace function public.flag_itineraries_for_business(target_business uuid, reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  affected record;
  business_name text;
begin
  select name into business_name from public.businesses where id = target_business;
  for affected in
    select distinct i.id, i.user_id, i.is_demo from public.itineraries i
    join public.itinerary_stops s on s.itinerary_id = i.id
    where s.business_id = target_business
      and i.workflow_state in ('PROPOSED', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'AWAITING_CONFIRMATION')
  loop
    update public.itineraries set needs_recalculation = true, recalculation_reason = left(reason, 300) where id = affected.id;
    perform public.notify_user(affected.user_id, 'itinerary_changed', left(coalesce(business_name, 'A stop') || ': ' || reason, 160),
      'Open the trip to recalculate.', '/app/trips/' || affected.id, jsonb_build_object('itinerary_id', affected.id, 'business_id', target_business), affected.is_demo);
  end loop;
end $$;
revoke all on function public.flag_itineraries_for_business(uuid, text) from public, anon, authenticated;

create or replace function public.on_availability_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.flag_itineraries_for_business(new.business_id,
    case new.state when 'CONFIRMED' then 'availability confirmed'
                   when 'UNAVAILABLE' then 'reported not available'
                   when 'TEMPORARILY_CLOSED' then 'temporarily closed'
                   else 'availability changed' end);
  return new;
end $$;
drop trigger if exists availability_updates_flag on public.availability_updates;
create trigger availability_updates_flag after insert on public.availability_updates for each row execute function public.on_availability_update();

-- ---------------------------------------------------------------------------
-- Business functions (membership enforced here, not only in the UI)
-- ---------------------------------------------------------------------------
create or replace function public.register_business(
  business_name text, business_category text, business_latitude double precision, business_longitude double precision,
  business_description text default null, business_phone text default null, business_address text default null, business_place uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to register a business.'; end if;
  if (select count(*) from public.businesses where created_by = auth.uid() and listing_status = 'pending_review') >= 3 then
    raise exception 'You already have 3 businesses waiting for review.';
  end if;
  insert into public.businesses (name, category, latitude, longitude, description, phone, address, place_id, source, listing_status, created_by)
  values (trim(business_name), business_category, round(business_latitude::numeric, 6), round(business_longitude::numeric, 6),
    nullif(trim(business_description), ''), nullif(trim(business_phone), ''), nullif(trim(business_address), ''), business_place,
    'owner_registered', 'pending_review', auth.uid())
  returning id into new_id;
  insert into public.business_users (business_id, user_id, role, status) values (new_id, auth.uid(), 'owner', 'active');
  return new_id;
end $$;

create or replace function public.claim_business(target_business uuid, claim_text text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare membership uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to claim a business.'; end if;
  if not exists (select 1 from public.businesses where id = target_business and listing_status = 'unclaimed') then
    raise exception 'Only unclaimed listings can be claimed.';
  end if;
  insert into public.business_users (business_id, user_id, role, status, claim_note)
  values (target_business, auth.uid(), 'owner', 'pending', left(claim_text, 500))
  on conflict (business_id, user_id) do update set claim_note = excluded.claim_note, updated_at = now()
  returning id into membership;
  return membership;
end $$;

create or replace function public.review_business(target_business uuid, decision text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Admin role is required.'; end if;
  if decision not in ('active', 'suspended', 'rejected') then raise exception 'Invalid decision.'; end if;
  update public.businesses set listing_status = decision, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = target_business;
  if not found then raise exception 'Business not found.'; end if;
end $$;

create or replace function public.review_business_claim(membership uuid, approve boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare claim public.business_users;
begin
  if not public.is_admin() then raise exception 'Admin role is required.'; end if;
  select * into claim from public.business_users where id = membership and status = 'pending';
  if claim.id is null then raise exception 'Claim not found.'; end if;
  update public.business_users set status = case when approve then 'active' else 'revoked' end, updated_at = now() where id = membership;
  if approve then update public.businesses set listing_status = 'active', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = claim.business_id; end if;
  perform public.notify_user(claim.user_id, 'business_claim', case when approve then 'Your business claim was approved' else 'Your business claim was not approved' end,
    null, '/business', jsonb_build_object('business_id', claim.business_id));
end $$;

create or replace function public.add_business_staff(target_business uuid, staff_email text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare staff_user uuid; membership uuid;
begin
  if not public.is_business_member(target_business, array['owner']) then raise exception 'Only the business owner can add staff.'; end if;
  select id into staff_user from auth.users where lower(email) = lower(trim(staff_email));
  if staff_user is null or not exists (select 1 from public.profiles where id = staff_user) then
    raise exception 'No Chalo Yaar account uses that email. Ask them to sign up first.';
  end if;
  insert into public.business_users (business_id, user_id, role, status, invited_by)
  values (target_business, staff_user, 'staff', 'active', auth.uid())
  on conflict (business_id, user_id) do update set status = 'active', role = case when public.business_users.role = 'owner' then 'owner' else 'staff' end, updated_at = now()
  returning id into membership;
  return membership;
end $$;

create or replace function public.remove_business_staff(membership uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare target public.business_users;
begin
  select * into target from public.business_users where id = membership;
  if target.id is null or not public.is_business_member(target.business_id, array['owner']) then raise exception 'Only the business owner can remove staff.'; end if;
  if target.role = 'owner' then raise exception 'The owner cannot be removed.'; end if;
  update public.business_users set status = 'revoked', updated_at = now() where id = membership;
end $$;

-- Business dashboard status update. Source is decided here, never by the caller.
create or replace function public.record_availability_update(
  target_business uuid, new_state text, target_service uuid default null, label text default null,
  update_note text default null, part_is_available boolean default null, part_name text default null, until_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  member_role text;
  new_id uuid;
  demo boolean;
begin
  select m.role into member_role from public.business_users m
  where m.business_id = target_business and m.user_id = auth.uid() and m.status = 'active';
  if member_role is null then raise exception 'Only this business''s owner or staff can update its status.'; end if;
  if new_state not in ('UNCONFIRMED', 'CONFIRMED', 'UNAVAILABLE', 'TEMPORARILY_CLOSED') then raise exception 'Choose a valid status.'; end if;
  if new_state = 'TEMPORARILY_CLOSED' and (until_at is null or until_at <= now() or until_at > now() + interval '30 days') then
    raise exception 'Choose when the business reopens (within 30 days).';
  end if;
  if until_at is not null and (until_at <= now() or until_at > now() + interval '30 days') then raise exception 'The end time must be in the next 30 days.'; end if;
  if target_service is not null and not exists (select 1 from public.services where id = target_service and business_id = target_business) then
    raise exception 'That service does not belong to this business.';
  end if;
  select is_demo into demo from public.businesses where id = target_business;
  insert into public.availability_updates (business_id, service_id, resource_label, state, source, part_available, part_label, note, submitted_by, submitter_role, valid_until, is_demo)
  values (target_business, target_service, nullif(trim(label), ''), new_state, 'business_dashboard', part_is_available, nullif(trim(part_name), ''),
    nullif(trim(update_note), ''), auth.uid(), member_role, until_at, demo)
  returning id into new_id;
  return new_id;
end $$;

-- Driver asks a business to confirm. Rate limited; no channel means no request (not a fake send).
create or replace function public.request_confirmation(
  target_business uuid, request_question text, target_service uuid default null,
  start_at timestamptz default null, end_at timestamptz default null, target_itinerary uuid default null, target_stop uuid default null
)
returns table (request_id uuid, request_status text, failure text)
language plpgsql security definer set search_path = ''
as $$
declare
  business public.businesses;
  new_id uuid;
  members integer;
begin
  if auth.uid() is null then raise exception 'Sign in to request a confirmation.'; end if;
  select * into business from public.businesses where id = target_business and listing_status in ('active', 'unclaimed');
  if business.id is null then raise exception 'Business not found.'; end if;
  if target_itinerary is not null and not exists (select 1 from public.itineraries where id = target_itinerary and user_id = auth.uid()) then
    raise exception 'Itinerary not found.';
  end if;
  if (select count(*) from public.verification_events where requested_by = auth.uid() and requested_at > now() - interval '1 hour') >= 10 then
    raise exception 'You have sent 10 confirmation requests in the last hour. Please wait.';
  end if;
  if exists (select 1 from public.verification_events where requested_by = auth.uid() and business_id = target_business
             and status = 'requested' and expires_at > now()) then
    raise exception 'You already have an open request with this business.';
  end if;
  select count(*) into members from public.business_users where business_id = target_business and status = 'active';
  insert into public.verification_events (business_id, service_id, requested_by, itinerary_id, itinerary_stop_id, channel, status, question,
    window_start, window_end, failure_reason, is_demo)
  values (target_business, target_service, auth.uid(), target_itinerary, target_stop, 'in_app',
    case when members = 0 then 'not_configured' else 'requested' end, trim(request_question), start_at, end_at,
    case when members = 0 then 'This business has not joined Chalo Yaar, so it cannot answer in the app. Call them to check.' end,
    business.is_demo)
  returning id into new_id;
  if members > 0 then
    perform public.notify_user(m.user_id, 'confirmation_request', 'New confirmation request', left(trim(request_question), 200),
      '/business?tab=requests', jsonb_build_object('request_id', new_id, 'business_id', target_business), business.is_demo)
    from public.business_users m where m.business_id = target_business and m.status = 'active';
  end if;
  return query select new_id, case when members = 0 then 'not_configured' else 'requested' end,
    case when members = 0 then 'This business has not joined Chalo Yaar, so it cannot answer in the app. Call them to check.' end;
end $$;

create or replace function public.respond_to_confirmation(target_request uuid, is_available boolean, response text default null, available_until timestamptz default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  request public.verification_events;
  member_role text;
  update_id uuid;
begin
  select * into request from public.verification_events where id = target_request;
  if request.id is null then raise exception 'Request not found.'; end if;
  select m.role into member_role from public.business_users m where m.business_id = request.business_id and m.user_id = auth.uid() and m.status = 'active';
  if member_role is null then raise exception 'Only this business can answer the request.'; end if;
  if request.status <> 'requested' or request.expires_at <= now() then raise exception 'This request is no longer open.'; end if;
  if available_until is not null and (available_until <= now() or available_until > now() + interval '7 days') then raise exception 'Choose a time in the next 7 days.'; end if;
  insert into public.availability_updates (business_id, service_id, state, source, note, submitted_by, submitter_role, valid_until, verification_event_id, is_demo)
  values (request.business_id, request.service_id, case when is_available then 'CONFIRMED' else 'UNAVAILABLE' end, 'business_dashboard',
    nullif(trim(response), ''), auth.uid(), member_role, available_until, request.id, request.is_demo)
  returning id into update_id;
  update public.verification_events set status = case when is_available then 'confirmed' else 'declined' end,
    responded_at = now(), responded_by = auth.uid(), response_note = nullif(trim(response), ''), availability_update_id = update_id
  where id = request.id;
  perform public.notify_user(request.requested_by, 'confirmation_update',
    (select name from public.businesses where id = request.business_id) || case when is_available then ': confirmed available' else ': not available' end,
    nullif(trim(response), ''), case when request.itinerary_id is null then '/app/places' else '/app/trips/' || request.itinerary_id end,
    jsonb_build_object('request_id', request.id, 'available', is_available), request.is_demo);
  return update_id;
end $$;

-- An admin records the result of a phone call; an unanswered call is recorded as no change.
create or replace function public.record_manual_confirmation(target_request uuid, outcome text, response text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  request public.verification_events;
  update_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin role is required.'; end if;
  if outcome not in ('available', 'unavailable', 'no_answer') then raise exception 'Choose available, unavailable or no answer.'; end if;
  select * into request from public.verification_events where id = target_request;
  if request.id is null or request.status not in ('requested', 'not_configured') then raise exception 'This request is no longer open.'; end if;
  if outcome = 'no_answer' then
    update public.verification_events set status = 'failed', channel = 'manual', failure_reason = 'No answer when called. This is not a confirmation.',
      responded_at = now(), responded_by = auth.uid(), response_note = nullif(trim(response), '') where id = request.id;
    return null;
  end if;
  insert into public.availability_updates (business_id, service_id, state, source, note, submitted_by, submitter_role, verification_event_id, is_demo)
  values (request.business_id, request.service_id, case when outcome = 'available' then 'CONFIRMED' else 'UNAVAILABLE' end, 'manual_confirmation',
    nullif(trim(response), ''), auth.uid(), 'admin', request.id, request.is_demo)
  returning id into update_id;
  update public.verification_events set status = case when outcome = 'available' then 'confirmed' else 'declined' end, channel = 'manual',
    responded_at = now(), responded_by = auth.uid(), response_note = nullif(trim(response), ''), availability_update_id = update_id where id = request.id;
  perform public.notify_user(request.requested_by, 'confirmation_update', 'A business was checked by phone', nullif(trim(response), ''),
    '/app/places', jsonb_build_object('request_id', request.id), request.is_demo);
  return update_id;
end $$;

create or replace function public.request_appointment(target_business uuid, start_at timestamptz, end_at timestamptz, target_service uuid default null, request_note text default null, target_stop uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_id uuid; business public.businesses;
begin
  if auth.uid() is null then raise exception 'Sign in to request an appointment.'; end if;
  select * into business from public.businesses where id = target_business and listing_status = 'active';
  if business.id is null then raise exception 'This business cannot take appointments in the app.'; end if;
  if start_at <= now() then raise exception 'Choose a future time.'; end if;
  if (select count(*) from public.appointment_requests where user_id = auth.uid() and status = 'pending') >= 5 then
    raise exception 'You have 5 appointment requests waiting. Please wait for answers.';
  end if;
  if target_stop is not null and not exists (
    select 1 from public.itinerary_stops s join public.itineraries i on i.id = s.itinerary_id where s.id = target_stop and i.user_id = auth.uid()
  ) then raise exception 'Stop not found.'; end if;
  insert into public.appointment_requests (user_id, business_id, service_id, itinerary_stop_id, window_start, window_end, note, expires_at, is_demo)
  values (auth.uid(), target_business, target_service, target_stop, start_at, end_at, nullif(trim(request_note), ''), least(start_at, now() + interval '2 hours'), business.is_demo)
  returning id into new_id;
  perform public.notify_user(m.user_id, 'appointment_request', 'New appointment request', null, '/business?tab=requests',
    jsonb_build_object('appointment_id', new_id), business.is_demo)
  from public.business_users m where m.business_id = target_business and m.status = 'active';
  return new_id;
end $$;

create or replace function public.decide_appointment(target_appointment uuid, decision text, decision_text text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare appointment public.appointment_requests; member_role text;
begin
  select * into appointment from public.appointment_requests where id = target_appointment;
  if appointment.id is null then raise exception 'Appointment not found.'; end if;
  select m.role into member_role from public.business_users m where m.business_id = appointment.business_id and m.user_id = auth.uid() and m.status = 'active';
  if member_role is null then raise exception 'Only this business can answer the request.'; end if;
  if decision not in ('confirmed', 'declined') then raise exception 'Choose confirm or decline.'; end if;
  if appointment.status <> 'pending' or appointment.expires_at <= now() then raise exception 'This request is no longer open.'; end if;
  update public.appointment_requests set status = decision, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(decision_text), ''), updated_at = now()
  where id = appointment.id;
  if decision = 'confirmed' then
    insert into public.availability_updates (business_id, service_id, state, source, note, submitted_by, submitter_role, valid_until, appointment_request_id, is_demo)
    values (appointment.business_id, appointment.service_id, 'CONFIRMED', 'appointment_accepted', nullif(trim(decision_text), ''), auth.uid(), member_role,
      appointment.window_end, appointment.id, appointment.is_demo);
  else
    perform public.flag_itineraries_for_business(appointment.business_id, 'appointment declined');
  end if;
  perform public.notify_user(appointment.user_id, 'appointment_update', case when decision = 'confirmed' then 'Appointment confirmed' else 'Appointment declined' end,
    nullif(trim(decision_text), ''), '/app/trips', jsonb_build_object('appointment_id', appointment.id), appointment.is_demo);
end $$;

-- Saves stops, a revision and metrics in one transaction.
create or replace function public.save_itinerary_revision(target_itinerary uuid, revision_reason text, stops jsonb, revision_metrics jsonb, expected_version integer)
returns integer language plpgsql security invoker set search_path = ''
as $$
declare
  next_revision integer;
  current_version integer;
begin
  select workflow_version into current_version from public.itineraries where id = target_itinerary and user_id = auth.uid() for update;
  if current_version is null then raise exception 'Itinerary not found.'; end if;
  if current_version <> expected_version then raise exception 'The trip changed in another window. Reload and try again.' using errcode = 'serialization_failure'; end if;
  if jsonb_typeof(stops) <> 'array' or jsonb_array_length(stops) > 25 then raise exception 'Up to 25 stops are supported.'; end if;
  select coalesce(max(revision), 0) + 1 into next_revision from public.itinerary_revisions where itinerary_id = target_itinerary;
  insert into public.itinerary_revisions (itinerary_id, revision, reason, snapshot, metrics)
  values (target_itinerary, next_revision, revision_reason, jsonb_build_object('stops', stops), coalesce(revision_metrics, '{}'::jsonb));
  update public.itinerary_stops s set
    position = (item ->> 'position')::integer,
    status = coalesce(item ->> 'status', s.status),
    planned_arrival_at = nullif(item ->> 'planned_arrival_at', '')::timestamptz,
    planned_departure_at = nullif(item ->> 'planned_departure_at', '')::timestamptz,
    updated_at = now()
  from jsonb_array_elements(stops) item
  where s.id = (item ->> 'id')::uuid and s.itinerary_id = target_itinerary;
  update public.itineraries set metrics = coalesce(revision_metrics, '{}'::jsonb), updated_at = now() where id = target_itinerary;
  return next_revision;
end $$;

-- Records a stop outcome; with consent, also a minimised feature snapshot.
create or replace function public.record_trip_outcome(
  target_stop uuid, stop_outcome text, cause text default null, outcome_note text default null,
  avoided_km numeric default null, avoided_kind text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  stop public.itinerary_stops;
  itinerary public.itineraries;
  evidence_update uuid;
  evidence_event uuid;
  evidence_appointment uuid;
  outcome_id uuid;
  consent boolean;
  state_at_departure text;
begin
  select s.* into stop from public.itinerary_stops s join public.itineraries i on i.id = s.itinerary_id where s.id = target_stop and i.user_id = auth.uid();
  if stop.id is null then raise exception 'Stop not found.'; end if;
  select * into itinerary from public.itineraries where id = stop.itinerary_id;
  if stop_outcome = 'avoided' then
    select id into evidence_update from public.availability_updates
      where business_id = stop.business_id and state in ('UNAVAILABLE', 'TEMPORARILY_CLOSED') and submitted_at >= itinerary.created_at - interval '1 day'
      order by submitted_at desc limit 1;
    select id into evidence_event from public.verification_events
      where itinerary_stop_id = stop.id and status = 'declined' order by responded_at desc limit 1;
    select id into evidence_appointment from public.appointment_requests
      where itinerary_stop_id = stop.id and status = 'declined' order by decided_at desc limit 1;
    if evidence_update is null and evidence_event is null and evidence_appointment is null then
      raise exception 'A trip counts as avoided only when the business reported it was unavailable or declined.';
    end if;
  end if;
  insert into public.trip_outcomes (itinerary_id, itinerary_stop_id, trip_id, outcome, failure_cause, evidence, availability_update_id, verification_event_id,
    appointment_request_id, avoided_round_trip_km, avoided_estimate_kind, km_per_litre_snapshot, price_pkr_per_litre_snapshot, note, recorded_by)
  values (stop.itinerary_id, stop.id, (select id from public.trips where itinerary_id = stop.itinerary_id), stop_outcome, cause,
    case when stop_outcome = 'avoided' then 'user_feedback' end, evidence_update, evidence_event, evidence_appointment,
    case when stop_outcome = 'avoided' then avoided_km end, case when stop_outcome = 'avoided' then avoided_kind end,
    case when stop_outcome = 'avoided' then itinerary.km_per_litre end, case when stop_outcome = 'avoided' then itinerary.price_pkr_per_litre end,
    nullif(trim(outcome_note), ''), auth.uid())
  on conflict (itinerary_stop_id) do update set outcome = excluded.outcome, failure_cause = excluded.failure_cause, evidence = excluded.evidence,
    availability_update_id = excluded.availability_update_id, verification_event_id = excluded.verification_event_id,
    appointment_request_id = excluded.appointment_request_id, avoided_round_trip_km = excluded.avoided_round_trip_km,
    avoided_estimate_kind = excluded.avoided_estimate_kind, km_per_litre_snapshot = excluded.km_per_litre_snapshot,
    price_pkr_per_litre_snapshot = excluded.price_pkr_per_litre_snapshot, note = excluded.note, recorded_at = now()
  returning id into outcome_id;
  update public.itinerary_stops set status = case stop_outcome when 'success' then 'visited' when 'failed' then 'failed' else 'skipped' end, updated_at = now()
  where id = stop.id;

  select data_sharing_consent into consent from public.user_preferences where user_id = auth.uid();
  if coalesce(consent, false) and stop.business_id is not null then
    select a.state into state_at_departure from public.current_availability(stop.business_id, stop.service_id, coalesce(itinerary.depart_at, now())) a;
    insert into public.visit_feature_snapshots (category, weekday, hour_bucket, availability_state_at_departure, confirmation_age_minutes,
      confirmation_response_minutes, service_ready, prior_confirmed_visits, prior_successful_visits, outcome, failure_cause)
    select coalesce(stop.category, b.category), extract(dow from coalesce(stop.planned_arrival_at, now()) at time zone 'Asia/Karachi')::smallint,
      extract(hour from coalesce(stop.planned_arrival_at, now()) at time zone 'Asia/Karachi')::smallint, state_at_departure,
      (select extract(epoch from (coalesce(itinerary.depart_at, now()) - u.submitted_at)) / 60 from public.availability_updates u
        where u.business_id = stop.business_id and u.state = 'CONFIRMED' order by u.submitted_at desc limit 1)::integer,
      (select extract(epoch from (e.responded_at - e.requested_at)) / 60 from public.verification_events e
        where e.itinerary_stop_id = stop.id and e.responded_at is not null order by e.responded_at desc limit 1)::integer,
      (select u.part_available from public.availability_updates u where u.business_id = stop.business_id order by u.submitted_at desc limit 1),
      (select count(*) from public.trip_outcomes o join public.itinerary_stops s2 on s2.id = o.itinerary_stop_id where s2.business_id = stop.business_id and o.id <> outcome_id),
      (select count(*) from public.trip_outcomes o join public.itinerary_stops s2 on s2.id = o.itinerary_stop_id where s2.business_id = stop.business_id and o.outcome = 'success' and o.id <> outcome_id),
      stop_outcome, cause
    from public.businesses b where b.id = stop.business_id;
  end if;
  return outcome_id;
end $$;

create or replace view public.monthly_trip_summary with (security_invoker = true) as
with plans as (
  select i.user_id, i.workflow_state, t.id as trip_id, t.status as trip_status, t.planned_distance_km, t.actual_distance_km,
    t.estimated_fuel_litres, t.estimated_fuel_cost_pkr,
    date_trunc('month', coalesce(t.started_at, i.created_at) at time zone 'Asia/Karachi')::date as month
  from public.itineraries i
  left join public.trips t on t.itinerary_id = i.id
), plan_totals as (
  select user_id, month,
    count(*) filter (where workflow_state <> 'CANCELLED') as planned_itineraries,
    count(trip_id) filter (where trip_status = 'completed') as completed_trips,
    coalesce(sum(planned_distance_km), 0) as planned_distance_km,
    sum(actual_distance_km) as actual_distance_km,
    coalesce(sum(estimated_fuel_litres), 0) as estimated_fuel_litres,
    coalesce(sum(estimated_fuel_cost_pkr), 0) as estimated_fuel_cost_pkr
  from plans group by user_id, month
), outcome_totals as (
  select i.user_id, date_trunc('month', o.recorded_at at time zone 'Asia/Karachi')::date as month,
    count(*) filter (where o.outcome = 'failed') as failed_visits,
    count(*) filter (where o.outcome = 'avoided') as avoided_trips,
    coalesce(sum(o.avoided_round_trip_km) filter (where o.outcome = 'avoided'), 0) as avoided_distance_km,
    coalesce(sum(o.avoided_fuel_cost_pkr) filter (where o.outcome = 'avoided'), 0) as realized_savings_pkr
  from public.trip_outcomes o
  join public.itineraries i on i.id = o.itinerary_id
  group by i.user_id, date_trunc('month', o.recorded_at at time zone 'Asia/Karachi')::date
)
select coalesce(p.user_id, o.user_id) as user_id, coalesce(p.month, o.month) as month,
  coalesce(p.planned_itineraries, 0) as planned_itineraries, coalesce(p.completed_trips, 0) as completed_trips,
  coalesce(p.planned_distance_km, 0) as planned_distance_km, p.actual_distance_km,
  coalesce(p.estimated_fuel_litres, 0) as estimated_fuel_litres, coalesce(p.estimated_fuel_cost_pkr, 0) as estimated_fuel_cost_pkr,
  coalesce(o.failed_visits, 0) as failed_visits, coalesce(o.avoided_trips, 0) as avoided_trips,
  coalesce(o.avoided_distance_km, 0) as avoided_distance_km, coalesce(o.realized_savings_pkr, 0) as realized_savings_pkr
from plan_totals p
full join outcome_totals o on o.user_id = p.user_id and o.month = p.month;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.business_users enable row level security;
alter table public.services enable row level security;
alter table public.business_hours enable row level security;
alter table public.verification_policies enable row level security;
alter table public.verification_events enable row level security;
alter table public.appointment_requests enable row level security;
alter table public.availability_updates enable row level security;
alter table public.user_preferences enable row level security;
alter table public.fuel_price_settings enable row level security;
alter table public.itineraries enable row level security;
alter table public.itinerary_stops enable row level security;
alter table public.itinerary_revisions enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.pending_actions enable row level security;
alter table public.route_estimates enable row level security;
alter table public.trips enable row level security;
alter table public.trip_outcomes enable row level security;
alter table public.visit_feature_snapshots enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.businesses, public.business_users, public.services, public.business_hours, public.verification_policies,
  public.verification_events, public.appointment_requests, public.availability_updates, public.user_preferences,
  public.fuel_price_settings, public.itineraries, public.itinerary_stops, public.itinerary_revisions, public.workflow_steps,
  public.pending_actions, public.route_estimates, public.trips, public.trip_outcomes, public.visit_feature_snapshots,
  public.audit_logs from anon, authenticated;
revoke all on public.monthly_trip_summary from anon;

-- Public directory data.
grant select on public.businesses, public.services, public.business_hours, public.verification_policies to anon, authenticated;
create policy "Public listings and own businesses" on public.businesses for select to anon, authenticated
  using (listing_status in ('active', 'unclaimed') or public.is_business_member(id) or public.is_admin());
grant update (name, description, phone, address, latitude, longitude, place_id, published_hours_text, updated_at) on public.businesses to authenticated;
create policy "Owners edit their business" on public.businesses for update to authenticated
  using (public.is_business_member(id, array['owner'])) with check (public.is_business_member(id, array['owner']));
create policy "Admins edit businesses" on public.businesses for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Public services" on public.services for select to anon, authenticated
  using (public.business_is_public(business_id) or public.is_business_member(business_id) or public.is_admin());
grant insert (business_id, name, tag, description, duration_minutes, price_note, is_active), update (name, tag, description, duration_minutes, price_note, is_active, updated_at), delete on public.services to authenticated;
create policy "Members manage services" on public.services for all to authenticated
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

create policy "Public hours" on public.business_hours for select to anon, authenticated
  using (public.business_is_public(business_id) or public.is_business_member(business_id) or public.is_admin());
grant insert (business_id, weekday, opens_at, closes_at, closes_next_day, is_closed, valid_on, source), update (opens_at, closes_at, closes_next_day, is_closed, valid_on, updated_at), delete on public.business_hours to authenticated;
create policy "Members manage hours" on public.business_hours for all to authenticated
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id) and source = 'owner');

create policy "Policies are public" on public.verification_policies for select to anon, authenticated using (true);
grant update (freshness_minutes, updated_at) on public.verification_policies to authenticated;
create policy "Admins edit policies" on public.verification_policies for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.business_users to authenticated;
create policy "See own and same-business memberships" on public.business_users for select to authenticated
  using (user_id = (select auth.uid()) or public.is_business_member(business_id) or public.is_admin());

grant select on public.availability_updates to authenticated;
create policy "Members and admins read raw updates" on public.availability_updates for select to authenticated
  using (public.is_business_member(business_id) or public.is_admin());

grant select on public.verification_events to authenticated;
create policy "Requester, business and admins read requests" on public.verification_events for select to authenticated
  using (requested_by = (select auth.uid()) or public.is_business_member(business_id) or public.is_admin());

grant select on public.appointment_requests to authenticated;
grant update (status, updated_at) on public.appointment_requests to authenticated;
create policy "Requester and business read appointments" on public.appointment_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_business_member(business_id) or public.is_admin());
create policy "Requester cancels appointment" on public.appointment_requests for update to authenticated
  using (user_id = (select auth.uid()) and status = 'pending') with check (user_id = (select auth.uid()) and status = 'cancelled');

grant select, insert, update on public.user_preferences to authenticated;
create policy "Own preferences" on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert on public.fuel_price_settings to authenticated;
create policy "Own fuel prices" on public.fuel_price_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, delete on public.itineraries to authenticated;
grant update (title, request_text, workflow_state, origin_label, origin_latitude, origin_longitude, return_to_origin, depart_at, vehicle_id,
  km_per_litre, price_pkr_per_litre, max_trip_minutes, preferred_max_cost_pkr, weights, metrics, estimate_kind, optimality,
  needs_recalculation, recalculation_reason, approved_at, approved_revision, risk_acknowledged_at, updated_at) on public.itineraries to authenticated;
create policy "Own itineraries" on public.itineraries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, delete on public.itinerary_stops to authenticated;
grant update (position, user_position, errand_label, category, service_query, business_id, service_id, place_label, latitude, longitude, mandatory,
  deadline_at, deadline_kind, preferred_from, preferred_to, service_minutes, appointment_request_id, planned_arrival_at, planned_departure_at,
  status, alternative_of, updated_at) on public.itinerary_stops to authenticated;
create policy "Own itinerary stops" on public.itinerary_stops for all to authenticated
  using (exists (select 1 from public.itineraries i where i.id = itinerary_id and i.user_id = (select auth.uid())))
  with check (exists (select 1 from public.itineraries i where i.id = itinerary_id and i.user_id = (select auth.uid())));

grant select, insert on public.itinerary_revisions, public.workflow_steps to authenticated;
grant update (status, finished_at, output_summary, error, to_state) on public.workflow_steps to authenticated;
create policy "Own revisions" on public.itinerary_revisions for all to authenticated
  using (exists (select 1 from public.itineraries i where i.id = itinerary_id and i.user_id = (select auth.uid())))
  with check (exists (select 1 from public.itineraries i where i.id = itinerary_id and i.user_id = (select auth.uid())));
create policy "Own workflow steps" on public.workflow_steps for all to authenticated
  using (exists (select 1 from public.itineraries i where i.id = itinerary_id and i.user_id = (select auth.uid())))
  with check (exists (select 1 from public.itineraries i where i.id = itinerary_id and i.user_id = (select auth.uid())));

grant select, insert on public.pending_actions to authenticated;
grant update (status, approved_at, executed_at, result) on public.pending_actions to authenticated;
create policy "Own pending actions" on public.pending_actions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert on public.trips to authenticated;
grant update (status, started_at, ended_at, actual_distance_km, odometer_start_km, odometer_end_km, updated_at) on public.trips to authenticated;
create policy "Own trips" on public.trips for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.trip_outcomes to authenticated;
create policy "Own outcomes" on public.trip_outcomes for select to authenticated
  using (exists (select 1 from public.itineraries i where i.id = itinerary_id and i.user_id = (select auth.uid())));

grant select on public.monthly_trip_summary to authenticated;

grant select on public.audit_logs to authenticated;
create policy "Business members and admins read audit" on public.audit_logs for select to authenticated
  using ((business_id is not null and public.is_business_member(business_id)) or public.is_admin());

grant select on public.visit_feature_snapshots to authenticated;
create policy "Admins read feature snapshots" on public.visit_feature_snapshots for select to authenticated using (public.is_admin());

-- Function access
revoke all on function public.register_business(text, text, double precision, double precision, text, text, text, uuid) from public;
revoke all on function public.claim_business(uuid, text) from public;
revoke all on function public.review_business(uuid, text) from public;
revoke all on function public.review_business_claim(uuid, boolean) from public;
revoke all on function public.add_business_staff(uuid, text) from public;
revoke all on function public.remove_business_staff(uuid) from public;
revoke all on function public.record_availability_update(uuid, text, uuid, text, text, boolean, text, timestamptz) from public;
revoke all on function public.request_confirmation(uuid, text, uuid, timestamptz, timestamptz, uuid, uuid) from public;
revoke all on function public.respond_to_confirmation(uuid, boolean, text, timestamptz) from public;
revoke all on function public.record_manual_confirmation(uuid, text, text) from public;
revoke all on function public.request_appointment(uuid, timestamptz, timestamptz, uuid, text, uuid) from public;
revoke all on function public.decide_appointment(uuid, text, text) from public;
revoke all on function public.save_itinerary_revision(uuid, text, jsonb, jsonb, integer) from public;
revoke all on function public.record_trip_outcome(uuid, text, text, text, numeric, text) from public;
grant execute on function public.register_business(text, text, double precision, double precision, text, text, text, uuid),
  public.claim_business(uuid, text), public.review_business(uuid, text), public.review_business_claim(uuid, boolean),
  public.add_business_staff(uuid, text), public.remove_business_staff(uuid),
  public.record_availability_update(uuid, text, uuid, text, text, boolean, text, timestamptz),
  public.request_confirmation(uuid, text, uuid, timestamptz, timestamptz, uuid, uuid),
  public.respond_to_confirmation(uuid, boolean, text, timestamptz), public.record_manual_confirmation(uuid, text, text),
  public.request_appointment(uuid, timestamptz, timestamptz, uuid, text, uuid), public.decide_appointment(uuid, text, text),
  public.save_itinerary_revision(uuid, text, jsonb, jsonb, integer),
  public.record_trip_outcome(uuid, text, text, text, numeric, text) to authenticated;
revoke all on function public.audit_row() from public, anon, authenticated;
revoke all on function public.on_availability_update() from public, anon, authenticated;

alter publication supabase_realtime add table public.itineraries, public.verification_events, public.appointment_requests;
