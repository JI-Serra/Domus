begin;
select no_plan();
create temp table support_fixture(support_session_id uuid);
create temp table support_claims(claims jsonb);
grant select,insert on support_claims to authenticated;
grant select,insert,delete on support_fixture to authenticated;

-- Guard the single identity choke point in current and future client surfaces.
select is((select count(*) from pg_proc p where p.pronamespace='public'::regnamespace
  and p.prokind='f' and pg_get_functiondef(p.oid) ~ 'auth[.](uid|jwt)[(]'),0::bigint,
  'Exposed functions never bypass central identity validation');
select is((select count(*) from pg_policies where schemaname in ('public','storage')
  and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'auth[.](uid|jwt)[(]'),0::bigint,
  'Public and Storage policies never bypass central identity validation');
select ok(not pg_has_role('authenticated','invitation_acceptor','MEMBER'),'Clients cannot assume consent capability');
select ok(not pg_has_role('service_role','invitation_acceptor','MEMBER'),'Service cannot assume consent capability');
select ok(not has_schema_privilege('invitation_acceptor','public','CREATE'),'Consent capability cannot create RPCs');
select is((select public from storage.buckets where id='tenant-logo'),false,'Tenant logo bucket is private');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.current_user_is_platform_admin(),true,'AAL1 platform status permits MFA routing');
select throws_ok($$select public.create_tenant('Test','test')$$,'42501','MFA platform administrator required','Tenant creation requires MFA');
select throws_ok($$select public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Support',gen_random_uuid())$$,
  '42501','MFA platform administrator required','Support creation requires MFA');
select throws_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','other@example.com','tenant_admin',repeat('c',64),now()+interval '1 day',gen_random_uuid(),null,'Test','Invite',enum_range(null::public.admin_permission))$$,
  '42501','Invitation management denied','Platform invitation requires MFA');
select throws_ok($$select public.end_support_session(gen_random_uuid())$$,'42501','Support session denied','Support ending requires MFA');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select is(public.current_user_is_platform_admin(),true,'AAL2 platform status is true');
select lives_ok($$select public.create_tenant('New Tenant','new-tenant',client_event_id=>'80000000-0000-0000-0000-000000000001')$$,'MFA creates tenant');
select lives_ok($$select public.create_tenant('New Tenant','new-tenant',client_event_id=>'80000000-0000-0000-0000-000000000001')$$,'Tenant creation is idempotent');
select is((select tenant_settings->>'locale' from public.tenant where tenant_slug='new-tenant'),'es-AR','Onboarding applies default settings');
select is((select cardinality(tenant_billable_unit_statuses) from public.tenant where tenant_slug='new-tenant'),3,'Default billable statuses are typed');
select throws_ok($$select public.create_tenant('Invalid','Invalid slug')$$,'22023','Invalid tenant input','Invalid tenant slug rejected');
select throws_ok($$select public.create_tenant('Invalid','invalid',tenant_time_zone=>'Invalid/Zone')$$,'22023','Invalid tenant input','Invalid time zone rejected');
select throws_ok($$select public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Support',gen_random_uuid())$$,
  '42501','Support session denied','Platform target rejected');
select throws_ok($$select public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000006','Support',gen_random_uuid())$$,
  '42501','Support session denied','Cross-tenant support target rejected');
select throws_ok($$select public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',' ',gen_random_uuid())$$,
  '22023','Invalid support session input','Empty support reason rejected');
select throws_ok($$select public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Support',gen_random_uuid(),61)$$,
  '22023','Invalid support session input','Support duration above 60 rejected');
insert into support_fixture select (public.start_support_session('10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002','Investigate incident','80000000-0000-0000-0000-000000000002')).support_session_id;
select throws_ok($$select public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Support',gen_random_uuid())$$,
  '55000','Support session already active','One active support session per actor');
reset role;
insert into storage.objects(bucket_id,name) values
  ('tenant-logo','10000000-0000-0000-0000-000000000001/logo.png'),
  ('tenant-logo','10000000-0000-0000-0000-000000000002/logo.png');

insert into public.support_session(tenant_id,support_session_actor_user_id,support_session_target_user_id,
  support_session_reason,support_session_started_at,support_session_expires_at,support_session_ended_at,support_session_status,client_event_id)
