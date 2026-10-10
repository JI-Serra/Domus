begin;
select no_plan();
create temp table edge_fixture(key text primary key,value jsonb);
grant all on edge_fixture to authenticated;
create function pg_temp.expire_last_holder() returns void language plpgsql as $$ begin
  perform public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',
    '{"person_id":"b1000000-0000-0000-0000-000000000003","person_first_name":"Martin","person_last_name":"Ruiz","person_document_type":"dni","person_document_number":"70001003"}',
    jsonb_build_object('unit_resident_is_holder',true,'unit_resident_valid_to_at',now()+interval '1 hour'),gen_random_uuid());
  set constraints public.validate_occupied_unit immediate;
  set constraints public.validate_occupied_unit deferred;
end $$;
grant execute on function pg_temp.expire_last_holder() to authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select pg_temp.expire_last_holder()$$,'23514','Occupied unit requires an active holder','Future expiry of sole holder cannot leave an occupied unit uncovered');
-- Already-linked people consent to additional unit roles without ever rebinding their identity.
select lives_ok($$select public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',
  '{"person_id":"30000000-0000-0000-0000-000000000005","person_first_name":"Diego","person_last_name":"Ceibos"}',
  '{"unit_resident_relationship":"family"}',gen_random_uuid())$$,'Registry associates known adult with second unit');
select throws_ok($$select public.create_resident_invitation('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',
  'holder.ceibos@domus.local','household_member',gen_random_uuid(),'30000000-0000-0000-0000-000000000005')$$,
  '42501','Invitation management denied','Bound person invitation must match their actual Auth email');
insert into edge_fixture select 'invite',to_jsonb(i) from public.create_resident_invitation('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',
  'member.ceibos@domus.local','household_member',gen_random_uuid(),'30000000-0000-0000-0000-000000000005') i;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000005','role','authenticated','aal','aal1',
  'amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from statement_timestamp())+1)))::text,true);
set local role authenticated;
select lives_ok($$select public.accept_invitation((select value->>'invitation_token' from edge_fixture where key='invite'))$$,'Existing user consents to additional unit membership');
select is((select user_id from public.person where person_id='30000000-0000-0000-0000-000000000005'),
  '20000000-0000-0000-0000-000000000005'::uuid,'Existing binding never changes');
select is((select count(*) from public.membership where person_id='30000000-0000-0000-0000-000000000005' and membership_role='household_member' and membership_status='active'),
  2::bigint,'One user can hold household membership in two units');
select is(public.current_household_permissions('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002'),
  array['manage_access_authorizations']::public.household_permission[],'New unit gets its own default permissions');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into edge_fixture select 'expired_pair',to_jsonb(p) from public.create_device_pairing('10000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',gen_random_uuid()) p;
reset role;
update public.device_pairing set device_pairing_expires_at=statement_timestamp()-interval '1 millisecond'
  where device_pairing_id=(select(value->>'device_pairing_id')::uuid from edge_fixture where key='expired_pair');
set local role authenticated;
select is(public.redeem_device_pairing('10000000-0000-0000-0000-000000000001',(select value->>'pairing_code' from edge_fixture where key='expired_pair'),'Expired'),
  '{"status":"unavailable"}'::jsonb,'Expired pairing code has uniform failure');
insert into edge_fixture select 'retry_pair',to_jsonb(p) from public.create_device_pairing('10000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',
  'f5000000-0000-4000-8000-000000000001') p;
insert into edge_fixture select 'rotated_pair',to_jsonb(p) from public.create_device_pairing('10000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',
  'f5000000-0000-4000-8000-000000000001') p;
