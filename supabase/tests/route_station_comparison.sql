-- Temporary fixtures only; all changes are rolled back.
begin;
insert into auth.users(id,email) values ('66666666-6666-4666-8666-666666666601','route-qa@example.invalid');
insert into public.stations(id,name,location,supported_fuels,source,verification_status,is_demo) values
 ('66666666-6666-4666-8666-666666666610','QA along distant route',extensions.st_setsrid(extensions.st_makepoint(0.4,0),4326)::extensions.geography,array['petrol'],'QA','unverified',false),
 ('66666666-6666-4666-8666-666666666611','QA no fuel metadata',extensions.st_setsrid(extensions.st_makepoint(0.3,0),4326)::extensions.geography,array[]::text[],'QA','unverified',false),
 ('66666666-6666-4666-8666-666666666612','QA outside corridor',extensions.st_setsrid(extensions.st_makepoint(0.3,0.1),4326)::extensions.geography,array['petrol'],'QA','unverified',false),
 ('66666666-6666-4666-8666-666666666613','QA demo',extensions.st_setsrid(extensions.st_makepoint(0.2,0),4326)::extensions.geography,array['petrol'],'QA','unverified',true);
insert into public.fuel_prices(fuel_type,price_per_litre,source_name,effective_at,expires_at,verified_at,is_demo,station_id) values
 ('petrol',300,'QA current reference',now()-interval '1 hour',now()+interval '1 hour',now()-interval '1 hour',false,null),
 ('petrol',299,'QA expired station price',now()-interval '1 hour',now()-interval '1 minute',now()-interval '1 hour',false,'66666666-6666-4666-8666-666666666610'),
 ('petrol',1,'QA demo station price',now()-interval '1 hour',now()+interval '1 hour',now()-interval '1 hour',true,'66666666-6666-4666-8666-666666666610');
select set_config('request.jwt.claims','{"sub":"66666666-6666-4666-8666-666666666601","role":"authenticated"}',true);
set local role authenticated;
do $$ declare result record; begin
  select * into result from public.route_stations('{"type":"LineString","coordinates":[[0,0],[0.5,0]]}', 'petrol');
  if result.id is distinct from '66666666-6666-4666-8666-666666666610'::uuid then raise exception 'FAIL: distant along-route station'; end if;
  if result.price->>'source' <> 'QA current reference' then raise exception 'FAIL: expired/demo pricing'; end if;
  if (select count(*) from public.route_stations('{"type":"LineString","coordinates":[[0,0],[0.5,0]]}', 'petrol'))<>1 then raise exception 'FAIL: corridor/fuel/demo filters'; end if;
end; $$;
reset role;
insert into public.fuel_prices(fuel_type,price_per_litre,source_name,effective_at,expires_at,verified_at,is_demo,station_id)
values('petrol',290,'QA confirmed station figure',now()-interval '1 hour',now()+interval '1 hour',now()-interval '1 hour',false,'66666666-6666-4666-8666-666666666610');
set local role authenticated;
do $$ begin
  if (select price->>'source' from public.route_stations('{"type":"LineString","coordinates":[[0,0],[0.5,0]]}', 'petrol')) <> 'QA confirmed station figure' then raise exception 'FAIL: station price preference'; end if;
end; $$;
reset role;
update public.fuel_prices set expires_at=now()-interval '1 second' where source_name like 'QA %' and effective_at<now()-interval '1 second';
set local role authenticated;
do $$ begin
  if (select price from public.route_stations('{"type":"LineString","coordinates":[[0,0],[0.5,0]]}', 'petrol')) is not null then raise exception 'FAIL: no valid price should be null'; end if;
end; $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.route_stations('{"type":"LineString","coordinates":[[0,0],[0.5,0]]}', 'petrol');
    raise exception 'FAIL: anonymous route RPC';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
select 'PASS: route corridor beyond origin radius, fuel eligibility, dated pricing, scope preference and permissions' as result;
rollback;
