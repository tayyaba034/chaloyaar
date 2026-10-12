-- Shared foundations: place gazetteer (free geocoding), in-app notifications, saved places.
create extension if not exists pg_trgm with schema extensions;

-- S1: Places gazetteer. Imported from OpenStreetMap by scripts/import-places.mjs (service role only).
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name_en text not null check (char_length(trim(name_en)) between 1 and 160),
  name_ur text check (name_ur is null or char_length(trim(name_ur)) between 1 and 160),
  name_roman text check (name_roman is null or char_length(trim(name_roman)) between 1 and 160),
  kind text not null check (kind in ('area', 'neighbourhood', 'landmark', 'road', 'market', 'hospital', 'clinic', 'school', 'office', 'mosque', 'park', 'transport', 'other')),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  location extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude::double precision, latitude::double precision), 4326)::extensions.geography
  ) stored,
  search_text text generated always as (
    lower(name_en || ' ' || coalesce(name_ur, '') || ' ' || coalesce(name_roman, ''))
  ) stored,
  source text not null default 'osm' check (source in ('osm', 'admin', 'demo')),
  osm_type text check (osm_type is null or osm_type in ('node', 'way', 'relation')),
  osm_id bigint,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (osm_type, osm_id)
);
create index if not exists places_location_gix on public.places using gist (location);
create index if not exists places_search_trgm on public.places using gin (search_text extensions.gin_trgm_ops);
alter table public.places enable row level security;
revoke all on public.places from anon, authenticated;
grant select on public.places to anon, authenticated;
drop policy if exists "Places are public" on public.places;
create policy "Places are public" on public.places for select to anon, authenticated using (is_demo = false);

create or replace function public.search_places(
  query text,
  near_latitude double precision default null,
  near_longitude double precision default null,
  max_results integer default 8
)
returns table (
  id uuid, name_en text, name_ur text, name_roman text, kind text,
  latitude double precision, longitude double precision, match_score real, distance_km double precision
)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  needle text := lower(trim(coalesce(query, '')));
  pattern text;
  origin extensions.geography;
begin
  if char_length(needle) not between 2 and 80 then raise exception 'Search text must be 2 to 80 characters.'; end if;
  if max_results is null or max_results not between 1 and 20 then raise exception 'Result limit must be 1 to 20.'; end if;
  if (near_latitude is null) <> (near_longitude is null)
     or (near_latitude is not null and (near_latitude not between -90 and 90 or near_longitude not between -180 and 180)) then
    raise exception 'Choose a valid map location.';
  end if;
  if near_latitude is not null then
    origin := extensions.st_setsrid(extensions.st_makepoint(near_longitude, near_latitude), 4326)::extensions.geography;
  end if;
  pattern := '%' || replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, p.name_en, p.name_ur, p.name_roman, p.kind,
      p.latitude::double precision, p.longitude::double precision,
      greatest(extensions.word_similarity(needle, p.search_text), case when p.search_text like pattern then 1 else 0 end)::real,
      case when origin is null then null else extensions.st_distance(p.location, origin) / 1000.0 end
    from public.places p
    where p.is_demo = false
      and (p.search_text like pattern or extensions.word_similarity(needle, p.search_text) >= 0.4)
    order by 8 desc, 9 asc nulls last, p.name_en
    limit max_results;
end $$;
revoke all on function public.search_places(text, double precision, double precision, integer) from public;
grant execute on function public.search_places(text, double precision, double precision, integer) to anon, authenticated;

-- S2: In-app notifications. Written only by trusted database functions; owners read and mark read.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z_]{2,39}$'),
  title text not null check (char_length(trim(title)) between 1 and 160),
  body text check (body is null or char_length(body) <= 600),
  link text check (link is null or (link ~ '^/[A-Za-z0-9/_?=&.%-]*$' and char_length(link) <= 300)),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users mark own notifications read" on public.notifications;
create policy "Users mark own notifications read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter publication supabase_realtime add table public.notifications;

-- Internal helper for later triggers and functions; not callable by API roles.
create or replace function public.notify_user(
  target_user uuid, notification_kind text, notification_title text,
  notification_body text default null, notification_link text default null,
  notification_payload jsonb default '{}'::jsonb, demo boolean default false
)
returns uuid language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link, payload, is_demo)
  values (target_user, notification_kind, notification_title, notification_body, notification_link, coalesce(notification_payload, '{}'::jsonb), demo)
  returning id;
$$;
revoke all on function public.notify_user(uuid, text, text, text, text, jsonb, boolean) from public, anon, authenticated;

-- S5: Saved places (home, work, custom) for trip origins and alerts.
create table if not exists public.driver_saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 60),
  kind text not null default 'custom' check (kind in ('home', 'work', 'custom')),
  place_id uuid references public.places(id) on delete set null,
  address text check (address is null or char_length(address) <= 200),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  location extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude::double precision, latitude::double precision), 4326)::extensions.geography
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists driver_saved_places_one_home_work on public.driver_saved_places (user_id, kind) where kind in ('home', 'work');
create index if not exists driver_saved_places_owner_idx on public.driver_saved_places (user_id, created_at);
alter table public.driver_saved_places enable row level security;
revoke all on public.driver_saved_places from anon, authenticated;
grant select, delete on public.driver_saved_places to authenticated;
grant insert (user_id, label, kind, place_id, address, latitude, longitude) on public.driver_saved_places to authenticated;
grant update (label, kind, place_id, address, latitude, longitude, updated_at) on public.driver_saved_places to authenticated;
drop policy if exists "Users manage own saved places" on public.driver_saved_places;
create policy "Users manage own saved places" on public.driver_saved_places for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.limit_saved_places()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.driver_saved_places where user_id = new.user_id) >= 20 then
    raise exception 'You can save up to 20 places.';
  end if;
  return new;
end $$;
drop trigger if exists driver_saved_places_limit on public.driver_saved_places;
create trigger driver_saved_places_limit before insert on public.driver_saved_places
  for each row execute function public.limit_saved_places();