select is((select value->>'expires_at' from edge_fixture where key='retry_pair'),(select value->>'expires_at' from edge_fixture where key='rotated_pair'),'Pairing retry never extends expiry');
select is((select value->>'device_pairing_id' from edge_fixture where key='retry_pair'),(select value->>'device_pairing_id' from edge_fixture where key='rotated_pair'),'Pairing retry keeps same id');
select isnt((select value->>'pairing_code' from edge_fixture where key='retry_pair'),(select value->>'pairing_code' from edge_fixture where key='rotated_pair'),'Pairing retry rotates undelivered code');
select is(public.redeem_device_pairing('10000000-0000-0000-0000-000000000001',(select value->>'pairing_code' from edge_fixture where key='retry_pair'),'Old code'),
  '{"status":"unavailable"}'::jsonb,'Old pairing code is unusable');
select lives_ok($$select public.assign_guard_gate('10000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003',false,gen_random_uuid())$$,
  'Guards permission can remove assignment');
select is((select count(*) from public.gate_guard where membership_id='40000000-0000-0000-0000-000000000003'),0::bigint,'Assignment was removed');
-- Staged preview validates conflicts before an atomic confirmation can modify any data.
insert into edge_fixture values('identity_conflict',to_jsonb(public.create_registry_import('10000000-0000-0000-0000-000000000001','[
  {"unit_code":"Conflict 1","person_first_name":"First","person_last_name":"Resident","person_email":"same@domus.local","person_document_type":"dni","person_document_number":"88779901"},
  {"unit_code":"Conflict 2","person_first_name":"Second","person_last_name":"Resident","person_email":"same@domus.local","person_document_type":"dni","person_document_number":"88779902"}
]',gen_random_uuid())));
select is(public.preview_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from edge_fixture where key='identity_conflict'))->'batch'->>'registry_import_error_count',
  '2','Same email with different documents is a preview error on both rows');
insert into edge_fixture values('holder_removal',to_jsonb(public.create_registry_import('10000000-0000-0000-0000-000000000001','[
  {"unit_code":"Mz 1 Lote 3","unit_status":"occupied","person_first_name":"Martin","person_last_name":"Ruiz","person_document_type":"dni","person_document_number":"70001003","unit_resident_is_holder":false}
]',gen_random_uuid())));
select is(public.preview_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from edge_fixture where key='holder_removal'))->'batch'->>'registry_import_error_count',
  '1','Preview sees imported removal of existing last holder');
select is(public.confirm_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from edge_fixture where key='holder_removal'),gen_random_uuid())->>'status',
  'invalid','Invalid holder-removal batch never applies');
-- Changing a recorded birthday synchronizes minor flags and immediately removes unit permission authority.
select lives_ok($$update public.person set person_birth_date='2015-01-01' where person_id='30000000-0000-0000-0000-000000000005'$$,
  'Authorized birthday correction synchronizes minor status');
select ok((select bool_and(unit_resident_is_minor) from public.unit_resident where person_id='30000000-0000-0000-0000-000000000005'),'Birthday correction marks all residences minor');
select is((select count(*) from public.membership where person_id='30000000-0000-0000-0000-000000000005' and membership_status='active'),0::bigint,'Minor roles revoked immediately');
select throws_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','minor.mail@domus.local','guard',gen_random_uuid(),
  '30000000-0000-0000-0000-000000000005')$$,'42501',null,'Generic invitation path cannot bypass recorded-minor restriction');
reset role;
-- Pet Storage policies bind the complete tenant/unit path and deny writes from members/other households.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$insert into storage.objects(bucket_id,name) values('pet-photo','10000000-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/test.png')$$,'Holder uploads own pet photo metadata');
select throws_ok($$insert into storage.objects(bucket_id,name) values('pet-photo','10000000-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000002/test.png')$$,
  '42501',null,'Holder cannot upload other-unit pet photo');
select throws_ok($$insert into storage.objects(bucket_id,name) values('pet-photo','10000000-0000-0000-0000-000000000002/a1000000-0000-0000-0000-000000000001/test.png')$$,
  '42501',null,'Storage cannot mix tenant prefix with holder unit in another tenant');
reset role;
select * from finish();
rollback;
