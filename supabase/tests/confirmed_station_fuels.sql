-- Apply the reviewed migration to isolated staging first. Never run on live data.
begin;
insert into public.stations(name, location, source, supported_fuels, verification_status, verified_at)
select 'QA unverified lead ' || n,
  extensions.st_setsrid(extensions.st_makepoint(0.00001*n,0),4326)::extensions.geography,
  'Synthetic staging fixture', array['petrol'], 'unverified', null
from generate_series(1,110) n;
insert into public.stations(id,name,location,source,supported_fuels,verification_status,verified_at)
values
 ('55555555-5555-4555-8555-555555555601','QA reviewed fuel',extensions.st_setsrid(extensions.st_makepoint(0.01,0),4326)::extensions.geography,'Synthetic staging fixture',array['petrol'],'verified',now()-interval '1 day'),
 ('55555555-5555-4555-8555-555555555602','QA unknown fuel',extensions.st_setsrid(extensions.st_makepoint(0.01,0),4326)::extensions.geography,'Synthetic staging fixture',array[]::text[],'verified',now()-interval '1 day'),
 ('55555555-5555-4555-8555-555555555603','QA missing date',extensions.st_setsrid(extensions.st_makepoint(0.01,0),4326)::extensions.geography,'Synthetic staging fixture',array['petrol'],'verified',null),
 ('55555555-5555-4555-8555-555555555604','QA future date',extensions.st_setsrid(extensions.st_makepoint(0.01,0),4326)::extensions.geography,'Synthetic staging fixture',array['petrol'],'verified',now()+interval '1 day');
set local role anon;
do $$ begin
  if not exists(select 1 from public.nearby_stations(0,0,15,'petrol')
    where id='55555555-5555-4555-8555-555555555601') then
    raise exception 'FAIL: verified fuel must match beyond 100 nearer unverified leads';
  end if;
  if exists(select 1 from public.nearby_stations(0,0,15,'petrol')
    where verification_status <> 'verified' or verified_at is null or verified_at > now()
      or not ('petrol'=any(supported_fuels)) or is_demo) then
    raise exception 'FAIL: unconfirmed fuel matched';
  end if;
end $$;
reset role;
select 'PASS: confirmed fuel before spatial result cap' as result;
rollback;
