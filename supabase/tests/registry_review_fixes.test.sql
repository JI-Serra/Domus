begin isolation level repeatable read;
select no_plan();
create temp table fixes(key text primary key,value jsonb);
grant all on fixes to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at) values
 ('99000000-0000-0000-0000-000000000001','authenticated','authenticated','attacker.t19@example.test',now());
insert into fixes select 'victim',to_jsonb(p) from public.person p where person_id='b1000000-0000-0000-0000-000000000003';
insert into public.person(person_id,tenant_id,person_first_name,person_last_name,person_document_type,person_document_number,person_email)
 values('99000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Original','Member','dni','99190002','original.t19@example.test');
insert into public.unit_resident(tenant_id,unit_id,person_id) values
 ('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into fixes values('code',to_jsonb(public.rotate_unit_join_code('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')));
reset role;
select set_config('request.jwt.claims','{"sub":"99000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into fixes values('exploit',public.submit_unit_join_request(join_code=>(select value#>>'{}' from fixes where key='code'),
 person_data=>' {"person_first_name":"Juan","person_last_name":"Attacker","person_document_type":"dni","person_document_number":"70001003"}',client_event_id=>gen_random_uuid()));
select is((select value->>'status' from fixes where key='exploit'),'pending','Reviewer exploit is a real outsider submission');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000012","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.decide_unit_join_request('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 (select(value->>'unit_join_request_id')::uuid from fixes where key='exploit'),true,gen_random_uuid())->>'status','identity_conflict','Registry sees typed-document conflict instead of merging');
reset role;
select is((select to_jsonb(p) from public.person p where person_id='b1000000-0000-0000-0000-000000000003'),
 (select value from fixes where key='victim'),'Victim identity and timestamps unchanged');
select is((select invitation_id from public.unit_join_request where unit_join_request_id=(select(value->>'unit_join_request_id')::uuid from fixes where key='exploit')),
 null::uuid,'Exploit issues no invitation');
select is((select unit_join_request_status::text from public.unit_join_request where unit_join_request_id=(select(value->>'unit_join_request_id')::uuid from fixes where key='exploit')),
 'pending','Conflict remains pending for explicit registry resolution');
insert into public.unit_join_request(unit_join_request_id,tenant_id,unit_id,unit_join_request_user_id,unit_join_request_email,
 unit_join_request_first_name,unit_join_request_last_name,unit_join_request_document_type,unit_join_request_document_number,client_event_id)
 values('99000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',
 '99000000-0000-0000-0000-000000000001','attacker.t19@example.test','Attacker','Two','dni','99190002',gen_random_uuid());
-- Same-unit holder variant uses a separate request to avoid the pending-user unique key.
update public.unit_join_request set unit_join_request_document_number='99190002' where unit_join_request_id=(select(value->>'unit_join_request_id')::uuid from fixes where key='exploit');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.decide_unit_join_request('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 (select(value->>'unit_join_request_id')::uuid from fixes where key='exploit'),true,gen_random_uuid())->>'status','identity_conflict','Holder cannot merge applicant into same-unit unbound member');
reset role;
select is((select person_first_name from public.person where person_id='99000000-0000-0000-0000-000000000002'),'Original','Same-unit identity preserved');
-- M1: co-holder and multi-unit target, recorded mailbox, pending/accepted invitation and bound user lockouts.
insert into public.unit_resident(tenant_id,unit_id,person_id,unit_resident_is_holder) values
 ('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003',false);
update public.unit_resident set unit_resident_is_holder=true where person_id='99000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.create_resident_invitation('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 'capture@example.test','household_member',gen_random_uuid(),'99000000-0000-0000-0000-000000000002')$$,'42501','Invitation management denied','Co-holder invitation capture denied');
select throws_ok($$select public.create_resident_invitation('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 'resident.1.3@domus.local','household_member',gen_random_uuid(),'b1000000-0000-0000-0000-000000000003')$$,'42501','Invitation management denied','Multi-unit resident capture denied even with recorded mailbox');
select throws_ok($$select public.create_resident_invitation('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 'member.ceibos@domus.local','household_member',gen_random_uuid(),'30000000-0000-0000-0000-000000000005')$$,'42501','Invitation management denied','Holder cannot rebind bound adult');
reset role;
update public.unit_resident set unit_resident_is_holder=false where person_id='99000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.create_resident_invitation('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 'capture@example.test','household_member',gen_random_uuid(),'99000000-0000-0000-0000-000000000002')$$,'42501','Invitation management denied','Recorded email cannot be redirected by holder');
select throws_ok($$select public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '{"person_id":"30000000-0000-0000-0000-000000000005","person_first_name":"Rewrite","person_last_name":"Adult"}','{}',gen_random_uuid())$$,
 '42501','Registry management denied','Holder cannot rewrite bound adult identity');
insert into fixes values('claim',to_jsonb(public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '{"person_first_name":"New","person_last_name":"Claim","person_document_type":"dni","person_document_number":"70001004","person_email":"new.claim.t19@example.test"}', '{}',gen_random_uuid())));
select ok((select value is not null from fixes where key='claim'),'Foreign-unit document claim returns ordinary success');
insert into fixes values('plate',to_jsonb(public.save_vehicle('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '{"vehicle_plate_code":"T19PLATE"}',gen_random_uuid())));
select throws_ok($$select public.save_vehicle('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 jsonb_build_object('vehicle_plate_code','T19LONG','vehicle_make_name',repeat('a',101)),gen_random_uuid())$$,'23514',null,'Vehicle fields bounded');
select throws_ok($$select public.save_pet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '{"pet_name":"Test","pet_species_name":"Dog","pet_photo_path":"10000000-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/../x.png"}',gen_random_uuid())$$,
 '23514',null,'Pet traversal path rejected');
select throws_ok($$insert into storage.objects(bucket_id,name) values('pet-photo','10000000-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/../x.png')$$,
 '42501',null,'Storage traversal rejected');
select throws_ok($$insert into storage.objects(bucket_id,name) values('pet-photo','10000000-0000-0000-0000-000000000001/a1000000-0000-0000-0000-000000000001/extra/x.png')$$,
 '42501',null,'Storage extra segment rejected');
reset role;
select ok((select person_document_number is null and person_claimed_document_number='70001004' from public.person p join public.unit_resident r using(tenant_id,person_id)
 where r.unit_resident_id=(select(value#>>'{}')::uuid from fixes where key='claim')),'Collision kept as claim, original identity untouched');
-- Registry-only natural key mismatch, self import and verification visibility.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000012","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '{"person_first_name":"Conflict","person_last_name":"Keys","person_document_type":"dni","person_document_number":"70001003","person_email":"original.t19@example.test"}',
 '{}',gen_random_uuid())$$,'23514','Person identity conflict','Different document/email identities never merge');
select ok(jsonb_array_length(public.registry_pending_verification('10000000-0000-0000-0000-000000000001')->'people')>=1,'Registry sees pending identity claims');
insert into fixes values('self_import',to_jsonb(public.create_registry_import('10000000-0000-0000-0000-000000000001',
 '[{"unit_code":"T19 self grant","person_first_name":"Registry","person_last_name":"Self","person_document_type":"dni","person_document_number":"90000012","unit_resident_is_holder":true}]',gen_random_uuid())));
select ok(public.preview_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from fixes where key='self_import'))
 ->'rows'->0->'errors' ? 'self_role_change','Self import into new unit denied');
select is(public.confirm_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from fixes where key='self_import'),gen_random_uuid())->>'status',
 'invalid','Self import cannot confirm');
insert into fixes values('retention',to_jsonb(public.create_registry_import('10000000-0000-0000-0000-000000000001','[{"unit_code":"T19 retention"}]',gen_random_uuid())));
select is(public.confirm_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from fixes where key='retention'),gen_random_uuid())->>'status','confirmed','Import confirms before purge');
select is(public.preview_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from fixes where key='retention'))->'rows'->0->'data','{}'::jsonb,'Confirmed staged PII immediately purged');
reset role;
-- L4: persisted budget, explicit enum reasons, audit per successful lookup.
delete from app_private.registry_attempt where registry_attempt_scope_code='contact:user:20000000-0000-0000-0000-000000000003';
insert into fixes values('contact_audit',to_jsonb((select count(*) from public.audit_event where audit_event_table_name='registry_contact_lookup'
 and audit_event_actor_user_id='20000000-0000-0000-0000-000000000003')));
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.guard_backup_contact('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','arbitrary')$$,
 '42501','Operational contact denied','Guard needs enumerated operational reason');
