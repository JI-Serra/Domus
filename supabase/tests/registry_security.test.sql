begin;
select no_plan();
create function pg_temp.registry_count(table_name text,target_tenant_id uuid) returns bigint language plpgsql as $$
declare result bigint; begin execute format('select count(*) from public.%I where tenant_id=$1',table_name) into result using target_tenant_id; return result; end $$;
grant execute on function pg_temp.registry_count(text,uuid) to authenticated;
insert into public.registry_import(registry_import_id,tenant_id,registry_import_created_by_user_id,registry_import_row_count,registry_import_error_count,client_event_id)
  values('f4000000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000006',1,0,gen_random_uuid());
insert into public.registry_import_row(tenant_id,registry_import_id,registry_import_row_number,registry_import_row_data,registry_import_row_errors)
  values('10000000-0000-0000-0000-000000000002','f4000000-0000-4000-8000-000000000001',1,'{"unit_code":"Foreign import"}','[]');
insert into public.unit_join_request(tenant_id,unit_id,unit_join_request_user_id,unit_join_request_email,unit_join_request_first_name,unit_join_request_last_name,client_event_id)
  values('10000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000009','member.tipas@domus.local','Pending','Foreign',gen_random_uuid());
create temp table security_fixture(key text primary key,value jsonb);
grant all on security_fixture to authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(pg_temp.registry_count(t,'10000000-0000-0000-0000-000000000002'),0::bigint,'Tenant A cannot read foreign '||t)
  from unnest(array['unit','unit_resident','membership_household_permission','vehicle','pet','unit_join_request','gate','gate_guard','registry_import','registry_import_row']) t;
select is((select count(*) from public.device where tenant_id='10000000-0000-0000-0000-000000000002'),0::bigint,'Tenant A cannot read foreign device');
select throws_ok(format('insert into public.%I(tenant_id) values(''10000000-0000-0000-0000-000000000002'')',t),'42501',null,'No direct client INSERT on '||t)
  from unnest(array['unit','unit_resident','membership_household_permission','vehicle','pet','unit_join_code','unit_join_request','gate','gate_guard','device','device_pairing','registry_import','registry_import_row']) t;
select throws_ok(format('delete from public.%I where tenant_id=''10000000-0000-0000-0000-000000000002''',t),'42501',null,'No direct client DELETE on '||t)
  from unnest(array['unit','unit_resident','membership_household_permission','vehicle','pet','unit_join_code','unit_join_request','gate','gate_guard','device','device_pairing','registry_import','registry_import_row']) t;
select throws_ok(format('update public.%I set tenant_id=''10000000-0000-0000-0000-000000000001'' where tenant_id=''10000000-0000-0000-0000-000000000002''',t),
  '42501',null,'No direct client UPDATE on '||t)
  from unnest(array['unit','unit_resident','membership_household_permission','vehicle','pet','unit_join_code','unit_join_request','gate','gate_guard','device','device_pairing','registry_import','registry_import_row']) t;
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001')$$,
  '42501','Unit sheet denied','Unit sheet denies foreign tenant');
select throws_ok($$select public.preview_registry_import('10000000-0000-0000-0000-000000000001','f4000000-0000-4000-8000-000000000001')$$,
  '42501','Registry import denied','Foreign batch id in own scope is uniform denial');
select throws_ok($$select public.preview_registry_import('10000000-0000-0000-0000-000000000001','f4000000-0000-4000-8000-000000000099')$$,
  '42501','Registry import denied','Missing batch has identical denial');
select throws_ok($$select public.create_device_pairing('10000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001',gen_random_uuid())$$,
  '42501','Gate management denied','Pairing generation denies foreign tenant before gate lookup');
select is(public.redeem_device_pairing('10000000-0000-0000-0000-000000000002',repeat('a',32),'Foreign tablet'),'{"status":"unavailable"}'::jsonb,'Foreign pairing redemption uniform');
select is(public.sync_device('10000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000001',repeat('a',64)),
  '{"status":"unavailable"}'::jsonb,'Foreign device sync uniform');
select lives_ok($$select public.save_vehicle('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','{"vehicle_plate_code":"ZZ123AA"}',gen_random_uuid())$$,'Registry admin can manage own unit vehicles');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000012","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.save_gate('10000000-0000-0000-0000-000000000001','{"gate_name":"Blocked","gate_kind":"vehicular"}',gen_random_uuid())$$,
  '42501','Gate management denied','Registry-only admin lacks guards permission');
select is((select count(*) from public.gate),0::bigint,'Registry-only admin cannot browse gates');

-- Support consumes the target's unit scope and never exposes pending onboarding data or device credentials.
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is(public.billable_unit_count('10000000-0000-0000-0000-000000000002'),40::bigint,'MFA platform admin can count units without registry access');
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')$$,
  '42501','Unit sheet denied','Platform has no standing unit sheet access');
