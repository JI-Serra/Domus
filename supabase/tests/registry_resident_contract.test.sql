begin;
select no_plan();
create temp table tenant_attempt_baseline as select coalesce((select registry_attempt_count from app_private.registry_attempt
 where registry_attempt_scope_code='join:tenant:10000000-0000-0000-0000-000000000002' and registry_attempt_started_at>statement_timestamp()-interval '15 minutes'),0) attempt_count;
create temp table contract_fixture(key text primary key,value jsonb);
grant all on contract_fixture to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at) values
 ('20000000-0000-0000-0000-000000000018','authenticated','authenticated','contract.applicant@domus.local',now()),
 ('20000000-0000-0000-0000-000000000019','authenticated','authenticated','contract.other@domus.local',now());
insert into public.unit_join_code(tenant_id,unit_id,unit_join_code_hash,unit_join_code_rotated_by_user_id) values
 ('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',encode(extensions.digest('23456789ABCD','sha256'),'hex'),'20000000-0000-0000-0000-000000000004'),
 ('10000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001',encode(extensions.digest('23456789ABCE','sha256'),'hex'),'20000000-0000-0000-0000-000000000008')
 on conflict(tenant_id,unit_id) do update set unit_join_code_hash=excluded.unit_join_code_hash;
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000018","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.submit_unit_join_request('23456789ABCD','{"person_first_name":"Test","person_last_name":"Applicant"}',gen_random_uuid(),
 '10000000-0000-0000-0000-000000000002'),'{"status":"unavailable"}'::jsonb,'Explicit mismatching tenant is unavailable');
insert into contract_fixture values('request',public.submit_unit_join_request('2345-6789-abcd','{"person_first_name":"Test","person_last_name":"Applicant"}',
 'f1800000-0000-4000-8000-000000000001'));
select is((select value->>'status' from contract_fixture where key='request'),'pending','Omitted tenant resolves valid code');
select is(public.submit_unit_join_request('23456789ABCD','{"person_first_name":"Test","person_last_name":"Applicant"}',
 'f1800000-0000-4000-8000-000000000001',null),(select value from contract_fixture where key='request'),'Explicit null tenant retry is stable');
insert into contract_fixture values('foreign_request',public.submit_unit_join_request('23456789ABCE','{"person_first_name":"Test","person_last_name":"Applicant"}',gen_random_uuid()));
select is((select count(*) from public.my_unit_join_requests()),2::bigint,'Applicant without membership sees own requests across tenants');
select is((select count(*) from public.unit),0::bigint,'Own request list grants no tenant browsing');
select is((select array_agg(k order by k) from jsonb_object_keys((select to_jsonb(r) from public.my_unit_join_requests() r limit 1)) k),
 array['tenant_name','unit_code','unit_join_request_created_at','unit_join_request_id','unit_join_request_status']::text[],'List has exactly five minimized fields');
select is(public.submit_unit_join_request('wrong','{}',gen_random_uuid()),'{"status":"unavailable"}'::jsonb,'Malformed tenantless code is uniform');
select is(public.submit_unit_join_request('23456789ABCD','{"person_first_name":"Test","person_last_name":"Applicant"}',gen_random_uuid()),
 '{"status":"unavailable"}'::jsonb,'All user attempts including tenantless attempts count toward limit');
