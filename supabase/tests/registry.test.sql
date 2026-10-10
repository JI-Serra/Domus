begin;
select no_plan();
create temp table registry_fixture(key text primary key,value jsonb);
grant all on registry_fixture to authenticated;
create function pg_temp.flush_registry() returns void language plpgsql as $$ begin
  set constraints all immediate; set constraints all deferred;
end $$;
create function pg_temp.create_occupied_unit_without_holder() returns void language plpgsql as $$ begin
  perform public.save_unit('10000000-0000-0000-0000-000000000001','{"unit_code":"Invalid occupied","unit_status":"occupied"}',gen_random_uuid());
  perform pg_temp.flush_registry();
end $$;
create function pg_temp.end_last_holder() returns void language plpgsql as $$ begin
  perform public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
    '{"person_id":"30000000-0000-0000-0000-000000000004","person_first_name":"Carla","person_last_name":"Ceibos"}',
    '{"unit_resident_is_holder":false}',gen_random_uuid());
  perform pg_temp.flush_registry();
end $$;

grant execute on function pg_temp.flush_registry(),pg_temp.create_occupied_unit_without_holder(),pg_temp.end_last_holder() to authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.unit),40::bigint,'Registry sees 40 own units');
select is((select count(*) from public.unit where tenant_id='10000000-0000-0000-0000-000000000002'),0::bigint,'Registry cannot read foreign units');
select is(public.billable_unit_count('10000000-0000-0000-0000-000000000001'),40::bigint,'D20 default includes all statuses');
select throws_ok($$select public.billable_unit_count('10000000-0000-0000-0000-000000000002')$$,'42501','Billing count denied','Tenant admin count is tenant-bound');
select throws_ok($$select pg_temp.create_occupied_unit_without_holder()$$,'23514','Occupied unit requires an active holder','Occupied creation requires holder');
select throws_ok($$select pg_temp.end_last_holder()$$,'23514','Occupied unit requires an active holder','Ending last holder fails atomically');
insert into registry_fixture values('unit',to_jsonb(public.save_unit('10000000-0000-0000-0000-000000000001',
  '{"unit_code":"Test occupied","unit_status":"occupied","unit_is_billable":false}','f1000000-0000-4000-8000-000000000001',
  '[{"person":{"person_first_name":"Test","person_last_name":"Holder","person_email":"test.holder@domus.local"},"resident":{"unit_resident_is_holder":true,"unit_resident_relationship":"owner"}}]')));
select lives_ok($$select pg_temp.flush_registry()$$,'Atomic occupied creation includes its initial holder');
select is(public.billable_unit_count('10000000-0000-0000-0000-000000000001'),40::bigint,'False billing override excludes occupied unit');
select is(to_jsonb(public.save_unit('10000000-0000-0000-0000-000000000001',
  '{"unit_code":"Test occupied","unit_status":"occupied","unit_is_billable":false}','f1000000-0000-4000-8000-000000000001',
  '[{"person":{"person_first_name":"Test","person_last_name":"Holder","person_email":"test.holder@domus.local"},"resident":{"unit_resident_is_holder":true,"unit_resident_relationship":"owner"}}]')),
  (select value from registry_fixture where key='unit'),'Unit retry returns original without writing');
select throws_ok($$select public.save_unit('10000000-0000-0000-0000-000000000002','{"unit_code":"Foreign"}',gen_random_uuid())$$,'42501','Registry management denied','Unit writes cannot cross tenants');
select throws_ok($$select public.save_unit('10000000-0000-0000-0000-000000000001','{"unit_code":"Changed"}','f1000000-0000-4000-8000-000000000001')$$,'42501','Registry retry denied','Retry binds input');
select lives_ok($$select public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  '{"person_first_name":"Minor","person_last_name":"Fixture","person_email":"minor@domus.local","person_birth_date":"2015-01-01"}',
  '{"unit_resident_relationship":"family"}',gen_random_uuid())$$,'Birthday infers minor flag server-side');
