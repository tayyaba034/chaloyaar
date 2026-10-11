-- All fixtures are temporary. Run with supabase db query --linked --file supabase/tests/station_discovery.sql.
begin;
insert into public.stations(id, name, location, supported_fuels, source, verification_status, is_demo)
values
 ('55555555-5555-4555-8555-555555555501','QA nearest',extensions.st_setsrid(extensions.st_makepoint(0,0),4326)::extensions.geography,array['petrol'],'QA','unverified',false),
 ('55555555-5555-4555-8555-555555555502','QA unknown fuels',extensions.st_setsrid(extensions.st_makepoint(0.01,0),4326)::extensions.geography,array[]::text[],'QA','unverified',false),
 ('55555555-5555-4555-8555-555555555503','QA demo',extensions.st_setsrid(extensions.st_makepoint(0,0),4326)::extensions.geography,array['petrol'],'QA','unverified',true),
 ('55555555-5555-4555-8555-555555555504','QA rejected',extensions.st_setsrid(extensions.st_makepoint(0,0),4326)::extensions.geography,array['petrol'],'QA','rejected',false),
 ('55555555-5555-4555-8555-555555555505','QA outside',extensions.st_setsrid(extensions.st_makepoint(1,0),4326)::extensions.geography,array['petrol'],'QA','unverified',false);
insert into public.stations(name, location, source)
select 'QA later ' || n, extensions.st_setsrid(extensions.st_makepoint(0.02+n*0.0001,0),4326)::extensions.geography,'QA' from generate_series(1,110) n;
insert into public.availability_reports(station_id, fuel_type, reported_status, source_type, moderation_status, reported_at, expires_at, is_demo)
values
 ('55555555-5555-4555-8555-555555555501','petrol','available','station','approved',now()-interval '3 hours',now()-interval '1 hour',false),
 ('55555555-5555-4555-8555-555555555501','petrol','unavailable','user','pending',now()-interval '1 minute',now()+interval '1 hour',false),
 ('55555555-5555-4555-8555-555555555501','petrol','unavailable','station','approved',now()+interval '1 hour',now()+interval '2 hours',false);
set local role anon;
do $$
declare first_id uuid; result_count integer;
begin
  select id into first_id from public.nearby_stations(0,0,15,null) limit 1;
  if first_id <> '55555555-5555-4555-8555-555555555501' then raise exception 'FAIL: nearest order'; end if;
  select count(*) into result_count from public.nearby_stations(0,0,15,null);
  if result_count <> 50 then raise exception 'FAIL: search beyond 100 records / result limit'; end if;
  if (select count(*) from public.nearby_stations(0,0,15,'petrol')) <> 1 then raise exception 'FAIL: demo/rejected/outside/unknown fuel filters'; end if;
  if (select count(*) from public.nearby_stations(0,0,1,null)) <> 1 then raise exception 'FAIL: radius'; end if;
  if exists(select 1 from public.station_latest_reports(array['55555555-5555-4555-8555-555555555501']::uuid[],'petrol') where expires_at > now() or source_type <> 'station') then raise exception 'FAIL: pending/future reports leaked'; end if;
  if (select count(*) from public.station_latest_reports(array['55555555-5555-4555-8555-555555555501']::uuid[],'petrol')) <> 1 then raise exception 'FAIL: expired evidence should survive as stale'; end if;
  begin
    perform public.nearby_stations(91,0,15,null);
    raise exception 'FAIL: invalid coordinates accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.admin_update_station_details('55555555-5555-4555-8555-555555555501','Bad',null,null,array['petrol'],'verified',0,0,'QA',null,true);
    raise exception 'FAIL: anonymous verification';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
insert into auth.users(id,email) values ('55555555-5555-4555-8555-555555555510','station-review-qa@example.invalid');
insert into public.profiles(id,role) values ('55555555-5555-4555-8555-555555555510','admin') on conflict(id) do update set role=excluded.role;
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555510","role":"authenticated"}',true);
set local role authenticated;
do $$
declare reviewed public.stations;
begin
  begin
    perform public.admin_update_station_details('55555555-5555-4555-8555-555555555501','QA reviewed',null,'QA address',array['petrol'],'verified',0.001,0.001,'Manual QA','https://example.invalid',false);
    raise exception 'FAIL: verification without human check';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  reviewed := public.admin_update_station_details('55555555-5555-4555-8555-555555555501','QA reviewed',null,'QA address',array['petrol'],'verified',0.001,0.001,'Manual QA','https://example.invalid',true);
  if reviewed.verified_at is null or reviewed.source <> 'Manual QA' then raise exception 'FAIL: verification time/source'; end if;
end;
$$;
reset role;
do $$ begin
  if not exists(select 1 from public.admin_audit_log where entity_id='55555555-5555-4555-8555-555555555501' and action='review_station_details') then raise exception 'FAIL: review audit'; end if;
end; $$;
select 'PASS: nearby ordering, radius, capped results, filters, stale evidence, verification permissions and audit' as result;
rollback;