select ok(public.guard_backup_contact('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','approval_phone_fallback') is not null,
 'Guard operational lookup '||n) from generate_series(1,5) n;
select is(public.guard_backup_contact('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','approval_phone_fallback'),null::text,'Sixth lookup withheld without rolling back budget');
reset role;
select is((select count(*) from public.audit_event where audit_event_table_name='registry_contact_lookup' and audit_event_actor_user_id='20000000-0000-0000-0000-000000000003')
 -(select(value#>>'{}')::bigint from fixes where key='contact_audit'),5::bigint,'Each released phone has an attributed audit row');
-- Invitation lockouts remain effective for expired-pending and accepted records, independently of bound users.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into fixes select 'original_invite',to_jsonb(i) from public.create_resident_invitation('10000000-0000-0000-0000-000000000001',
 'a1000000-0000-0000-0000-000000000001','original.t19@example.test','household_member',gen_random_uuid(),'99000000-0000-0000-0000-000000000002') i;
select throws_ok($$select public.create_resident_invitation('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 'original.t19@example.test','household_member',gen_random_uuid(),'99000000-0000-0000-0000-000000000002')$$,'42501','Invitation management denied','Existing pending invitation cannot be rebound');
reset role;
update public.invitation set invitation_expires_at=now()-interval '1 minute' where invitation_id=(select(value->>'invitation_id')::uuid from fixes where key='original_invite');
set local role authenticated;
select throws_ok($$select public.create_resident_invitation('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 'original.t19@example.test','household_member',gen_random_uuid(),'99000000-0000-0000-0000-000000000002')$$,'42501','Invitation management denied','Expired pending invitation requires explicit registry action');
reset role;
update public.invitation set invitation_status='accepted',invitation_accepted_at=now(),invitation_accepted_by_user_id='99000000-0000-0000-0000-000000000001'
 where invitation_id=(select(value->>'invitation_id')::uuid from fixes where key='original_invite');
set local role authenticated;
select throws_ok($$select public.create_resident_invitation('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 'original.t19@example.test','household_member',gen_random_uuid(),'99000000-0000-0000-0000-000000000002')$$,'42501','Invitation management denied','Accepted invitation blocks holder rebinding even without a user');
select throws_ok($$select public.registry_pending_verification('10000000-0000-0000-0000-000000000001')$$,
 '42501','Registry management denied','Holder cannot see collision queue');
insert into fixes values('minor_id',to_jsonb(public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '{"person_first_name":"Unbound","person_last_name":"Minor","person_email":"minor.t19@example.test"}', '{}',gen_random_uuid())));
reset role;
insert into fixes select 'minor_person',to_jsonb(person_id) from public.unit_resident where unit_resident_id=(select(value#>>'{}')::uuid from fixes where key='minor_id');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000012","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 jsonb_build_object('person_id',(select value#>>'{}' from fixes where key='minor_person'),'person_first_name','Unbound','person_last_name','Minor','person_birth_date','2015-01-01'),
 '{"unit_resident_is_minor":true}',gen_random_uuid())$$,'Registry can record minority on holder-created member');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 jsonb_build_object('person_id',(select value#>>'{}' from fixes where key='minor_person'),'person_first_name','Unbound','person_last_name','Minor','person_birth_date','1990-01-01'),
 '{"unit_resident_is_minor":false}',gen_random_uuid())$$,'42501','Registry management denied','Holder cannot clear registry minor and cross birthday boundary');
select throws_ok($$select public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 jsonb_build_object('person_id',(select value#>>'{}' from fixes where key='minor_person'),'person_first_name','Unbound','person_last_name','Minor','person_birth_date','2015-01-01'),
 '{"unit_resident_is_minor":false}',gen_random_uuid())$$,'42501','Registry management denied','Holder cannot clear registry minor flag alone');
select throws_ok($$select public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '{"person_id":"99000000-0000-0000-0000-000000000002","person_first_name":"Original","person_last_name":"Member"}', '{}',gen_random_uuid())$$,
 '42501','Registry management denied','Holder cannot edit registry-created unbound member');
-- A claimed plate elsewhere and an unused plate have identical holder projections and RPC results.
reset role;
insert into public.vehicle(tenant_id,unit_id,vehicle_plate_code) values
 ('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','T19OTHER');
set local role authenticated;
insert into fixes values('plate_collision',to_jsonb(public.save_vehicle('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '{"vehicle_plate_code":"T19OTHER"}',gen_random_uuid())));
select ok(not exists(select 1 from jsonb_array_elements(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->'vehicles') v
 where v ? 'vehicle_is_verified'),'Holder sheet never reveals plate verification');
select throws_ok($$select vehicle_is_verified from public.vehicle$$,'42501',null,'Direct holder reads cannot reveal plate verification');
reset role;
select ok(not (select vehicle_is_verified from public.vehicle where vehicle_id=(select(value#>>'{}')::uuid from fixes where key='plate_collision')),'Plate claimed elsewhere remains pending');
update public.vehicle set vehicle_archived_at=now() where unit_id='a1000000-0000-0000-0000-000000000003' and vehicle_plate_code='T19OTHER';
set local role authenticated;
select lives_ok($$select public.save_vehicle('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 jsonb_build_object('vehicle_id',(select value#>>'{}' from fixes where key='plate_collision'),'vehicle_plate_code','T19OTHER'),gen_random_uuid())$$,'Archived other-unit plate does not block re-registration');
reset role;
select ok((select vehicle_is_verified from public.vehicle where vehicle_id=(select(value#>>'{}')::uuid from fixes where key='plate_collision')),'Archived conflict is no longer canonical');
-- Unconfirmed import expiry and owner-only purge job, no cron requirement.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000012","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into fixes values('expired_import',to_jsonb(public.create_registry_import('10000000-0000-0000-0000-000000000001',
 '[{"unit_code":"T19 expired","person_first_name":"Expired","person_last_name":"PII","person_email":"expired.t19@example.test"}]',gen_random_uuid())));
select throws_ok($$select public.create_registry_import('10000000-0000-0000-0000-000000000001',
 jsonb_build_array(jsonb_build_object('unit_code','Huge','unknown_field',repeat('x',17000))),gen_random_uuid())$$,'22023','Invalid registry import','Oversized unknown staging field rejected before persistence');
reset role;
-- Owner-only time fixture; metadata alone is disabled and immediately restored, all changes roll back.
alter table public.registry_import disable trigger maintain_row_metadata;
update public.registry_import set registry_import_created_at=now()-interval '25 hours' where registry_import_id=(select(value#>>'{}')::uuid from fixes where key='expired_import');
alter table public.registry_import enable always trigger maintain_row_metadata;
select ok(app_private.purge_registry_import_pii()>=1,'Owner retention job purges expired staged PII');
select is((select registry_import_row_data from public.registry_import_row where registry_import_id=(select(value#>>'{}')::uuid from fixes where key='expired_import')),'{}'::jsonb,'Expired staging data removed');
set local role authenticated;
select is(public.confirm_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from fixes where key='expired_import'),gen_random_uuid())->>'status',
 'expired','Purged expired import can never apply defaults');
select throws_ok($$select app_private.purge_registry_import_pii()$$,'42501',null,'Client cannot invoke global retention job');
select throws_ok($$select public.registry_pending_verification('10000000-0000-0000-0000-000000000002')$$,'42501','Registry management denied','Verification queue is tenant isolated');
reset role;
-- Already-bound applicant attaches only their own person; submitted identity never overwrites it.
insert into fixes select 'bound_before',to_jsonb(p) from public.person p where p.person_id='30000000-0000-0000-0000-000000000005';
insert into public.unit_join_request(unit_join_request_id,tenant_id,unit_id,unit_join_request_user_id,unit_join_request_email,
 unit_join_request_first_name,unit_join_request_last_name,client_event_id)
 values('99000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',
 '20000000-0000-0000-0000-000000000005','member.ceibos@domus.local','Forged','Replacement',gen_random_uuid());
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000012","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into fixes values('bound_decision',public.decide_unit_join_request('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',
 '99000000-0000-0000-0000-000000000009',true,gen_random_uuid()));
select is((select value->>'status' from fixes where key='bound_decision'),'approved','Registry attaches applicant own Auth-bound person');
select is((select value->>'person_id' from fixes where key='bound_decision'),'30000000-0000-0000-0000-000000000005','Approval identity resolved only through Auth binding');
reset role;
select is((select to_jsonb(p) from public.person p where p.person_id='30000000-0000-0000-0000-000000000005'),(select value from fixes where key='bound_before'),'Bound identity data never rewritten from join payload');
-- Tenant failures alone activate stricter per-user budgets and a deduplicated abuse audit.
delete from app_private.registry_attempt where registry_attempt_scope_code in('join:user:99000000-0000-0000-0000-000000000001','join:alert:10000000-0000-0000-0000-000000000001');
insert into app_private.registry_attempt(registry_attempt_scope_code,registry_attempt_started_at,registry_attempt_count)
 values('join:tenant:10000000-0000-0000-0000-000000000001',now(),100)
 on conflict(registry_attempt_scope_code) do update set registry_attempt_started_at=now(),registry_attempt_count=100;
select set_config('request.jwt.claims','{"sub":"99000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.submit_unit_join_request('bad','{}',gen_random_uuid(),'10000000-0000-0000-0000-000000000001'),' {"status":"unavailable"}'::jsonb,'Tenant failure threshold returns uniform result');
select is(public.submit_unit_join_request((select value#>>'{}' from fixes where key='code'),'{"person_first_name":"Test","person_last_name":"Applicant"}',
 gen_random_uuid()),'{"status":"unavailable"}'::jsonb,'Exceeded tenant budget tightens existing user to one attempt');
reset role;
select is((select registry_attempt_count from app_private.registry_attempt where registry_attempt_scope_code='join:tenant:10000000-0000-0000-0000-000000000001'),101,'Throttled valid attempt does not increment tenant failures');
select ok(exists(select 1 from public.audit_event where audit_event_table_name='join_code_bruteforce_suspected' and audit_event_actor_user_id='99000000-0000-0000-0000-000000000001'),'Tenant threshold emits attributed PII-free abuse audit');
insert into auth.users(id,aud,role,email,email_confirmed_at) values
 ('99000000-0000-0000-0000-000000000010','authenticated','authenticated','fresh.t19@example.test',now());
select set_config('request.jwt.claims','{"sub":"99000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.submit_unit_join_request((select value#>>'{}' from fixes where key='code'),'{"person_first_name":"Fresh","person_last_name":"Applicant"}',
 gen_random_uuid())->>'status','pending','Fresh user valid code works despite exhausted tenant failures');
reset role;
select is((select registry_attempt_count from app_private.registry_attempt where registry_attempt_scope_code='join:tenant:10000000-0000-0000-0000-000000000001'),101,'Successful code never consumes tenant failure budget');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000012","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into fixes values('self_email_import',to_jsonb(public.create_registry_import('10000000-0000-0000-0000-000000000001',
 '[{"unit_code":"T19 self email","person_first_name":"Registry","person_last_name":"Self","person_email":"registry.ceibos@domus.local","unit_resident_is_holder":true}]',gen_random_uuid())));
select ok(public.preview_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from fixes where key='self_email_import'))
 ->'rows'->0->'errors' ? 'self_role_change','Self import via Auth email blocked even without registry email');
select throws_ok($$select public.save_unit('10000000-0000-0000-0000-000000000001',jsonb_build_object('unit_code','T19 long block','unit_block_code',repeat('x',101)),gen_random_uuid())$$,
 '23514',null,'Unit free-text fields bounded');
select throws_ok($$select public.save_pet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 jsonb_build_object('pet_name','Dog','pet_species_name','dog','pet_breed_name',repeat('x',101)),gen_random_uuid())$$,'23514',null,'Pet breed field bounded');
insert into fixes values('formula_import',to_jsonb(public.create_registry_import('10000000-0000-0000-0000-000000000001',
 '[{"unit_code":"=T19 raw formula","person_first_name":"=HYPERLINK(1)","person_last_name":"Formula","person_email":"formula.t19@example.test"}]',gen_random_uuid())));
select is(public.confirm_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from fixes where key='formula_import'),gen_random_uuid())->>'status',
 'confirmed','Formula-bearing values import as data');
select is((select person_first_name from public.person where person_email='formula.t19@example.test'),'=HYPERLINK(1)','Import stores formula characters unchanged');
reset role;
-- Deterministically exercise the uniqueness race fallback, without concurrent sessions or committed fixtures.
create function pg_temp.inject_claim_race() returns trigger language plpgsql as $$
begin
  insert into public.person(tenant_id,person_first_name,person_last_name,person_email)
    values(new.tenant_id,'Concurrent','Registry',new.person_email);
  return new;
end;
$$;
create trigger t19_inject_claim_race before update of person_email on public.person
 for each row when(new.person_email='race.t19@example.test') execute function pg_temp.inject_claim_race();
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into fixes values('race',to_jsonb(public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '{"person_first_name":"Holder","person_last_name":"Race","person_email":"race.t19@example.test"}', '{}',gen_random_uuid())));
select ok((select value is not null from fixes where key='race'),'Racing canonical identity write returns ordinary holder success');
reset role;
select ok((select person_email is null and person_claimed_email='race.t19@example.test' from public.person p join public.unit_resident r using(tenant_id,person_id)
 where r.unit_resident_id=(select(value#>>'{}')::uuid from fixes where key='race')),'Uniqueness race safely preserves unverified claim');
drop trigger t19_inject_claim_race on public.person;
-- Owner visibility must support the context loader after holder-created member consent.
insert into auth.users(id,aud,role,email,email_confirmed_at) values
 ('99000000-0000-0000-0000-000000000011','authenticated','authenticated','context.holder.t19@example.test',now()),
 ('99000000-0000-0000-0000-000000000012','authenticated','authenticated','context.join.t19@example.test',now());
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into fixes values('context_resident',to_jsonb(public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '{"person_first_name":"Context","person_last_name":"Holder member","person_email":"context.holder.t19@example.test","person_document_type":"dni","person_document_number":"70001006"}', '{}',gen_random_uuid())));
reset role;
insert into fixes select 'context_person',to_jsonb(person_id) from public.unit_resident where unit_resident_id=(select(value#>>'{}')::uuid from fixes where key='context_resident');
set local role authenticated;
insert into fixes select 'context_invite',to_jsonb(i) from public.create_resident_invitation('10000000-0000-0000-0000-000000000001',
 'a1000000-0000-0000-0000-000000000001','context.holder.t19@example.test','household_member',gen_random_uuid(),(select(value#>>'{}')::uuid from fixes where key='context_person')) i;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','99000000-0000-0000-0000-000000000011','role','authenticated','aal','aal1',
 'amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',floor(extract(epoch from statement_timestamp())))))::text,true);
set local role authenticated;
select lives_ok($$select public.accept_invitation((select value->>'invitation_token' from fixes where key='context_invite'))$$,'Holder-created member accepts proven mailbox invitation');
select is((select count(*) from public.person where user_id='99000000-0000-0000-0000-000000000011'),1::bigint,'Claim-bearing bound member reads own person row');
select is((select count(*) from public.membership m join public.person p using(tenant_id,person_id)
 where p.user_id='99000000-0000-0000-0000-000000000011' and m.membership_status='active'),1::bigint,'Context membership INNER JOIN person finds holder-created member');
reset role;
select ok((select person_claimed_email is null and person_email='context.holder.t19@example.test' and person_claimed_document_number='70001006'
 from public.person where person_id=(select(value#>>'{}')::uuid from fixes where key='context_person')),'Mailbox consent settles email only and preserves conflicting document claim');
-- Same owner/context regression for join-request approval and consent.
insert into public.unit_join_request(unit_join_request_id,tenant_id,unit_id,unit_join_request_user_id,unit_join_request_email,
 unit_join_request_first_name,unit_join_request_last_name,client_event_id)
 values('99000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '99000000-0000-0000-0000-000000000012','context.join.t19@example.test','Context','Join member',gen_random_uuid());
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000012","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into fixes values('context_join',public.decide_unit_join_request('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '99000000-0000-0000-0000-000000000013',true,gen_random_uuid()));
insert into fixes select 'context_join_invite',to_jsonb(i) from public.create_resident_invitation('10000000-0000-0000-0000-000000000001',
 'a1000000-0000-0000-0000-000000000001','context.join.t19@example.test','household_member',
 (select(value->>'invitation_client_event_id')::uuid from fixes where key='context_join'),(select(value->>'person_id')::uuid from fixes where key='context_join')) i;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','99000000-0000-0000-0000-000000000012','role','authenticated','aal','aal1',
 'amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',floor(extract(epoch from statement_timestamp())))))::text,true);
set local role authenticated;
select lives_ok($$select public.accept_invitation((select value->>'invitation_token' from fixes where key='context_join_invite'))$$,'Approved applicant accepts invitation');
select is((select count(*) from public.person where user_id='99000000-0000-0000-0000-000000000012'),1::bigint,'Approved bound applicant reads own person');
select is((select count(*) from public.membership m join public.person p using(tenant_id,person_id)
 where p.user_id='99000000-0000-0000-0000-000000000012' and m.membership_status='active'),1::bigint,'Context INNER JOIN finds approved applicant membership');
reset role;
insert into auth.users(id,aud,role,email,email_confirmed_at) values
 ('99000000-0000-0000-0000-000000000014','authenticated','authenticated','resident.1.7@domus.local',now());
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into fixes values('collision_email_resident',to_jsonb(public.save_resident('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
 '{"person_first_name":"Mailbox","person_last_name":"Claim","person_email":"resident.1.7@domus.local"}', '{}',gen_random_uuid())));
select ok((select value is not null from fixes where key='collision_email_resident'),'Other-unit email lookup yields ordinary holder success');
reset role;
insert into fixes select 'collision_email_person',to_jsonb(person_id) from public.unit_resident where unit_resident_id=(select(value#>>'{}')::uuid from fixes where key='collision_email_resident');
set local role authenticated;
insert into fixes select 'collision_email_invite',to_jsonb(i) from public.create_resident_invitation('10000000-0000-0000-0000-000000000001',
 'a1000000-0000-0000-0000-000000000001','resident.1.7@domus.local','household_member',gen_random_uuid(),(select(value#>>'{}')::uuid from fixes where key='collision_email_person')) i;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','99000000-0000-0000-0000-000000000014','role','authenticated','aal','aal1',
 'amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',floor(extract(epoch from statement_timestamp())))))::text,true);
set local role authenticated;
select lives_ok($$select public.accept_invitation((select value->>'invitation_token' from fixes where key='collision_email_invite'))$$,'Mailbox collision does not block consent to newly created person');
select is((select count(*) from public.membership m join public.person p using(tenant_id,person_id)
 where p.user_id='99000000-0000-0000-0000-000000000014'),1::bigint,'Unsettled own email claim still supports context membership join');
reset role;
select ok((select person_email is null and person_claimed_email='resident.1.7@domus.local' from public.person where person_id=(select(value#>>'{}')::uuid from fixes where key='collision_email_person')),
 'Colliding proven email remains for registry verification');
select * from finish();
rollback;