select ok((select r.unit_resident_is_minor from public.unit_resident r join public.person p using(tenant_id,person_id) where p.person_email='minor@domus.local'),'Inferred minor persisted');
select throws_ok($$select public.create_resident_invitation('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  'minor@domus.local','household_member',gen_random_uuid(),(select person_id from public.person where person_email='minor@domus.local'))$$,
  '42501','Invitation management denied','Minors receive no account invitations');
select throws_ok($$select public.create_resident_invitation('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  'minor@domus.local','tenant_admin',gen_random_uuid(),(select person_id from public.person where person_email='minor@domus.local'))$$,
  '42501','Invitation management denied','Resident invitation cannot grant administrator role');

select lives_ok($$select public.save_gate('10000000-0000-0000-0000-000000000001','{"gate_name":"Side gate","gate_kind":"pedestrian"}',gen_random_uuid())$$,'Guards admin creates gate');
select lives_ok($$select public.assign_guard_gate('10000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003',true,gen_random_uuid())$$,'Guard assignment idempotently exists');
select throws_ok($$select public.assign_guard_gate('10000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000007',true,gen_random_uuid())$$,'42501','Gate management denied','Guard assignment cannot cross tenants');
select throws_ok($$select public.assign_guard_gate('10000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000004',true,gen_random_uuid())$$,'42501','Gate management denied','Holder cannot be assigned as guard');
insert into registry_fixture select 'pair',to_jsonb(p) from public.create_device_pairing('10000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',gen_random_uuid()) p;
select ok((select value->>'pairing_code' ~ '^[a-f0-9]{32}$' from registry_fixture where key='pair'),'Pairing code has 128 bits');
select throws_ok($$select device_credential_hash from public.device$$,'42501',null,'Device hash has no client SELECT privilege');
select throws_ok($$select * from public.device_pairing$$,'42501',null,'Pairing hashes are never exposed');
select throws_ok($$select * from public.unit_join_code$$,'42501',null,'Join hashes are never exposed');

-- Holder manages own vehicles/pets/member delegations only.
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.unit),1::bigint,'Holder sees own unit');
select lives_ok($$select public.save_vehicle('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  '{"vehicle_plate_code":"ab 123 cd","vehicle_make_name":"Test"}',gen_random_uuid())$$,'Holder adds normalized vehicle');
select ok(exists(select 1 from public.vehicle where vehicle_plate_code='AB123CD'),'Plate normalized on server');
select throws_ok($$select public.save_vehicle('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  '{"vehicle_plate_code":"AB123CD"}',gen_random_uuid())$$,'23505',null,'Normalized plate unique per tenant');
select lives_ok($$select public.save_pet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  '{"pet_name":"Test Luna","pet_species_name":"dog"}',gen_random_uuid())$$,'Holder adds pet');
select throws_ok($$select public.save_pet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  '{"pet_name":"Test","pet_species_name":"dog","pet_photo_path":"10000000-0000-0000-0000-000000000002/foreign.png"}',gen_random_uuid())$$,'23514',null,'Photo paths cannot cross tenant/unit');
select throws_ok($$select public.save_vehicle('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','{"vehicle_plate_code":"CD123EF"}',gen_random_uuid())$$,
  '42501','Registry management denied','Holder cannot manage another unit of same tenant');
select lives_ok($$select public.set_household_permissions('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000005',array['view_unit_finance','book_amenities','manage_access_authorizations']::public.household_permission[],gen_random_uuid())$$,
  'Holder delegates all three permissions');
select throws_ok($$select public.set_household_permissions('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000004',array['view_unit_finance']::public.household_permission[],gen_random_uuid())$$,'42501','Household delegation denied','Cannot self-grant household permissions');
insert into registry_fixture values('join_code',to_jsonb(public.rotate_unit_join_code('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')));
select ok((select value#>>'{}' ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$' from registry_fixture where key='join_code'),'Join code has grouped unambiguous characters');
select is(public.redeem_device_pairing('10000000-0000-0000-0000-000000000001',(select value->>'pairing_code' from registry_fixture where key='pair'),'Unauthorized tablet'),
  '{"status":"unavailable"}'::jsonb,'Resident cannot redeem valid pairing code');
select throws_ok($$select public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  '{"person_first_name":"Fake","person_last_name":"Holder"}','{"unit_resident_is_holder":true}',gen_random_uuid())$$,'42501','Holder grant denied','Holder cannot create another holder');
select throws_ok($$select public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  '{"person_id":"b1000000-0000-0000-0000-000000000003","person_first_name":"Fake","person_last_name":"Other"}','{}',gen_random_uuid())$$,
  '42501','Registry management denied','Holder cannot edit another household person');
select lives_ok($$select public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  '{"person_first_name":"Invited","person_last_name":"Adult","person_email":"adult@domus.local"}','{"unit_resident_relationship":"family"}',gen_random_uuid())$$,'Holder creates adult member');
insert into registry_fixture select 'resident_invite',to_jsonb(i) from public.create_resident_invitation('10000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001','adult@domus.local','household_member',gen_random_uuid(),
  (select (r->>'person_id')::uuid from jsonb_array_elements(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->'residents') r where r->>'person_email'='adult@domus.local')) i;
select ok((select value->>'invitation_token' ~ '^[a-f0-9]{64}$' from registry_fixture where key='resident_invite'),'Holder invitation reuses 256-bit email consent token');
select ok(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001') ? 'balance','Holder sheet enables finance placeholder');

reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.current_household_permissions('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),enum_range(null::public.household_permission),'Member gets enabled permissions');
select ok(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001') ? 'balance','Delegated finance enables member balance placeholder');
select ok(not exists(select 1 from jsonb_array_elements(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->'residents') r
  where r->>'person_id'<>'30000000-0000-0000-0000-000000000005' and (r ? 'person_document_number' or r ? 'person_email')),'Member sheet minimizes other residents PII');
select throws_ok($$select public.save_pet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','{"pet_name":"Blocked","pet_species_name":"dog"}',gen_random_uuid())$$,
  '42501','Registry management denied','Delegation does not permit household registry writes');
select throws_ok($$select public.search_registry('10000000-0000-0000-0000-000000000001','Carla')$$,'42501','Registry management denied','Global search is admin-only');

reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.set_household_permissions('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000005','{}',gen_random_uuid())$$,'Holder can revoke every delegation');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.current_household_permissions('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),'{}'::public.household_permission[],'Revoked delegations disappear immediately');
select ok(not(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001') ? 'balance'),'Undelegated member has no finance field');
select ok(not(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001') ? 'authorizations'),'Undelegated member has no access field');

-- Guard can only use the minimal operational projection; pairing gives a device, never a user membership.
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.person),1::bigint,'Guard person table exposes only own profile');
select ok((select count(*)>28 from public.guard_registry('10000000-0000-0000-0000-000000000001')),'Guard projection positively exposes operational residents');
select ok(not(to_jsonb((select r from public.guard_registry('10000000-0000-0000-0000-000000000001') r limit 1)) ? 'person_document_number'),'Guard projection has no document field');
select throws_ok($$select * from public.guard_registry('10000000-0000-0000-0000-000000000002')$$,'42501','Operational registry denied','Guard projection cannot cross tenant');
select is(public.guard_backup_contact('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','approval_phone_fallback'),
  '+54 381 555 0201','Guard backup contact is operational only');
select throws_ok($$select public.guard_backup_contact('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','browse')$$,
  '42501','Operational contact denied','Contact needs explicit fallback operation');
insert into registry_fixture values('device',public.redeem_device_pairing('10000000-0000-0000-0000-000000000001',(select value->>'pairing_code' from registry_fixture where key='pair'),'Paired tablet'));
select is((select value->>'status' from registry_fixture where key='device'),'paired','Active guard pairs device');
select is(public.redeem_device_pairing('10000000-0000-0000-0000-000000000001',(select value->>'pairing_code' from registry_fixture where key='pair'),'Replay tablet'),
  '{"status":"unavailable"}'::jsonb,'Pairing replay uniform denial');
select is(public.redeem_device_pairing('10000000-0000-0000-0000-000000000001',repeat('0',32),'Unknown tablet'),'{"status":"unavailable"}'::jsonb,'Wrong pairing code has same denial');
select is(public.sync_device('10000000-0000-0000-0000-000000000001',(select(value->>'device_id')::uuid from registry_fixture where key='device'),
  (select value->>'device_token' from registry_fixture where key='device'))->>'status','active','Device credential and independent operator can sync');
select is(public.sync_device('10000000-0000-0000-0000-000000000001',(select(value->>'device_id')::uuid from registry_fixture where key='device'),repeat('0',64)),
  '{"status":"unavailable"}'::jsonb,'Wrong device credential uniform denial');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.revoke_device('10000000-0000-0000-0000-000000000001',(select(value->>'device_id')::uuid from registry_fixture where key='device'),gen_random_uuid())$$,'Guards admin revokes device');
select is(public.sync_device('10000000-0000-0000-0000-000000000001',(select(value->>'device_id')::uuid from registry_fixture where key='device'),
  (select value->>'device_token' from registry_fixture where key='device')),'{"status":"unavailable"}'::jsonb,'Revocation effective on next request');
select ok(exists(select 1 from public.audit_event where audit_event_table_name='registry_contact_lookup' and audit_event_diff='{"operation_code":"approval_phone_fallback"}'),'Backup lookup audited without phone');
select ok(not exists(select 1 from public.audit_event where audit_event_table_name='device' and audit_event_diff::text like '%'||(select value->>'device_token' from registry_fixture where key='device')||'%'),'Device credential never in audit');
select ok((select device_paired_by_user_id='20000000-0000-0000-0000-000000000003' from public.device where device_id=(select(value->>'device_id')::uuid from registry_fixture where key='device')),'Device records pairing operator');
select ok((select count(*)>0 from public.search_registry('10000000-0000-0000-0000-000000000001','Carla')),'Admin search finds resident name');
select ok((select count(*)>0 from public.search_registry('10000000-0000-0000-0000-000000000001','AB123CD')),'Admin search finds plate');
select ok((select count(*)>0 from public.search_registry('10000000-0000-0000-0000-000000000001','test.holder@domus.local')),'Admin search finds registry email');
select lives_ok($$select public.archive_unit('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from registry_fixture where key='unit'),gen_random_uuid())$$,'Unit archival keeps history');
select ok(public.unit_sheet('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from registry_fixture where key='unit'))->'unit'->>'unit_archived_at' is not null,'Archived unit remains available to registry admin');
reset role;
select throws_ok($$delete from public.unit where unit_id='a1000000-0000-0000-0000-000000000001'$$,'23514','Archive units instead of deleting','Units cannot hard delete even as owner');
select * from finish();
rollback;
