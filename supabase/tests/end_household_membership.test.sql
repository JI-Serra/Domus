begin;
select no_plan();
create temp table end_fixture(key text primary key,value jsonb);
grant all on end_fixture to authenticated;
insert into end_fixture select 'person',to_jsonb(p) from public.person p where person_id='30000000-0000-0000-0000-000000000005';
insert into public.unit_resident(tenant_id,unit_id,person_id,unit_resident_relationship,unit_resident_is_holder,unit_resident_valid_from_at)
values('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000010','owner',true,'2020-01-01');
insert into public.membership(membership_id,tenant_id,unit_id,person_id,membership_role,membership_valid_from)
values('f2000000-0000-4000-8000-000000000002','10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000010','unit_holder','2020-01-01'),
('f2000000-0000-4000-8000-000000000003','10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','household_member','2020-01-01');
-- The same person retains a second unit membership.
insert into public.unit_resident(tenant_id,unit_id,person_id,unit_resident_relationship,unit_resident_valid_from_at)
values('10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000005','family','2020-01-01');
insert into public.membership(membership_id,tenant_id,unit_id,person_id,membership_role,membership_valid_from)
values('f2000000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000005','household_member','2020-01-01');
insert into public.invitation(tenant_id,unit_id,person_id,invitation_email,invitation_membership_role,invitation_token_hash,invitation_expires_at,invitation_created_by_user_id,client_event_id)
select '10000000-0000-0000-0000-000000000001',u,'30000000-0000-0000-0000-000000000005','end.member@domus.local','household_member',
encode(extensions.digest(u::text,'sha256'),'hex'),now()+interval '1 day','20000000-0000-0000-0000-000000000002',gen_random_uuid()
from unnest(array['a1000000-0000-0000-0000-000000000001'::uuid,'a1000000-0000-0000-0000-000000000002'::uuid]) u;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.end_household_membership('f2000000-0000-4000-8000-000000000002',gen_random_uuid())$$,'42501','Household membership management denied','Same unit co-holder denied');
select throws_ok($$select public.end_household_membership('f2000000-0000-4000-8000-000000000003',gen_random_uuid())$$,'42501','Household membership management denied','Own household membership denied');
select throws_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000005',null)$$,'42501','Household membership management denied','Null event denied uniformly');
select throws_ok($$select public.end_household_membership('f2000000-0000-4000-8000-000000000001',gen_random_uuid())$$,'42501','Household membership management denied','Other unit denied');
select throws_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000010',gen_random_uuid())$$,'42501','Household membership management denied','Co-holder denied');
select throws_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000004',gen_random_uuid())$$,'42501','Household membership management denied','Self holder denied');
select throws_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000002',gen_random_uuid())$$,'42501','Household membership management denied','Admin denied');
select throws_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000003',gen_random_uuid())$$,'42501','Household membership management denied','Guard denied');
select throws_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000009',gen_random_uuid())$$,'42501','Household membership management denied','Cross tenant denied');
select throws_ok($$select public.end_household_membership('f2000000-0000-4000-8000-000000009999',gen_random_uuid())$$,'42501','Household membership management denied','Missing target denied');
select lives_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000005','f2000000-0000-4000-8000-000000000010')$$,'Holder ends own member');
select lives_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000005','f2000000-0000-4000-8000-000000000010')$$,'Same event is idempotent');
select throws_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000005',gen_random_uuid())$$,'42501','Household membership management denied','New event cannot end revoked membership');
reset role;
select is((select membership_status::text from public.membership where membership_id='40000000-0000-0000-0000-000000000005'),'revoked','Membership revoked');
select ok((select membership_valid_to is not null and membership_valid_to>membership_valid_from from public.membership where membership_id='40000000-0000-0000-0000-000000000005'),'Validity ended');
select is((select count(*) from public.membership_household_permission where membership_id='40000000-0000-0000-0000-000000000005'),0::bigint,'Delegations removed');
select is((select invitation_status::text from public.invitation where person_id='30000000-0000-0000-0000-000000000005' and unit_id='a1000000-0000-0000-0000-000000000001'),'revoked','Own unit invitation revoked');
select is((select invitation_status::text from public.invitation where person_id='30000000-0000-0000-0000-000000000005' and unit_id='a1000000-0000-0000-0000-000000000002'),'pending','Other unit invitation intact');
select is((select membership_status::text from public.membership where membership_id='f2000000-0000-4000-8000-000000000001'),'active','Other membership intact');
select is((select to_jsonb(p) from public.person p where person_id='30000000-0000-0000-0000-000000000005'),(select value from end_fixture where key='person'),'Identity and user binding intact');
select is((select count(*) from public.audit_event where audit_event_table_name='membership' and audit_event_row_id='40000000-0000-0000-0000-000000000005' and audit_event_diff->'membership_status'->>'new'='revoked'),1::bigint,'Exactly one audited revocation');
select ok(exists(select 1 from public.audit_event where audit_event_row_id='40000000-0000-0000-0000-000000000005' and audit_event_actor_user_id='20000000-0000-0000-0000-000000000004' and audit_event_diff->'membership_status'->>'new'='revoked'),'Audit attributed to holder');
-- Registry can terminate a member outside the holder unit.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.end_household_membership('f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000010')$$,'42501','Household membership management denied','Retry event cannot change actor or target');
select throws_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000009',gen_random_uuid())$$,'42501','Household membership management denied','Registry cross tenant denied');
select lives_ok($$select public.end_household_membership('f2000000-0000-4000-8000-000000000001',gen_random_uuid())$$,'Registry ends household member');
reset role;
-- Separate seeded tenant exercises support binding, minority and suspended writes.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
insert into end_fixture values('support',to_jsonb(public.start_support_session('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000008','End membership test',gen_random_uuid())));
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000008','role','authenticated','aal','aal1',
'session_id',(select value->>'support_session_id' from end_fixture where key='support'),
'support_session_id',(select value->>'support_session_id' from end_fixture where key='support'),
'support_tenant_id','10000000-0000-0000-0000-000000000002','impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
'exp',floor(extract(epoch from((select value->>'support_session_expires_at' from end_fixture where key='support')::timestamptz))))::text,true);
set local role authenticated;
select ok(app_private.current_identity_is_valid(),'Support holder validated');
select throws_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000005',gen_random_uuid())$$,'42501','Household membership management denied','Support bound tenant denies foreign target');
reset role;
update public.tenant set tenant_subscription_status='suspended' where tenant_id='10000000-0000-0000-0000-000000000002';
set local role authenticated;
select throws_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000009',gen_random_uuid())$$,'42501','Household membership management denied','Suspended tenant denied');
reset role;
update public.tenant set tenant_subscription_status='active' where tenant_id='10000000-0000-0000-0000-000000000002';
-- A legacy active membership whose residence is now flagged minor is still terminable.
update public.unit_resident set unit_resident_is_minor=true where person_id='30000000-0000-0000-0000-000000000009';
set local role authenticated;
select lives_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000009',gen_random_uuid())$$,'Support holder ends minor member in bound tenant');
reset role;
select ok(exists(select 1 from public.audit_event where audit_event_row_id='40000000-0000-0000-0000-000000000009'
and audit_event_diff->'membership_status'->>'new'='revoked' and audit_event_actor_user_id='20000000-0000-0000-0000-000000000001'
and audit_event_on_behalf_of_user_id='20000000-0000-0000-0000-000000000008'),'Support actor audited');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000008","role":"authenticated","aal":"aal1","support_session_id":"invalid"}',true);
set local role authenticated;
select throws_ok($$select public.end_household_membership('40000000-0000-0000-0000-000000000009',gen_random_uuid())$$,'42501','Household membership management denied','Malformed support denied uniformly');
reset role;
select * from finish();
rollback;
