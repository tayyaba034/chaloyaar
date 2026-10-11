-- Run with: supabase db query --linked --file supabase/tests/driver_account_access.sql
-- Fixtures and all changes are rolled back, including temporary Auth users.
begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111101','driver-qa-a@example.invalid'),
 ('11111111-1111-4111-8111-111111111102','driver-qa-b@example.invalid'),
 ('11111111-1111-4111-8111-111111111103','provider-qa@example.invalid');
insert into public.profiles(id,role) values
 ('11111111-1111-4111-8111-111111111101','driver'),
 ('11111111-1111-4111-8111-111111111102','driver'),
 ('11111111-1111-4111-8111-111111111103','provider') on conflict(id) do update set role=excluded.role;
insert into public.providers(id,verification_status,active,service_types,is_demo)
values('11111111-1111-4111-8111-111111111103','approved',true,array['towing'],false);
insert into public.driver_vehicles(id,user_id,nickname,vehicle_type,fuel_type) values
 ('22222222-2222-4222-8222-222222222201','11111111-1111-4111-8111-111111111101','QA own','car','petrol'),
 ('22222222-2222-4222-8222-222222222202','11111111-1111-4111-8111-111111111102','QA other','car','petrol');
insert into public.fuel_logs(user_id,vehicle_id,litres,total_amount) values
 ('11111111-1111-4111-8111-111111111101','22222222-2222-4222-8222-222222222201',10,100),
 ('11111111-1111-4111-8111-111111111102','22222222-2222-4222-8222-222222222202',10,100);
insert into public.driver_service_quotes(id,user_id,provider_id,service_type,pickup_latitude,pickup_longitude,amount_pkr,verified_at,expires_at)
values('33333333-3333-4333-8333-333333333301','11111111-1111-4111-8111-111111111101','11111111-1111-4111-8111-111111111103','towing',31.4,73,1234,now()-interval '1 minute',now()+interval '10 minutes');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111101","role":"authenticated"}',true);
set local role authenticated;
do $$
declare count_rows integer; request_row public.service_requests;
begin
  if (select count(*) from public.driver_vehicles) <> 1 then raise exception 'FAIL: vehicle ownership read'; end if;
  if (select count(*) from public.fuel_logs) <> 1 then raise exception 'FAIL: fuel log ownership read'; end if;
  if exists(select 1 from public.profiles where id='11111111-1111-4111-8111-111111111102') then raise exception 'FAIL: profile ownership read'; end if;
  update public.driver_vehicles set nickname='Attack' where id='22222222-2222-4222-8222-222222222202';
  get diagnostics count_rows=row_count;
  if count_rows<>0 then raise exception 'FAIL: cross-owner vehicle update'; end if;
  delete from public.fuel_logs where user_id='11111111-1111-4111-8111-111111111102';
  get diagnostics count_rows=row_count;
  if count_rows<>0 then raise exception 'FAIL: cross-owner fuel delete'; end if;
  begin
    insert into public.driver_vehicles(user_id,nickname,vehicle_type,fuel_type) values('11111111-1111-4111-8111-111111111102','Attack','car','petrol');
    raise exception 'FAIL: cross-owner vehicle insert';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.fuel_logs(user_id,vehicle_id,litres,total_amount) values('11111111-1111-4111-8111-111111111101','22222222-2222-4222-8222-222222222202',10,100);
    raise exception 'FAIL: foreign vehicle attached';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    insert into public.service_requests(user_id,service_type,latitude,longitude) values('11111111-1111-4111-8111-111111111101','towing',31.4,73);
    raise exception 'FAIL: unquoted dispatch';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    update public.profiles set role='admin' where id='11111111-1111-4111-8111-111111111101';
    raise exception 'FAIL: role escalation';
  exception when insufficient_privilege then null; end;
  insert into public.service_requests(user_id,service_type,latitude,longitude,quote_id,vehicle_id,contact_phone)
  values('11111111-1111-4111-8111-111111111101','towing',31.4,73,'33333333-3333-4333-8333-333333333301','22222222-2222-4222-8222-222222222201','03001234567') returning * into request_row;
  if request_row.quote_amount_pkr<>1234 or request_row.assigned_provider_id<>'11111111-1111-4111-8111-111111111103' or request_row.status<>'requested' then raise exception 'FAIL: trusted quote derivation'; end if;
  begin
    update public.service_requests set status='completed' where id=request_row.id;
    raise exception 'FAIL: Driver completed own request';
  exception when insufficient_privilege then null; end;
  perform set_config('driver_qa.request_id',request_row.id::text,true);
end;
$$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111102","role":"authenticated"}',true);
do $$
begin
  if exists(select 1 from public.driver_service_quotes) then raise exception 'FAIL: cross-owner quote read'; end if;
  if exists(select 1 from public.service_requests) then raise exception 'FAIL: cross-owner request read'; end if;
end;
$$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111103","role":"authenticated"}',true);
do $$
declare accepted public.service_requests; id uuid=current_setting('driver_qa.request_id')::uuid;
begin
  if exists(select 1 from public.driver_vehicles) then raise exception 'FAIL: non-Driver vehicle access'; end if;
  accepted:=public.claim_service_request(id);
  if accepted.status<>'confirmed' then raise exception 'FAIL: quoted provider acceptance'; end if;
  perform public.transition_service_request(id,'en_route');
  accepted:=public.transition_service_request(id,'completed');
  if accepted.status<>'completed' then raise exception 'FAIL: quoted request status flow'; end if;
end;
$$;
reset role;
rollback;
select 'PASS: Driver ownership, role restrictions, trusted quote and provider handoff; all fixtures rolled back' as result;
