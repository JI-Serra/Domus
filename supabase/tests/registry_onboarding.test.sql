begin;
select no_plan();
create temp table onboarding_fixture(key text primary key,value jsonb);
grant all on onboarding_fixture to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at) values
  ('20000000-0000-0000-0000-000000000013','authenticated','authenticated','joiner@domus.local',now()),
  ('20000000-0000-0000-0000-000000000014','authenticated','authenticated','rejecter@domus.local',now());
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into onboarding_fixture values('code',to_jsonb(public.rotate_unit_join_code('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')));
select throws_ok($$select public.rotate_unit_join_code('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002')$$,
  '42501','Registry management denied','Holder cannot rotate another unit code');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000013","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.submit_unit_join_request('10000000-0000-0000-0000-000000000001','AAAA-AAAA-AAAA','{"person_first_name":"Join","person_last_name":"Adult"}',gen_random_uuid()),
  '{"status":"unavailable"}'::jsonb,'Wrong join code uniform result');
select is(public.submit_unit_join_request('10000000-0000-0000-0000-000000000002',(select value#>>'{}' from onboarding_fixture where key='code'),
  '{"person_first_name":"Join","person_last_name":"Adult"}',gen_random_uuid()),'{"status":"unavailable"}'::jsonb,'Tenant mismatch has same result');
insert into onboarding_fixture values('request',public.submit_unit_join_request('10000000-0000-0000-0000-000000000001',
  lower((select value#>>'{}' from onboarding_fixture where key='code')),'{"person_first_name":"Join","person_last_name":"Adult"}',
  'f3000000-0000-4000-8000-000000000001'));
select is((select value->>'status' from onboarding_fixture where key='request'),'pending','Case-insensitive code creates pending request');
select is(public.submit_unit_join_request('10000000-0000-0000-0000-000000000001',(select value#>>'{}' from onboarding_fixture where key='code'),
  '{"person_first_name":"Join","person_last_name":"Adult"}','f3000000-0000-4000-8000-000000000001'),
  (select value from onboarding_fixture where key='request'),'Join request retry returns same pending request');
select is((select count(*) from public.membership),0::bigint,'Pending applicant has no membership');
select is((select count(*) from public.unit),0::bigint,'Pending applicant has no unit access');
select throws_ok($$select public.unit_sheet('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')$$,
  '42501','Unit sheet denied','Knowing valid code never grants sheet access');
select is(public.submit_unit_join_request('10000000-0000-0000-0000-000000000001','short','{}',gen_random_uuid()),'{"status":"unavailable"}'::jsonb,'Malformed code uniform result');
select is(public.submit_unit_join_request('10000000-0000-0000-0000-000000000001',(select value#>>'{}' from onboarding_fixture where key='code'),
  '{"person_first_name":"Join","person_last_name":"Adult"}',gen_random_uuid()),'{"status":"unavailable"}'::jsonb,'Sixth attempt throttled including valid code');
reset role;
select is((select registry_attempt_count from app_private.registry_attempt where registry_attempt_scope_code='join:user:20000000-0000-0000-0000-000000000013'),6,'Failed attempt counters persist');
select ok((select registry_attempt_count>=2 from app_private.registry_attempt where registry_attempt_scope_code='join:tenant:10000000-0000-0000-0000-000000000001'),'Tenant counter counts only wrong codes');
delete from app_private.registry_attempt where registry_attempt_scope_code like 'join:user:%';
-- Tenant failed throttle cannot lock out a different user with a valid code (coordinator correction).
insert into app_private.registry_attempt(registry_attempt_scope_code,registry_attempt_started_at,registry_attempt_count) values('join:tenant:10000000-0000-0000-0000-000000000001',now(),101)
  on conflict(registry_attempt_scope_code) do update set registry_attempt_count=101;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000014","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into onboarding_fixture values('reject_request',public.submit_unit_join_request('10000000-0000-0000-0000-000000000001',
  (select value#>>'{}' from onboarding_fixture where key='code'),'{"person_first_name":"Rejected","person_last_name":"Applicant"}',gen_random_uuid()));
select is((select value->>'status' from onboarding_fixture where key='reject_request'),'pending','Tenant failed counter cannot deny valid code');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.decide_unit_join_request('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',
  (select(value->>'unit_join_request_id')::uuid from onboarding_fixture where key='request'),true,gen_random_uuid())$$,
  '42501','Registry management denied','Holder cannot decide another unit request');
select throws_ok($$select public.decide_unit_join_request('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  (select(value->>'unit_join_request_id')::uuid from onboarding_fixture where key='request'),true,gen_random_uuid(),'unit_holder')$$,
  '42501','Join request management denied','Holder approval cannot grant holder role');
insert into onboarding_fixture values('approved',public.decide_unit_join_request('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  (select(value->>'unit_join_request_id')::uuid from onboarding_fixture where key='request'),true,'f3000000-0000-4000-8000-000000000002'));
select is((select value->>'status' from onboarding_fixture where key='approved'),'approved','Holder approval creates invitation');
select is(public.decide_unit_join_request('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  (select(value->>'unit_join_request_id')::uuid from onboarding_fixture where key='request'),true,'f3000000-0000-4000-8000-000000000002'),
  (select value from onboarding_fixture where key='approved'),'Decision retry stable');
select is(public.decide_unit_join_request('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  (select(value->>'unit_join_request_id')::uuid from onboarding_fixture where key='reject_request'),false,gen_random_uuid())->>'status','rejected','Holder can reject pending request');
insert into onboarding_fixture select 'invitation',to_jsonb(i) from public.create_resident_invitation('10000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001','joiner@domus.local','household_member',
  (select(value->>'invitation_client_event_id')::uuid from onboarding_fixture where key='approved'),(select(value->>'person_id')::uuid from onboarding_fixture where key='approved')) i;
select lives_ok($$select public.mark_resident_invitation_delivered('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
  (select(value->>'invitation_id')::uuid from onboarding_fixture where key='invitation'))$$,'Email delivery marker supports holder invitation');
select is((select i.invitation_token from public.create_resident_invitation('10000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001','joiner@domus.local','household_member',
  (select(value->>'invitation_client_event_id')::uuid from onboarding_fixture where key='approved'),(select(value->>'person_id')::uuid from onboarding_fixture where key='approved')) i),
  null::text,'Delivered resident invitation never exposes/re-mails token on retry');
insert into onboarding_fixture values('old_code',(select value from onboarding_fixture where key='code'));
insert into onboarding_fixture values('new_code',to_jsonb(public.rotate_unit_join_code('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')));
reset role;
select is((select count(*) from public.membership m join public.person p using(tenant_id,person_id) where p.user_id='20000000-0000-0000-0000-000000000013'),0::bigint,'Approval still grants no account access before mailbox proof');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000013","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.submit_unit_join_request('10000000-0000-0000-0000-000000000001',(select value#>>'{}' from onboarding_fixture where key='old_code'),
  '{"person_first_name":"Join","person_last_name":"Adult"}',gen_random_uuid()),'{"status":"unavailable"}'::jsonb,'Rotated code returns same unavailable result');
select throws_ok($$select public.accept_invitation((select value->>'invitation_token' from onboarding_fixture where key='invitation'))$$,
  '42501','Invitation unavailable','Approval cannot bypass H1 mailbox proof');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000013','role','authenticated','aal','aal1',
  'amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from statement_timestamp())+1)))::text,true);
set local role authenticated;
insert into onboarding_fixture values('membership',to_jsonb(public.accept_invitation((select value->>'invitation_token' from onboarding_fixture where key='invitation'))));
select is((select unit_id from public.membership where membership_id=(select(value#>>'{}')::uuid from onboarding_fixture where key='membership')),
  'a1000000-0000-0000-0000-000000000001'::uuid,'Email consent grants the correct unit scope');
select is(public.current_household_permissions('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),
  array['manage_access_authorizations']::public.household_permission[],'New member defaults only to authorizations');
select throws_ok($$select public.accept_invitation((select value->>'invitation_token' from onboarding_fixture where key='invitation'))$$,
  '42501','Invitation unavailable','Resident invitation single-use replay rejected');
reset role;
select ok(not exists(select 1 from public.audit_event where audit_event_table_name='unit_join_code' and audit_event_diff::text like '%'||(select value#>>'{}' from onboarding_fixture where key='new_code')||'%'),
  'Raw unit join code never persisted in audit');
select * from finish();
rollback;