values('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000006',
  'Tenant B support fixture',now()-interval '1 hour',now()-interval '30 minutes',now()-interval '45 minutes','ended',gen_random_uuid());
select throws_ok($$insert into public.support_session(tenant_id,support_session_actor_user_id,support_session_target_user_id,
  support_session_reason,support_session_expires_at,client_event_id,support_session_status,support_session_ended_at) values('10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000006','Cross tenant',now()+interval '30 minutes',gen_random_uuid(),'ended',now())$$,
  '23503',null,'Composite support target foreign key prevents cross-tenant reference');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.support_session),1::bigint,'B audit admin reads B support example');
select is((select count(*) from public.invitation),1::bigint,'B manager reads B accepted invitation');
select is((select count(*) from public.support_session where tenant_id='10000000-0000-0000-0000-000000000001'),0::bigint,'B cannot read A support rows');
select is((select count(*) from public.invitation where tenant_id='10000000-0000-0000-0000-000000000001'),0::bigint,'B cannot read A invitation rows');
select throws_ok($$insert into public.invitation(tenant_id) values('10000000-0000-0000-0000-000000000001')$$,'42501',null,'B cannot directly insert A invitation');
select throws_ok($$update public.support_session set support_session_reason='Blocked' where tenant_id='10000000-0000-0000-0000-000000000001'$$,'42501',null,'B cannot directly update A support row');
select throws_ok($$delete from public.invitation where tenant_id='10000000-0000-0000-0000-000000000001'$$,'42501',null,'B cannot directly delete A invitation');
reset role;
-- New table isolation: an A administrator sees A and cannot mutate either table directly.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.current_user_is_platform_admin(),false,'Tenant admin is not a platform admin');
select is((select count(*) from public.invitation where tenant_id='10000000-0000-0000-0000-000000000002'),0::bigint,'A cannot read B invitations');
select is((select count(*) from public.invitation where tenant_id='10000000-0000-0000-0000-000000000001'),1::bigint,'A reads own invitation');
select is((select count(*) from public.support_session where tenant_id='10000000-0000-0000-0000-000000000002'),0::bigint,'A cannot read B support sessions');
select is((select count(*) from public.support_session),2::bigint,'Audit admin sees support reason and duration');
select is((select count(*) from storage.objects where bucket_id='tenant-logo'),1::bigint,'A reads own logo');
select throws_ok($$update public.invitation set invitation_status='revoked'$$,'42501',null,'Client cannot update invitations');
select throws_ok($$delete from public.invitation$$,'42501',null,'Client cannot delete invitations');
select throws_ok($$insert into public.support_session(tenant_id) values('10000000-0000-0000-0000-000000000002')$$,'42501',null,'A cannot write B support session');
select throws_ok($$update public.support_session set support_session_reason='Forged'$$,'42501',null,'Client cannot update support sessions');
select throws_ok($$delete from public.support_session$$,'42501',null,'Client cannot delete support sessions');
select lives_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','holder.tipas@domus.local','guard',
  encode(extensions.digest(repeat('c',64),'sha256'),'hex'),now()+interval '1 day','80000000-0000-0000-0000-000000000003',null,'New','Guard')$$,'Registry admin creates invitation');
select throws_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000002','holder.tipas@domus.local','guard',repeat('d',64),now()+interval '1 day',gen_random_uuid(),null,'New','Guard')$$,
  '42501','Invitation management denied','A cannot invite into B');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000012","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','someone@example.com','tenant_admin',repeat('d',64),now()+interval '1 day',gen_random_uuid(),null,'New','Admin')$$,
  '42501','Invitation management denied','Registry cannot invite admins');
select is((select count(*) from public.support_session),0::bigint,'Admin without access_audit cannot read support sessions');
reset role;