reset role;
select is((select registry_attempt_count from app_private.registry_attempt where registry_attempt_scope_code='join:user:20000000-0000-0000-0000-000000000018'),6,'User counter includes failures successes and retries');
select is((select registry_attempt_count from app_private.registry_attempt where registry_attempt_scope_code='join:tenant:10000000-0000-0000-0000-000000000002'),(select attempt_count+1 from tenant_attempt_baseline),'Tenant counter excludes successful attempts');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000019","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.my_unit_join_requests()),0::bigint,'Other user sees no requests');
select throws_ok($$select public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request'),gen_random_uuid())$$,'42501','Join request management denied','Other user cancellation denied uniformly');
select throws_ok($$select public.cancel_unit_join_request('f1800000-0000-4000-8000-000000000099',gen_random_uuid())$$,'42501','Join request management denied','Missing request has same denial');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000018","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request'),null)$$,'42501','Join request management denied','Null event has same denial');
select is(public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request'),'f1800000-0000-4000-8000-000000000002'), '{"status":"cancelled"}'::jsonb,'Owner cancels pending request');
select is(public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request'),'f1800000-0000-4000-8000-000000000002'), '{"status":"cancelled"}'::jsonb,'Same event returns original result');
select is((select unit_join_request_status::text from public.my_unit_join_requests() where unit_join_request_id=(select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request')),'cancelled','Cancelled status is in own list');
select throws_ok($$select public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request'),gen_random_uuid())$$,'42501','Join request management denied','New event cannot cancel nonpending request');
select throws_ok($$select public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='foreign_request'),'f1800000-0000-4000-8000-000000000002')$$,'42501','Join request management denied','Reused event for another request denied uniformly');
reset role;
select is((select count(*) from public.audit_event where audit_event_table_name='unit_join_request'
 and audit_event_row_id=(select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request') and audit_event_action='update'),1::bigint,'Cancellation audited exactly once');
select ok(exists(select 1 from public.audit_event where audit_event_row_id=(select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request')
 and audit_event_actor_user_id='20000000-0000-0000-0000-000000000018' and audit_event_diff->'unit_join_request_status'->>'new'='cancelled'),'Audit records caller and cancellation');
update public.tenant set tenant_subscription_status='suspended' where tenant_id='10000000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select count(*) from public.my_unit_join_requests()),2::bigint,'Suspended tenant request remains readable');
select throws_ok($$select public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='foreign_request'),gen_random_uuid())$$,'42501','Join request management denied','Suspended tenant cancellation denied uniformly');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000019","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.submit_unit_join_request('23456789ABCE','{"person_first_name":"Test","person_last_name":"Other"}',gen_random_uuid()),
 '{"status":"unavailable"}'::jsonb,'Suspended tenant code unavailable');
reset role;
update public.tenant set tenant_subscription_status='cancelled' where tenant_id='10000000-0000-0000-0000-000000000002';
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000018","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.my_unit_join_requests()),1::bigint,'Cancelled tenant requests hidden');
select throws_ok($$select public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='foreign_request'),gen_random_uuid())$$,'42501','Join request management denied','Cancelled tenant cancellation denied uniformly');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000019","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.submit_unit_join_request('23456789ABCE','{"person_first_name":"Test","person_last_name":"Other"}',gen_random_uuid()),
 '{"status":"unavailable"}'::jsonb,'Cancelled tenant code unavailable');
reset role;
update public.tenant set tenant_subscription_status='active' where tenant_id='10000000-0000-0000-0000-000000000002';
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->'member_permissions'->'40000000-0000-0000-0000-000000000005','["manage_access_authorizations"]'::jsonb,'Holder sees delegated household permissions');
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001')$$,'42501','Unit sheet denied','Holder cannot read foreign map');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->'member_permissions'->'40000000-0000-0000-0000-000000000005','["manage_access_authorizations"]'::jsonb,'Registry admin sees delegated household permissions');
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001')$$,'42501','Unit sheet denied','Registry admin cannot read foreign map');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->'member_permissions','{}'::jsonb,'Household member cannot see delegation map');
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001')$$,'42501','Unit sheet denied','Household member cannot read foreign map');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
insert into contract_fixture values('support_holder',to_jsonb(public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','Contract isolation test',gen_random_uuid())));
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000004','role','authenticated','aal','aal1',
 'session_id',(select value->>'support_session_id' from contract_fixture where key='support_holder'),
 'support_session_id',(select value->>'support_session_id' from contract_fixture where key='support_holder'),
 'support_tenant_id','10000000-0000-0000-0000-000000000001','impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
 'exp',floor(extract(epoch from((select value->>'support_session_expires_at' from contract_fixture where key='support_holder')::timestamptz))))::text,true);
set local role authenticated;
select ok(app_private.current_identity_is_valid(),'Support holder identity is live');
select is(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->'member_permissions'->'40000000-0000-0000-0000-000000000005',
 '["manage_access_authorizations"]'::jsonb,'Support holder follows target map rights');
