-- Synthetic fixtures only. Run with: npm run test:sql shared_places
begin;
insert into auth.users(id, email) values
  ('a1111111-1111-4111-8111-111111111101', 'user-a@example.invalid'),
  ('a1111111-1111-4111-8111-111111111102', 'user-b@example.invalid');
insert into public.profiles(id, role) values
  ('a1111111-1111-4111-8111-111111111101', 'driver'),
  ('a1111111-1111-4111-8111-111111111102', 'driver')
on conflict (id) do update set role = excluded.role;

insert into public.places(id, name_en, name_ur, name_roman, kind, latitude, longitude, osm_type, osm_id) values
  ('b1111111-1111-4111-8111-111111111101', 'D Ground', 'ڈی گراؤنڈ', 'D Ground', 'area', 31.4093, 73.112, 'node', 1),
  ('b1111111-1111-4111-8111-111111111102', 'Susan Road', 'سوسن روڈ', 'Susan Road', 'road', 31.4077, 73.0912, 'way', 2),
  ('b1111111-1111-4111-8111-111111111103', 'Clock Tower', 'گھنٹہ گھر', 'Ghanta Ghar', 'landmark', 31.4181, 73.0791, 'node', 3);
insert into public.places(name_en, kind, latitude, longitude, is_demo, source) values ('Demo Ground', 'area', 31.40, 73.10, true, 'demo');

select qa.assert((select st_y(location::geometry) from public.places where osm_id = 1) between 31.409 and 31.410, 'generated geography');

select qa.login(null);
select qa.assert((select name_en from public.search_places('ground') limit 1) = 'D Ground', 'search by English, demo hidden');
select qa.assert((select count(*) from public.search_places('ground')) = 1, 'demo place excluded');
select qa.assert((select name_en from public.search_places('گھنٹہ')) = 'Clock Tower', 'search by Urdu');
select qa.assert((select name_en from public.search_places('ghanta')) = 'Clock Tower', 'search by Roman Urdu');
select qa.assert((select count(*) from public.search_places('susan rd')) >= 1, 'fuzzy match');
select qa.assert((select distance_km from public.search_places('susan', 31.4077, 73.0912)) < 0.01, 'distance from origin');
select qa.assert((select count(*) from public.search_places('100%_')) = 0, 'LIKE wildcards are escaped');
do $$ begin
  perform public.search_places('a');
  raise exception 'FAIL: short query accepted';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;
do $$ begin
  insert into public.places(name_en, kind, latitude, longitude) values ('Hack', 'area', 1, 1);
  raise exception 'FAIL: anon inserted a place';
exception when insufficient_privilege then null;
end $$;
select qa.logout();

-- Notifications: only trusted functions write; owners read and mark read.
select public.notify_user('a1111111-1111-4111-8111-111111111101', 'confirmation_update', 'Workshop confirmed', null, '/app/trips');
select public.notify_user('a1111111-1111-4111-8111-111111111102', 'confirmation_update', 'Other user note');
select qa.login('a1111111-1111-4111-8111-111111111101');
select qa.assert((select count(*) from public.notifications) = 1, 'user sees only own notifications');
update public.notifications set read_at = now();
select qa.assert((select count(*) from public.notifications where read_at is not null) = 1, 'mark own read');
do $$ begin
  perform public.notify_user('a1111111-1111-4111-8111-111111111101', 'spam', 'Self notify');
  raise exception 'FAIL: API role called notify_user';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.notifications set title = 'changed';
  raise exception 'FAIL: title updatable';
exception when insufficient_privilege then null;
end $$;
select qa.logout();
select qa.assert((select count(*) from public.notifications where read_at is null and user_id = 'a1111111-1111-4111-8111-111111111102') = 1, 'other user untouched');
do $$ begin
  insert into public.notifications(user_id, kind, title, link) values ('a1111111-1111-4111-8111-111111111101', 'bad_link', 'x', 'https://evil.example');
  raise exception 'FAIL: external link accepted';
exception when check_violation then null;
end $$;

-- Saved places: owner only, one home, max 20.
select qa.login('a1111111-1111-4111-8111-111111111101');
insert into public.driver_saved_places(user_id, label, kind, latitude, longitude) values ('a1111111-1111-4111-8111-111111111101', 'Home', 'home', 31.41, 73.08);
do $$ begin
  insert into public.driver_saved_places(user_id, label, kind, latitude, longitude) values ('a1111111-1111-4111-8111-111111111101', 'Home 2', 'home', 31.42, 73.08);
  raise exception 'FAIL: second home accepted';
exception when unique_violation then null;
end $$;
do $$ begin
  insert into public.driver_saved_places(user_id, label, latitude, longitude) values ('a1111111-1111-4111-8111-111111111102', 'Not mine', 31.4, 73.1);
  raise exception 'FAIL: saved place for another user';
exception when insufficient_privilege then null;
end $$;
insert into public.driver_saved_places(user_id, label, latitude, longitude)
  select 'a1111111-1111-4111-8111-111111111101', 'Spot ' || n, 31.4, 73.1 from generate_series(1, 19) n;
do $$ begin
  insert into public.driver_saved_places(user_id, label, latitude, longitude) values ('a1111111-1111-4111-8111-111111111101', 'Too many', 31.4, 73.1);
  raise exception 'FAIL: 21st place accepted';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;
select qa.logout();
select qa.login('a1111111-1111-4111-8111-111111111102');
select qa.assert((select count(*) from public.driver_saved_places) = 0, 'saved places are private');
select qa.logout();
rollback;