-- Suspended remains readable but all writes, including existing management RPCs, fail.
update public.tenant set tenant_subscription_status='suspended' where tenant_id='10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.tenant),1::bigint,'Suspended tenant remains readable');
select is((select tenant_subscription_status::text from public.tenant),'suspended','Members see subscription status for banner');
select throws_ok($$update public.person set person_first_name='Blocked' where person_id='30000000-0000-0000-0000-000000000003'$$,'42501',null,'Suspended person write rejected');
select throws_ok($$update public.tenant set tenant_name='Blocked'$$,'42501',null,'Suspended settings write rejected');
select throws_ok($$select public.revoke_membership('40000000-0000-0000-0000-000000000003')$$,'42501','Membership management denied','Suspended management RPC rejected before lock');
select throws_ok($$select public.grant_admin_permission('40000000-0000-0000-0000-000000000012','finance')$$,'42501','Membership management denied','Suspended permission RPC rejected');
reset role;
update public.tenant set tenant_subscription_status='cancelled' where tenant_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*) from public.tenant),0::bigint,'Cancelled tenant is inaccessible');
select is((select count(*) from public.person),0::bigint,'Cancelled person data inaccessible');
select is((select count(*) from public.invitation),0::bigint,'Cancelled invitations inaccessible');
select is((select count(*) from public.support_session),0::bigint,'Cancelled support sessions inaccessible');
select is((select count(*) from storage.objects where bucket_id='tenant-logo'),0::bigint,'Cancelled logos inaccessible');
reset role;
update public.tenant set tenant_subscription_status='active' where tenant_id='10000000-0000-0000-0000-000000000001';

-- Wrong verified email, expiry, replay and missing secrets have a uniform error.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000009","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.accept_invitation(repeat('c',64))$$,'42501','Invitation unavailable','Wrong verified email rejected uniformly');
select throws_ok($$select public.accept_invitation(repeat('z',64))$$,'42501','Invitation unavailable','Unknown token rejected uniformly');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000008","role":"authenticated","aal":"aal1"}',true);
reset role;
update public.invitation set invitation_expires_at=now()-interval '1 minute' where client_event_id='80000000-0000-0000-0000-000000000003';
set local role authenticated;
select throws_ok($$select public.accept_invitation(repeat('c',64))$$,'42501','Invitation unavailable','Expired token rejected uniformly');
reset role;
update public.invitation set invitation_expires_at=now()+interval '1 day' where client_event_id='80000000-0000-0000-0000-000000000003';
set local role authenticated;
reset role;
update auth.users set email_confirmed_at=null where id='20000000-0000-0000-0000-000000000008';
set local role authenticated;
select throws_ok($$select public.accept_invitation(repeat('c',64))$$,'42501','Invitation unavailable','Unverified email cannot accept');
reset role;
update auth.users set email_confirmed_at=now() where id='20000000-0000-0000-0000-000000000008';
update public.membership set membership_status='revoked' where membership_id='40000000-0000-0000-0000-000000000002';
set local role authenticated;
select throws_ok($$select public.accept_invitation(repeat('c',64))$$,'42501','Invitation unavailable','Revoked grantor cannot retain pending invitation authority');
reset role;
update public.membership set membership_status='active' where membership_id='40000000-0000-0000-0000-000000000002';
update public.invitation set invitation_status='revoked' where client_event_id='80000000-0000-0000-0000-000000000003';
set local role authenticated;
select throws_ok($$select public.accept_invitation(repeat('c',64))$$,'42501','Invitation unavailable','Revoked invitation rejected uniformly');
reset role;
update public.invitation set invitation_status='pending' where client_event_id='80000000-0000-0000-0000-000000000003';
set local role authenticated;
select lives_ok($$select public.accept_invitation(repeat('c',64))$$,'Matching verified email accepts invitation');
select is((select count(*) from public.membership where tenant_id='10000000-0000-0000-0000-000000000001'),1::bigint,'Acceptance creates own membership');
select throws_ok($$select public.accept_invitation(repeat('c',64))$$,'42501','Invitation unavailable','Token is single use');
reset role;
select is((select invitation_status::text from public.invitation where client_event_id='80000000-0000-0000-0000-000000000003'),'accepted','Acceptance is durable and atomic');
select ok((select bool_and(audit_event_diff->'invitation_token_hash'='{"changed":true}'::jsonb) from public.audit_event
  where audit_event_table_name='invitation' and audit_event_diff?'invitation_token_hash'),'Invitation secrets are redacted from audit');

-- First administrator acceptance includes all ten permission grants.
insert into public.person(person_id,tenant_id,person_first_name,person_last_name)
values('30000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000001','Existing','Admin');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select lives_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','member.tipas@domus.local','tenant_admin',
  encode(extensions.digest(repeat('d',64),'sha256'),'hex'),now()+interval '1 day','80000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000013',null,null,enum_range(null::public.admin_permission))$$,'Platform creates first admin invitation with all permissions');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000009","role":"authenticated","aal":"aal1"}',true);