select throws_ok($$select public.my_unit_join_requests()$$,'42501','Join request management denied','Support holder cannot list applicant requests');
select throws_ok($$select public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request'),gen_random_uuid())$$,'42501','Join request management denied','Support holder cannot cancel requests');
select is(public.submit_unit_join_request('23456789ABCD','{}',gen_random_uuid()),'{"status":"unavailable"}'::jsonb,'Support holder cannot submit');
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001')$$,'42501','Unit sheet denied','Support holder bound tenant denies foreign map');
select lives_ok($$select public.end_support_session((select (value->>'support_session_id')::uuid from contract_fixture where key='support_holder'))$$,'Support holder session closes');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
insert into contract_fixture values('support_admin',to_jsonb(public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Contract isolation test',gen_random_uuid())));
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated','aal','aal1',
 'session_id',(select value->>'support_session_id' from contract_fixture where key='support_admin'),
 'support_session_id',(select value->>'support_session_id' from contract_fixture where key='support_admin'),
 'support_tenant_id','10000000-0000-0000-0000-000000000001','impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
 'exp',floor(extract(epoch from((select value->>'support_session_expires_at' from contract_fixture where key='support_admin')::timestamptz))))::text,true);
set local role authenticated;
select ok(app_private.current_identity_is_valid(),'Support admin identity is live');
select is(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->'member_permissions'->'40000000-0000-0000-0000-000000000005',
 '["manage_access_authorizations"]'::jsonb,'Support admin follows target map rights');
select throws_ok($$select public.my_unit_join_requests()$$,'42501','Join request management denied','Support admin cannot list applicant requests');
select throws_ok($$select public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request'),gen_random_uuid())$$,'42501','Join request management denied','Support admin cannot cancel requests');
select is(public.submit_unit_join_request('23456789ABCD','{}',gen_random_uuid()),'{"status":"unavailable"}'::jsonb,'Support admin cannot submit');
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001')$$,'42501','Unit sheet denied','Support admin bound tenant denies foreign map');
select lives_ok($$select public.end_support_session((select (value->>'support_session_id')::uuid from contract_fixture where key='support_admin'))$$,'Support admin session closes');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
insert into contract_fixture values('support_member',to_jsonb(public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005','Contract isolation test',gen_random_uuid())));
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000005','role','authenticated','aal','aal1',
 'session_id',(select value->>'support_session_id' from contract_fixture where key='support_member'),
 'support_session_id',(select value->>'support_session_id' from contract_fixture where key='support_member'),
 'support_tenant_id','10000000-0000-0000-0000-000000000001','impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
 'exp',floor(extract(epoch from((select value->>'support_session_expires_at' from contract_fixture where key='support_member')::timestamptz))))::text,true);
set local role authenticated;
select ok(app_private.current_identity_is_valid(),'Support member identity is live');
select is(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->'member_permissions',
 '{}'::jsonb,'Support member follows target map rights');
select throws_ok($$select public.my_unit_join_requests()$$,'42501','Join request management denied','Support member cannot list applicant requests');
select throws_ok($$select public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request'),gen_random_uuid())$$,'42501','Join request management denied','Support member cannot cancel requests');
select is(public.submit_unit_join_request('23456789ABCD','{}',gen_random_uuid()),'{"status":"unavailable"}'::jsonb,'Support member cannot submit');
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001')$$,'42501','Unit sheet denied','Support member bound tenant denies foreign map');
select lives_ok($$select public.end_support_session((select (value->>'support_session_id')::uuid from contract_fixture where key='support_member'))$$,'Support member session closes');
reset role;
-- Terminal decisions never become cancellation, and event receipts cannot be replayed by another actor.
insert into public.unit_join_request(tenant_id,unit_id,unit_join_request_user_id,unit_join_request_email,
 unit_join_request_first_name,unit_join_request_last_name,unit_join_request_status,unit_join_request_decided_at,
 unit_join_request_decided_by_user_id,client_event_id)
 select '10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000018',
 'contract.applicant@domus.local','Test','Terminal',status::public.unit_join_request_status,now(),
 '20000000-0000-0000-0000-000000000004',gen_random_uuid() from unnest(array['approved','rejected']) status;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000018","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok(format('select public.cancel_unit_join_request(%L,gen_random_uuid())',r.unit_join_request_id),
 '42501','Join request management denied','Cannot cancel own '||r.unit_join_request_status||' request')
 from public.my_unit_join_requests() r where r.unit_join_request_status in('approved','rejected');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000019","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request'),
 'f1800000-0000-4000-8000-000000000002')$$,'42501','Join request management denied','Other actor cannot replay cancellation receipt');
reset role;
delete from public.membership_household_permission where membership_id='40000000-0000-0000-0000-000000000005';
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->'member_permissions'->'40000000-0000-0000-0000-000000000005',
 '[]'::jsonb,'Member with no delegation has empty permission array');
reset role;
update public.tenant set tenant_subscription_status='suspended' where tenant_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->'member_permissions'->'40000000-0000-0000-0000-000000000005',
 '[]'::jsonb,'Holder map remains readable in suspended tenant');
reset role;
update public.tenant set tenant_subscription_status='cancelled' where tenant_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')$$,
 '42501','Unit sheet denied','Cancelled tenant denies holder map');
reset role;
update public.tenant set tenant_subscription_status='active' where tenant_id='10000000-0000-0000-0000-000000000001';
update public.membership set membership_status='suspended' where membership_id='40000000-0000-0000-0000-000000000004';
set local role authenticated;
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')$$,
 '42501','Unit sheet denied','Inactive holder cannot see permission map');
reset role;
select set_config('request.jwt.claims','{}',true);
set local role authenticated;
select throws_ok($$select public.my_unit_join_requests()$$,'42501','Join request management denied','Missing identity cannot list requests');
select throws_ok($$select public.cancel_unit_join_request((select (value->>'unit_join_request_id')::uuid from contract_fixture where key='request'),gen_random_uuid())$$,'42501','Join request management denied','Missing identity cannot cancel');
reset role;
select * from finish();
rollback;