insert into security_fixture values('support',to_jsonb(public.start_support_session('10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000010','Registry isolation test',gen_random_uuid())));
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000010','role','authenticated','aal','aal1',
  'session_id',(select value->>'support_session_id' from security_fixture where key='support'),
  'support_session_id',(select value->>'support_session_id' from security_fixture where key='support'),
  'support_tenant_id','10000000-0000-0000-0000-000000000001','impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
  'exp',floor(extract(epoch from((select value->>'support_session_expires_at' from security_fixture where key='support')::timestamptz))))::text,true);
set local role authenticated;
select is((select count(*) from public.unit),1::bigint,'Support holder sees only bound tenant/unit although target holds two tenants');
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002')$$,
  '42501','Unit sheet denied','Support cannot read target other tenant');
select throws_ok($$select public.rotate_unit_join_code('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002')$$,
  '42501','Join code management denied','Support cannot rotate join codes');
select is(public.redeem_device_pairing('10000000-0000-0000-0000-000000000001',repeat('a',32),'Support tablet'),'{"status":"unavailable"}'::jsonb,'Support cannot redeem device identity');
select is(public.submit_unit_join_request(target_tenant_id=>'10000000-0000-0000-0000-000000000001',join_code=>'AAAA-AAAA-AAAA',person_data=>'{}',client_event_id=>gen_random_uuid()),
  '{"status":"unavailable"}'::jsonb,'Support cannot submit join request');
select lives_ok($$select public.end_support_session((select(value->>'support_session_id')::uuid from security_fixture where key='support'))$$,'Support session ends');
select is((select count(*) from public.unit),0::bigint,'Revoked support unit reads disappear immediately');

-- Suspended is readable but every new write is denied. Cancelled is invisible.
reset role;
update public.tenant set tenant_subscription_status='suspended' where tenant_id='10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.unit),40::bigint,'Suspended registry remains readable');
select lives_ok($$select public.search_registry('10000000-0000-0000-0000-000000000001','Mz 1')$$,'Suspended search readable');
select throws_ok($$select public.save_unit('10000000-0000-0000-0000-000000000001','{"unit_code":"Suspended"}',gen_random_uuid())$$,
  '42501','Registry management denied','Suspended unit mutation denied');
select throws_ok($$select public.save_gate('10000000-0000-0000-0000-000000000001','{"gate_name":"Suspended","gate_kind":"vehicular"}',gen_random_uuid())$$,
  '42501','Gate management denied','Suspended gate mutation denied');
select is(public.sync_device('10000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001',repeat('a',64)),
  '{"status":"unavailable"}'::jsonb,'Suspended registry device sync is denied until M05 narrow gate exemption');
reset role;
update public.tenant set tenant_subscription_status='cancelled' where tenant_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(pg_temp.registry_count(t,'10000000-0000-0000-0000-000000000001'),0::bigint,'Cancelled hides '||t)
  from unnest(array['unit','unit_resident','membership_household_permission','vehicle','pet','unit_join_request','gate','gate_guard','registry_import','registry_import_row']) t;
select throws_ok($$select public.search_registry('10000000-0000-0000-0000-000000000001','Mz')$$,'42501','Registry management denied','Cancelled search denied');
reset role;
-- Integrity exists independently of client RLS.
select throws_ok($$insert into public.vehicle(tenant_id,unit_id,vehicle_plate_code) values('10000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','ZZ321BB')$$,
  '23503',null,'Composite vehicle FK prevents cross tenant even as owner');
select throws_ok($$insert into public.pet(tenant_id,unit_id,pet_name,pet_species_name) values('10000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Cross','dog')$$,
  '23503',null,'Composite pet FK prevents cross tenant even as owner');
select throws_ok($$insert into public.unit_resident(tenant_id,unit_id,person_id) values('10000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004')$$,
  '23503',null,'Composite resident FK prevents cross tenant even as owner');
select ok(not pg_has_role('authenticated','registry_writer','MEMBER'),'Client cannot assume registry capability');
select ok(not pg_has_role('service_role','registry_writer','MEMBER'),'Service role cannot assume registry capability');
select ok(not has_schema_privilege('registry_writer','public','CREATE') and not has_schema_privilege('registry_writer','app_private','CREATE'),'Registry capability cannot create arbitrary functions');
select ok((select not rolcanlogin and not rolinherit and not rolbypassrls and not rolsuper from pg_roles where rolname='registry_writer'),'Registry capability has no elevated cluster privilege');
select is((select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proowner='registry_writer'::regrole
  and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))),0::bigint,'New registry RPCs reject anonymous and service callers');
select is((select count(*) from pg_trigger t where tgname in('validate_occupied_unit','lock_resident_unit','validate_household_membership','validate_household_permission','validate_gate_guard') and tgenabled<>'A'),0::bigint,
  'Registry integrity triggers also run in replica mode');
select * from finish();
rollback;