select lives_ok($$select public.accept_invitation(repeat('d',64))$$,'First administrator accepts full permission grant');
select is((select count(*) from public.membership_permission mp join public.membership m using(tenant_id,membership_id) join public.person p using(tenant_id,person_id) where mp.tenant_id='10000000-0000-0000-0000-000000000001' and p.user_id='20000000-0000-0000-0000-000000000009'),10::bigint,'Acceptance grants all ten permissions atomically');
reset role;

-- Target admin identity sees exactly tenant A; all writes record actual actor.
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated','aal','aal1',
  'impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
  'support_session_id',(select support_session_id from support_fixture),'session_id',(select support_session_id from support_fixture),
  'support_tenant_id','10000000-0000-0000-0000-000000000001','exp',extract(epoch from now()+interval '20 minutes'))::text,true);
set local role authenticated;
select is(public.current_user_is_platform_admin(),false,'Impersonation cannot expose platform identity');
select is((select count(*) from public.tenant),1::bigint,'Support token is bound to tenant A');
select is((select count(*) from public.person where tenant_id='10000000-0000-0000-0000-000000000002'),0::bigint,'Support token cannot read B');
select is((select count(*) from public.support_session),0::bigint,'Support identity cannot read support sessions');
select is((select count(*) from storage.objects where bucket_id='tenant-logo'),1::bigint,'Support identity reads target logo');
select lives_ok($$update public.person set person_first_name='Supported' where person_id='30000000-0000-0000-0000-000000000003'$$,'Support identity can write as target registry admin');
select throws_ok($$select public.accept_invitation(repeat('a',64))$$,'42501','Invitation unavailable','Support cannot accept invitations');
select throws_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','someone@example.com','guard',repeat('d',64),now()+interval '1 day',gen_random_uuid(),null,'Test','Invite')$$,
  '42501','Invitation management denied','Support cannot send invitations');
select throws_ok($$select public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Nested',gen_random_uuid())$$,
  '42501','MFA platform administrator required','Support cannot nest sessions');
select throws_ok($$select public.update_tenant_platform_settings('10000000-0000-0000-0000-000000000001','forged','active')$$,
  '42501','MFA platform administrator required','Support cannot execute platform RPCs');
reset role;
select is((select audit_event_actor_user_id from public.audit_event where audit_event_table_name='person'
  and audit_event_diff->'person_first_name'->>'new'='Supported'),'20000000-0000-0000-0000-000000000001'::uuid,'Audit actor is impersonator');
select is((select audit_event_on_behalf_of_user_id from public.audit_event where audit_event_table_name='person'
  and audit_event_diff->'person_first_name'->>'new'='Supported'),'20000000-0000-0000-0000-000000000002'::uuid,'Audit records target on behalf of');
select is((select support_session_id from public.audit_event where audit_event_table_name='person'
  and audit_event_diff->'person_first_name'->>'new'='Supported'),(select support_session_id from support_fixture),'Audit links support session');
