-- Synthetic fixtures only. Run with: npm run test:sql trip_planner
begin;
insert into auth.users(id, email) values
  ('c1111111-1111-4111-8111-111111111101', 'owner-a@example.invalid'),
  ('c1111111-1111-4111-8111-111111111102', 'owner-b@example.invalid'),
  ('c1111111-1111-4111-8111-111111111103', 'driver@example.invalid'),
  ('c1111111-1111-4111-8111-111111111104', 'admin@example.invalid'),
  ('c1111111-1111-4111-8111-111111111105', 'staff@example.invalid');
insert into public.profiles(id, role) values
  ('c1111111-1111-4111-8111-111111111101', 'driver'), ('c1111111-1111-4111-8111-111111111102', 'driver'),
  ('c1111111-1111-4111-8111-111111111103', 'driver'), ('c1111111-1111-4111-8111-111111111104', 'admin'),
  ('c1111111-1111-4111-8111-111111111105', 'driver')
on conflict (id) do update set role = excluded.role;

-- Owner A registers a workshop; it stays private until an admin approves it.
select qa.login('c1111111-1111-4111-8111-111111111101');
create temp table ids(name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, anon;
insert into ids select 'a', public.register_business('QA Cool Air Workshop', 'workshop', 31.41, 73.08, 'Car AC repair', '+92 300 0000000', 'QA road');
select qa.logout();
select qa.login(null);
select qa.assert((select count(*) from public.businesses) = 0, 'pending business hidden from public');
select qa.logout();
select qa.login('c1111111-1111-4111-8111-111111111104');
select public.review_business((select id from ids where name = 'a'), 'active');
select qa.logout();
select qa.login(null);
select qa.assert((select count(*) from public.businesses) = 1, 'active business is public');
select qa.assert((select state from public.current_availability((select id from ids where name = 'a'))) = 'UNKNOWN', 'no updates means UNKNOWN');
select qa.logout();

-- Owner B registers a pharmacy; B cannot touch A and A cannot touch B.
select qa.login('c1111111-1111-4111-8111-111111111102');
insert into ids select 'b', public.register_business('QA Pharmacy', 'pharmacy', 31.42, 73.09);
do $$ begin
  perform public.record_availability_update((select id from ids where name = 'a'), 'TEMPORARILY_CLOSED', null, null, 'sabotage', null, null, now() + interval '1 day');
  raise exception 'FAIL: owner B updated business A';
exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end $$;
update public.businesses set name = 'Hijacked' where id = (select id from ids where name = 'a');
select qa.logout();
select qa.assert((select name from public.businesses where id = (select id from ids where name = 'a')) = 'QA Cool Air Workshop', 'owner B cannot rename business A');
select qa.login('c1111111-1111-4111-8111-111111111102');
do $$ begin
  insert into public.services(business_id, name) values ((select id from ids where name = 'a'), 'Fake service');
  raise exception 'FAIL: owner B added a service to A';
exception when insufficient_privilege then null; end $$;
select qa.logout();

-- Owner A adds a service and staff; staff can update status.
select qa.login('c1111111-1111-4111-8111-111111111101');
insert into public.services(business_id, name, tag, duration_minutes) values ((select id from ids where name = 'a'), 'Car AC repair', 'car_ac', 60);
insert into ids select 'svc', id from public.services where name = 'Car AC repair';
insert into public.business_hours(business_id, weekday, opens_at, closes_at) values ((select id from ids where name = 'a'), 1, '09:00', '18:00');
select public.add_business_staff((select id from ids where name = 'a'), 'staff@example.invalid');
select qa.logout();
select qa.login('c1111111-1111-4111-8111-111111111105');
select public.record_availability_update((select id from ids where name = 'a'), 'UNCONFIRMED', null, null, 'Opened shop');
select qa.logout();

-- Driver plans a trip through workshop A and asks for confirmation.
select qa.login('c1111111-1111-4111-8111-111111111103');
insert into public.itineraries(user_id, request_text, km_per_litre, price_pkr_per_litre, origin_latitude, origin_longitude)
  values ('c1111111-1111-4111-8111-111111111103', 'AC fix and medicine', 12.5, 250, 31.40, 73.07);
insert into ids select 'trip', id from public.itineraries;
insert into public.itinerary_stops(itinerary_id, position, user_position, errand_label, category, business_id, service_id)
  values ((select id from ids where name = 'trip'), 0, 0, 'Car AC', 'workshop', (select id from ids where name = 'a'), (select id from ids where name = 'svc'));
insert into ids select 'stop', id from public.itinerary_stops;
insert into ids select 'req', request_id from public.request_confirmation((select id from ids where name = 'a'), 'Can you repair car AC today?',
  (select id from ids where name = 'svc'), null, null, (select id from ids where name = 'trip'), (select id from ids where name = 'stop'));
select qa.assert((select state from public.current_availability((select id from ids where name = 'a'), (select id from ids where name = 'svc'))) = 'PENDING_CONFIRMATION', 'open request is PENDING_CONFIRMATION');
do $$ begin
  perform public.request_confirmation((select id from ids where name = 'a'), 'again?');
  raise exception 'FAIL: duplicate open request allowed';
exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end $$;
do $$ begin
  perform public.respond_to_confirmation((select id from ids where name = 'req'), true, 'self-confirm');
  raise exception 'FAIL: driver answered for the business';
exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end $$;
do $$ begin
  perform 1 from public.route_estimates;
  raise exception 'FAIL: route cache readable by API role';
exception when insufficient_privilege then null; end $$;
-- Workflow transitions are enforced.
do $$ begin
  update public.itineraries set workflow_state = 'APPROVED' where id = (select id from ids where name = 'trip');
  raise exception 'FAIL: DRAFT jumped to APPROVED';
exception when check_violation then null; end $$;
update public.itineraries set workflow_state = 'PARSED' where id = (select id from ids where name = 'trip');
select qa.assert((select workflow_version from public.itineraries where id = (select id from ids where name = 'trip')) = 1, 'version increments on transition');
update public.itineraries set workflow_state = 'SEARCHING' where id = (select id from ids where name = 'trip');
update public.itineraries set workflow_state = 'VERIFYING' where id = (select id from ids where name = 'trip');
update public.itineraries set workflow_state = 'ROUTING' where id = (select id from ids where name = 'trip');
update public.itineraries set workflow_state = 'OPTIMIZING' where id = (select id from ids where name = 'trip');
update public.itineraries set workflow_state = 'PROPOSED' where id = (select id from ids where name = 'trip');
select qa.logout();

-- Owner B cannot see A's requests; owner A answers "available".
select qa.login('c1111111-1111-4111-8111-111111111102');
select qa.assert((select count(*) from public.verification_events) = 0, 'other business cannot see requests');
select qa.logout();
select qa.login('c1111111-1111-4111-8111-111111111101');
select public.respond_to_confirmation((select id from ids where name = 'req'), true, 'Technician here until 6', now() + interval '3 hours');
select qa.logout();
select qa.login('c1111111-1111-4111-8111-111111111103');
select qa.assert((select state from public.current_availability((select id from ids where name = 'a'), (select id from ids where name = 'svc'))) = 'CONFIRMED', 'business answer gives CONFIRMED');
select qa.assert((select source from public.current_availability((select id from ids where name = 'a'))) = 'business_dashboard', 'source recorded');
select qa.assert((select needs_recalculation from public.itineraries where id = (select id from ids where name = 'trip')), 'confirmation flags the itinerary');
select qa.assert((select count(*) from public.notifications where kind in ('confirmation_update', 'itinerary_changed')) >= 2, 'driver notified');
select qa.logout();

-- Freshness: a confirmation older than the workshop policy (60 min) reads as EXPIRED.
insert into public.availability_updates(business_id, state, source, submitter_role, submitted_at)
  values ((select id from ids where name = 'b'), 'CONFIRMED', 'business_dashboard', 'owner', now() - interval '3 hours');
select qa.assert((select state from public.current_availability((select id from ids where name = 'b'))) = 'EXPIRED', 'old confirmation expires');
select qa.assert((select stored_state from public.current_availability((select id from ids where name = 'b'))) = 'CONFIRMED', 'expired keeps last known state');
-- Temporary closure overrides service confirmations.
select qa.login('c1111111-1111-4111-8111-111111111101');
select public.record_availability_update((select id from ids where name = 'a'), 'TEMPORARILY_CLOSED', null, null, 'Power outage', null, null, now() + interval '2 hours');
select qa.assert((select state from public.current_availability((select id from ids where name = 'a'), (select id from ids where name = 'svc'))) = 'TEMPORARILY_CLOSED', 'closure overrides service state');
do $$ begin
  perform public.record_availability_update((select id from ids where name = 'a'), 'TEMPORARILY_CLOSED');
  raise exception 'FAIL: closure without reopening time';
exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end $$;
select qa.assert((select count(*) from public.audit_logs where business_id = (select id from ids where name = 'a') and entity_type = 'availability_updates') >= 3, 'availability changes are audited');
select qa.logout();

-- Unanswered requests never become confirmations; unclaimed businesses get no fake send.
insert into public.businesses(id, name, category, latitude, longitude, source, listing_status)
  values ('d1111111-1111-4111-8111-111111111101', 'QA Unclaimed Clinic', 'clinic', 31.43, 73.1, 'osm_import', 'unclaimed');
select qa.login('c1111111-1111-4111-8111-111111111103');
select qa.assert((select request_status from public.request_confirmation('d1111111-1111-4111-8111-111111111101', 'Is the doctor in?')) = 'not_configured', 'no channel means not_configured');
select qa.logout();
insert into public.verification_events(business_id, requested_by, channel, status, question, requested_at, expires_at)
  values ((select id from ids where name = 'b'), 'c1111111-1111-4111-8111-111111111103', 'in_app', 'requested', 'old question', now() - interval '2 hours', now() - interval '1 hour');
select qa.assert((select state from public.current_availability((select id from ids where name = 'b'))) = 'EXPIRED', 'timed-out request is not a confirmation');
select qa.login('c1111111-1111-4111-8111-111111111104');
select qa.assert(public.record_manual_confirmation((select id from public.verification_events where business_id = 'd1111111-1111-4111-8111-111111111101'), 'no_answer', 'Rang twice') is null, 'no answer records nothing');
select qa.assert((select status from public.verification_events where business_id = 'd1111111-1111-4111-8111-111111111101') = 'failed', 'no answer marks failed');
select qa.logout();
select qa.assert((select state from public.current_availability('d1111111-1111-4111-8111-111111111101')) = 'UNKNOWN', 'no answer is not a confirmation');

-- Appointments: confirm creates a CONFIRMED update with source appointment_accepted.
select qa.login('c1111111-1111-4111-8111-111111111103');
insert into ids select 'appt', public.request_appointment((select id from ids where name = 'a'), now() + interval '3 hours', now() + interval '4 hours', (select id from ids where name = 'svc'), 'AC gas refill');
select qa.logout();
select qa.login('c1111111-1111-4111-8111-111111111101');
select public.decide_appointment((select id from ids where name = 'appt'), 'confirmed', 'See you at 3');
select qa.assert((select count(*) from public.availability_updates where appointment_request_id = (select id from ids where name = 'appt') and source = 'appointment_accepted') = 1, 'appointment creates confirmation');
select qa.logout();

-- Outcomes: "avoided" needs evidence; savings come from snapshots; consent controls features.
select qa.login('c1111111-1111-4111-8111-111111111102');
select public.record_availability_update((select id from ids where name = 'b'), 'UNAVAILABLE', null, 'Pharmacist', 'Out until tomorrow');
select qa.logout();
select qa.login('c1111111-1111-4111-8111-111111111103');
insert into public.itinerary_stops(itinerary_id, position, user_position, errand_label, category, business_id)
  values ((select id from ids where name = 'trip'), 1, 1, 'Medicine', 'pharmacy', (select id from ids where name = 'b'));
insert into public.itinerary_stops(itinerary_id, position, user_position, errand_label, category)
  values ((select id from ids where name = 'trip'), 2, 2, 'Document', 'office');
do $$ begin
  perform public.record_trip_outcome((select id from public.itinerary_stops where errand_label = 'Document'), 'avoided', null, null, 10, 'road');
  raise exception 'FAIL: avoided without evidence';
exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end $$;
select public.record_trip_outcome((select id from public.itinerary_stops where errand_label = 'Medicine'), 'avoided', null, 'Pharmacy said closed', 10, 'road');
select qa.assert((select avoided_fuel_cost_pkr from public.trip_outcomes where outcome = 'avoided') = 200, 'avoided cost = 10 km / 12.5 km/L x 250');
select qa.assert((select realized_savings_pkr from public.monthly_trip_summary) = 200, 'monthly summary counts realized savings');
select qa.assert((select count(*) from public.visit_feature_snapshots) = 0, 'no features without consent');
insert into public.user_preferences(user_id, data_sharing_consent, consented_at) values ('c1111111-1111-4111-8111-111111111103', true, now());
select public.record_trip_outcome((select id from ids where name = 'stop'), 'failed', 'long_wait', 'Waited 2 hours');
select qa.logout();
select qa.assert((select count(*) from public.visit_feature_snapshots) = 1, 'feature snapshot with consent');
select qa.assert((select outcome from public.visit_feature_snapshots) = 'failed', 'snapshot outcome');
select qa.login('c1111111-1111-4111-8111-111111111102');
select qa.assert((select count(*) from public.trip_outcomes) = 0, 'outcomes are private to the driver');
select qa.assert((select count(*) from public.itineraries) = 0, 'itineraries are private to the driver');
select qa.logout();
-- Directory search: public, filters demo unless asked, ranks by match and availability.
insert into public.businesses(name, category, latitude, longitude, source, listing_status, is_demo) values ('[DEMO] QA Demo Garage', 'workshop', 31.41, 73.08, 'demo', 'active', true);
select qa.login(null);
select qa.assert((select count(*) from public.search_businesses('car ac')) >= 1, 'service text is searchable');
select qa.assert((select name from public.search_businesses('car ac') limit 1) = 'QA Cool Air Workshop', 'match by service name');
select qa.assert((select count(*) from public.search_businesses(null, 'workshop')) = 1, 'demo hidden by default');
select qa.assert((select count(*) from public.search_businesses(null, 'workshop', null, null, 15, true)) = 2, 'demo shown when asked');
select qa.assert((select availability_state from public.search_businesses(null, 'workshop') limit 1) = 'TEMPORARILY_CLOSED', 'search returns current availability');
select qa.assert((select count(*) from public.search_businesses(null, null, 31.41, 73.08, 1)) >= 1, 'radius search');
select qa.assert((select jsonb_array_length(services) from public.search_businesses('car ac') limit 1) = 1, 'services included');
select qa.logout();
rollback;