set local role authenticated;
insert into support_claims values(current_setting('request.jwt.claims')::jsonb);
select set_config('request.jwt.claims',((select claims from support_claims)||jsonb_build_object('support_tenant_id','10000000-0000-0000-0000-000000000002'))::text,true);
select is((select count(*) from public.tenant),0::bigint,'Forged tenant claim denies identity');
select set_config('request.jwt.claims',((select claims from support_claims)||jsonb_build_object('session_id','00000000-0000-0000-0000-000000000000'))::text,true);
select is((select count(*) from public.tenant),0::bigint,'Mismatched Auth session claim denies identity');
select set_config('request.jwt.claims',((select claims from support_claims)||jsonb_build_object('impersonator_user_id','20000000-0000-0000-0000-000000000006'))::text,true);
select is((select count(*) from public.tenant),0::bigint,'Mismatched actor claim denies identity');
select set_config('request.jwt.claims',((select claims from support_claims)||jsonb_build_object('sub','20000000-0000-0000-0000-000000000003'))::text,true);
select is((select count(*) from public.tenant),0::bigint,'Mismatched target claim denies identity');
select set_config('request.jwt.claims',((select claims from support_claims)||jsonb_build_object('impersonator_aal','aal1'))::text,true);
select is((select count(*) from public.tenant),0::bigint,'Non-MFA actor claim denies identity');
select set_config('request.jwt.claims',((select claims from support_claims)||jsonb_build_object('support_session_id','invalid'))::text,true);
select is((select count(*) from public.tenant),0::bigint,'Malformed session claim denies identity');
select set_config('request.jwt.claims',((select claims from support_claims)||jsonb_build_object('aal','aal2'))::text,true);
select is((select count(*) from public.tenant),0::bigint,'Elevated target AAL claim denies identity');
select set_config('request.jwt.claims',(select claims::text from support_claims),true);
reset role;
update public.platform_admin set platform_admin_is_active=false where user_id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select count(*) from public.tenant),0::bigint,'Deactivated actor invalidates support token');
reset role;
update public.platform_admin set platform_admin_is_active=true where user_id='20000000-0000-0000-0000-000000000001';
insert into public.platform_admin(user_id) values('20000000-0000-0000-0000-000000000002');
set local role authenticated;
select is((select count(*) from public.tenant),0::bigint,'Promoted platform target invalidates support token');
reset role;
delete from public.platform_admin where user_id='20000000-0000-0000-0000-000000000002';
set local role authenticated;
select throws_ok($$insert into storage.objects(bucket_id,name) values('tenant-logo','10000000-0000-0000-0000-000000000001/support.png')$$,'42501',null,'Support token cannot upload logo');
select lives_ok($$select public.end_support_session((select support_session_id from support_fixture))$$,'Support target can end own session');
select is((select count(*) from public.tenant),0::bigint,'Ended support token loses reads immediately');
select is((select count(*) from storage.objects where bucket_id='tenant-logo'),0::bigint,'Ended support token loses Storage reads');
select throws_ok($$select public.revoke_membership('40000000-0000-0000-0000-000000000003')$$,'42501','Membership management denied','Ended token cannot use management RPCs');
reset role;
select is((select count(*) from public.audit_event where audit_event_table_name='support_session'
  and support_session_id=(select support_session_id from support_fixture)),2::bigint,'Start and end lifecycle events link support session');
select ok((select bool_and(audit_event_actor_user_id='20000000-0000-0000-0000-000000000001'::uuid
  and audit_event_on_behalf_of_user_id='20000000-0000-0000-0000-000000000002'::uuid)
  from public.audit_event where audit_event_table_name='support_session'
  and support_session_id=(select support_session_id from support_fixture)),'Lifecycle events retain real actor and target');
update public.support_session set support_session_status='active',support_session_ended_at=null,
  support_session_started_at=now()-interval '2 hours',support_session_expires_at=now()-interval '90 minutes'
  where support_session_id=(select support_session_id from support_fixture);
set local role authenticated;
select is((select count(*) from public.tenant),0::bigint,'Expired session rejects still-signed token');
reset role;
update public.support_session set support_session_status='revoked',support_session_ended_at=now()
  where support_session_id=(select support_session_id from support_fixture);
set local role authenticated;
select is((select count(*) from public.tenant),0::bigint,'Revoked session rejects token');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
delete from support_fixture;
insert into support_fixture select (public.start_support_session('10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000010','Maximum support duration',gen_random_uuid(),60)).support_session_id;
select is((select extract(epoch from support_session_expires_at-support_session_started_at)::integer from public.support_session
  where support_session_id=(select support_session_id from support_fixture)),3600,'60-minute session is exactly bounded');
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000010','role','authenticated','aal','aal1',
  'impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
  'support_session_id',(select support_session_id from support_fixture),'session_id',(select support_session_id from support_fixture),
  'support_tenant_id','10000000-0000-0000-0000-000000000001','exp',extract(epoch from now()+interval '20 minutes'))::text,true);
select is((select count(*) from public.tenant),1::bigint,'Shared-user support stays in selected tenant');
select is((select count(*) from public.person),1::bigint,'Support holder sees only own target profile');
with changed as (update public.person set person_first_name='Blocked' where tenant_id='10000000-0000-0000-0000-000000000001' returning 1)
select is((select count(*) from changed),0::bigint,'Support holder cannot borrow actor registry privileges');
reset role;
set local role anon;
select throws_ok('select public.current_user_is_platform_admin()','42501',null,'Anonymous cannot inspect platform status');
select throws_ok($$select public.accept_invitation(repeat('a',64))$$,'42501',null,'Anonymous cannot accept invitation');
reset role;
select * from finish();
rollback;
