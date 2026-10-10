-- T12: invitation and support-session fixes for the T10 review findings H1 (creation side), L2, L3, L4, L5 and M2.
begin;
select no_plan();
create temp table issued(label text primary key, token text, invitation_id uuid);
grant select,insert,update on issued to authenticated;
create temp table support_fixture(support_session_id uuid);
grant select,insert on support_fixture to authenticated;
-- A session whose amr proves an email link/code (Auth records method 'otp') issued `age` before now.
create function pg_temp.session(sub text, amr jsonb default null, aal text default 'aal1') returns text language sql stable as $$
  select (jsonb_build_object('sub',sub,'role','authenticated','aal',aal)
    || case when amr is null then '{}'::jsonb else jsonb_build_object('amr',amr) end)::text $$;
create function pg_temp.email_session(sub text) returns text language sql stable as $$
  select pg_temp.session(sub,jsonb_build_array(jsonb_build_object('method','otp','timestamp',floor(extract(epoch from now()))))) $$;
grant execute on function pg_temp.session(text,jsonb,text),pg_temp.email_session(text) to authenticated;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
  raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
select '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),
  '{"provider":"email","providers":["email"]}','{}',now(),now(),'','','',''
from (values ('20000000-0000-0000-0000-000000000013'::uuid,'invitee.one@example.test'),
  ('20000000-0000-0000-0000-000000000014'::uuid,'second.platform@example.test')) accounts(id,email);
insert into public.platform_admin(user_id) values('20000000-0000-0000-0000-000000000014');
insert into public.person(person_id,tenant_id,person_first_name,person_last_name) values
  ('30000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','Sara','Padron');

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges and contract shape.
-- ---------------------------------------------------------------------------------------------------------------
select is(to_regprocedure('public.create_invitation(uuid,text,public.membership_role,text,timestamptz,uuid,uuid,text,text,public.admin_permission[])'),
  null::regprocedure,'The client-chosen token hash and expiry signature no longer exists');
select is((select proargnames from pg_proc where oid='public.create_invitation(uuid,text,public.membership_role,uuid,uuid,text,text,public.admin_permission[])'::regprocedure),
  array['target_tenant_id','invited_email','target_role','client_event_id','target_person_id','first_name','last_name',
    'admin_permissions','invitation_id','invitation_token'],'create_invitation takes no secret or expiry and returns the secret once');
select ok(not has_function_privilege('anon','public.create_invitation(uuid,text,public.membership_role,uuid,uuid,text,text,public.admin_permission[])','EXECUTE'),'Anonymous cannot create invitations');
select ok(not has_function_privilege('service_role','public.create_invitation(uuid,text,public.membership_role,uuid,uuid,text,text,public.admin_permission[])','EXECUTE'),'Service role cannot create invitations');
select ok(not has_function_privilege('anon','public.mark_invitation_delivered(uuid)','EXECUTE'),'Anonymous cannot mark deliveries');
select ok(not has_function_privilege('service_role','public.mark_invitation_delivered(uuid)','EXECUTE'),'Service role cannot mark deliveries');
select ok(not has_function_privilege('anon','public.revoke_support_session(uuid,text)','EXECUTE'),'Anonymous cannot revoke support sessions');
select ok(not has_function_privilege('service_role','public.revoke_support_session(uuid,text)','EXECUTE'),'Service role cannot revoke support sessions');
select ok(not has_function_privilege('authenticated','app_private.session_proves_email_since(timestamptz)','EXECUTE'),'Clients cannot call the email-proof helper');
select ok(not has_column_privilege('authenticated','public.invitation','invitation_token_hash','INSERT'),'Clients cannot write token hashes directly');
select ok(not has_column_privilege('authenticated','public.invitation','invitation_expires_at','UPDATE'),'Clients cannot write invitation expiry directly');

-- ---------------------------------------------------------------------------------------------------------------
-- L2: server-generated secret and expiry.
-- ---------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000002'),true);
set local role authenticated;
select lives_ok($$insert into issued select 'g',invitation_token,invitation_id from public.create_invitation('10000000-0000-0000-0000-000000000001',
  'Invitee.One@Example.test ','guard','80000000-0000-0000-0000-0000000000c1',null,'Nueva','Guardia')$$,'Tenant admin creates an invitation');
select lives_ok($$insert into issued select 'h',invitation_token,invitation_id from public.create_invitation('10000000-0000-0000-0000-000000000001',
  'someone.else@example.test','guard','80000000-0000-0000-0000-0000000000c2',null,'Otra','Guardia')$$,'A second invitation is created');
reset role;
select ok((select token ~ '^[a-f0-9]{64}$' from issued where label='g'),'The secret is 256 bits of hex');
select isnt((select token from issued where label='g'),(select token from issued where label='h'),'Every invitation gets its own secret');
select is((select invitation_token_hash from public.invitation where client_event_id='80000000-0000-0000-0000-0000000000c1'),
  (select encode(extensions.digest(token,'sha256'),'hex') from issued where label='g'),'Only the SHA256 digest of the secret is stored');
select ok((select invitation_expires_at - invitation_created_at between interval '7 days' and interval '7 days 1 minute'
  from public.invitation where client_event_id='80000000-0000-0000-0000-0000000000c1'),'Expiry is fixed by the server at seven days');
select is((select invitation_email from public.invitation where client_event_id='80000000-0000-0000-0000-0000000000c1'),
  'invitee.one@example.test','Recipient email is normalized');

-- ---------------------------------------------------------------------------------------------------------------
-- L5: retries are idempotent per client_event_id; a delivered invitation is never re-issued or re-mailed.
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select lives_ok($$insert into issued select 'g2',invitation_token,invitation_id from public.create_invitation('10000000-0000-0000-0000-000000000001',
  'invitee.one@example.test','guard','80000000-0000-0000-0000-0000000000c1',null,'Nueva','Guardia')$$,'Undelivered retry succeeds');
reset role;
select is((select invitation_id from issued where label='g2'),(select invitation_id from issued where label='g'),'Retry returns the same invitation');
select isnt((select token from issued where label='g2'),(select token from issued where label='g'),'Undelivered retry issues a fresh secret');
select is((select invitation_token_hash from public.invitation where client_event_id='80000000-0000-0000-0000-0000000000c1'),
  (select encode(extensions.digest(token,'sha256'),'hex') from issued where label='g2'),'The previous undelivered secret is dead');
select is((select count(*) from public.invitation where client_event_id='80000000-0000-0000-0000-0000000000c1'),1::bigint,'Retry creates no second row');
set local role authenticated;
select throws_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','invitee.one@example.test','household_member',
  '80000000-0000-0000-0000-0000000000c1',null,'Nueva','Guardia')$$,'42501','Invitation management denied','A retry key cannot change the role');
select throws_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','other@example.test','guard',
  '80000000-0000-0000-0000-0000000000c1',null,'Nueva','Guardia')$$,'42501','Invitation management denied','A retry key cannot change the recipient');
select lives_ok($$select public.mark_invitation_delivered((select invitation_id from issued where label='g'))$$,'Creator records the delivery');
select lives_ok($$select public.mark_invitation_delivered((select invitation_id from issued where label='g'))$$,'Recording a delivery is idempotent');
select is((select invitation_token from public.create_invitation('10000000-0000-0000-0000-000000000001','invitee.one@example.test','guard',
  '80000000-0000-0000-0000-0000000000c1',null,'Nueva','Guardia')),null,'A delivered invitation returns no secret, so nothing is mailed again');
reset role;
select is((select invitation_token_hash from public.invitation where client_event_id='80000000-0000-0000-0000-0000000000c1'),
  (select encode(extensions.digest(token,'sha256'),'hex') from issued where label='g2'),'A delivered secret is never rotated');
select ok((select invitation_delivered_at is not null from public.invitation where client_event_id='80000000-0000-0000-0000-0000000000c1'),'Delivery time is recorded');
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000012'),true);
set local role authenticated;
select throws_ok($$select public.mark_invitation_delivered((select invitation_id from issued where label='h'))$$,'42501','Invitation management denied','Only the creator records a delivery');
select throws_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','invitee.one@example.test','guard',
  '80000000-0000-0000-0000-0000000000c1',null,'Nueva','Guardia')$$,'42501','Invitation management denied','Another grantor cannot reuse a retry key');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- H1 at creation: at most one live invitation per person.
-- ---------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000002'),true);
set local role authenticated;
select lives_ok($$insert into issued select 'p1',invitation_token,invitation_id from public.create_invitation('10000000-0000-0000-0000-000000000001',
  'invitee.one@example.test','tenant_admin','80000000-0000-0000-0000-0000000000d1','30000000-0000-0000-0000-0000000000b1',null,null,'{access_audit,finance}')$$,
  'Admin invites an unbound person');
reset role;
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000012'),true);
set local role authenticated;
select throws_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','attacker.alt@example.test','household_member',
  '80000000-0000-0000-0000-0000000000d2','30000000-0000-0000-0000-0000000000b1')$$,'42501','Invitation management denied',
  'A competing invitation for a person with a live invitation is rejected');
select throws_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','registry.ceibos@domus.local','household_member',
  '80000000-0000-0000-0000-0000000000d3',null,'Self','Invite')$$,'42501','Invitation management denied','Grantors cannot invite themselves');
reset role;
update public.invitation set invitation_expires_at=now()-interval '1 minute' where client_event_id='80000000-0000-0000-0000-0000000000d1';
set local role authenticated;
select lives_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','new.owner@example.test','household_member',
  '80000000-0000-0000-0000-0000000000d4','30000000-0000-0000-0000-0000000000b1')$$,'An expired invitation no longer blocks the person');
reset role;
update public.invitation set invitation_status='revoked' where client_event_id='80000000-0000-0000-0000-0000000000d4';
update public.invitation set invitation_expires_at=now()+interval '1 day' where client_event_id='80000000-0000-0000-0000-0000000000d1';

-- ---------------------------------------------------------------------------------------------------------------
-- M2: acceptance requires a session proven by an email link or code issued after the invitation existed.
-- ---------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000013'),true);
set local role authenticated;
select throws_ok($$select public.accept_invitation((select token from issued where label='p1'))$$,'42501','Invitation unavailable','A session without amr cannot accept');
select throws_ok($$select * from public.preview_invitation((select token from issued where label='p1'))$$,'42501','Invitation unavailable','A session without amr cannot preview');
reset role;
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000013',
  jsonb_build_array(jsonb_build_object('method','password','timestamp',floor(extract(epoch from now()))))),true);
set local role authenticated;
select throws_ok($$select public.accept_invitation((select token from issued where label='p1'))$$,'42501','Invitation unavailable','A password session cannot accept (autoconfirm or pre-registration)');
reset role;
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000013',
  jsonb_build_array(jsonb_build_object('method','oauth','timestamp',floor(extract(epoch from now()))),
    jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now()))))),true);
set local role authenticated;
select throws_ok($$select public.accept_invitation((select token from issued where label='p1'))$$,'42501','Invitation unavailable','OAuth and TOTP never prove the mailbox');
reset role;
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000013',
  jsonb_build_array(jsonb_build_object('method','otp','timestamp',floor(extract(epoch from now()-interval '1 hour'))))),true);
set local role authenticated;
select throws_ok($$select public.accept_invitation((select token from issued where label='p1'))$$,'42501','Invitation unavailable','An email proof older than the invitation does not count');
reset role;
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000013','"otp"'::jsonb),true);
set local role authenticated;
select throws_ok($$select public.accept_invitation((select token from issued where label='p1'))$$,'42501','Invitation unavailable','A malformed amr claim fails closed');
reset role;
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000013',
  jsonb_build_array(jsonb_build_object('method','otp','timestamp','soon'))),true);
set local role authenticated;
select throws_ok($$select public.accept_invitation((select token from issued where label='p1'))$$,'42501','Invitation unavailable','A non-numeric amr timestamp fails closed');
reset role;
update auth.users set email_confirmed_at=null where id='20000000-0000-0000-0000-000000000013';
select set_config('request.jwt.claims',pg_temp.email_session('20000000-0000-0000-0000-000000000013'),true);
set local role authenticated;
select throws_ok($$select public.accept_invitation((select token from issued where label='p1'))$$,'42501','Invitation unavailable','An unconfirmed account cannot accept even with an email session');
reset role;
update auth.users set email_confirmed_at=now() where id='20000000-0000-0000-0000-000000000013';
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000013',
  jsonb_build_array(jsonb_build_object('method','password','timestamp',floor(extract(epoch from now()-interval '2 hours'))),
    jsonb_build_object('method','otp','timestamp',floor(extract(epoch from now()))))),true);
set local role authenticated;
select lives_ok($$select public.accept_invitation((select token from issued where label='p1'))$$,'A fresh email-link session accepts');
reset role;
select is((select user_id from public.person where person_id='30000000-0000-0000-0000-0000000000b1'),
  '20000000-0000-0000-0000-000000000013'::uuid,'The invited person is bound to the accepting account');
select is((select count(*) from public.membership_permission mp join public.membership m using(tenant_id,membership_id)
  where m.person_id='30000000-0000-0000-0000-0000000000b1'),2::bigint,'Exactly the granted permissions land on the acceptor');

-- ---------------------------------------------------------------------------------------------------------------
-- L5: an existing member of the tenant can accept a person-less invitation on their own person.
-- ---------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000002'),true);
set local role authenticated;
select lives_ok($$insert into issued select 'm1',invitation_token,invitation_id from public.create_invitation('10000000-0000-0000-0000-000000000001',
  'holder.ceibos@domus.local','tenant_admin','80000000-0000-0000-0000-0000000000e1',null,'Carla','Ceibos','{registry}')$$,
  'Admin invites an existing resident to become an administrator');
select lives_ok($$insert into issued select 'm2',invitation_token,invitation_id from public.create_invitation('10000000-0000-0000-0000-000000000001',
  'holder.ceibos@domus.local','unit_holder','80000000-0000-0000-0000-0000000000e2',null,'Carla','Ceibos')$$,
  'A duplicate role invitation can be created');
reset role;
select set_config('request.jwt.claims',pg_temp.email_session('20000000-0000-0000-0000-000000000004'),true);
set local role authenticated;
select lives_ok($$select public.accept_invitation((select token from issued where label='m1'))$$,'An existing member accepts a person-less invitation');
select throws_ok($$select public.accept_invitation((select token from issued where label='m2'))$$,'42501','Invitation unavailable','A role the member already holds is not duplicated');
reset role;
select is((select count(*) from public.person where tenant_id='10000000-0000-0000-0000-000000000001'
  and user_id='20000000-0000-0000-0000-000000000004'),1::bigint,'No second person is created for the member');
select is((select array_agg(membership_role::text order by membership_role) from public.membership where person_id='30000000-0000-0000-0000-000000000004'),
  array['tenant_admin','unit_holder'],'The new role is added to the existing person');
select is((select person_id from public.invitation where client_event_id='80000000-0000-0000-0000-0000000000e1'),
  '30000000-0000-0000-0000-000000000004'::uuid,'The invitation records the existing person');

-- ---------------------------------------------------------------------------------------------------------------
-- Suspended tenants: tenant admins can neither create nor revoke invitations.
-- ---------------------------------------------------------------------------------------------------------------
update public.tenant set tenant_subscription_status='suspended' where tenant_id='10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000002'),true);
set local role authenticated;
select throws_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','late@example.test','guard',gen_random_uuid(),null,'Late','Guard')$$,
  '42501','Invitation management denied','Suspended tenant admin cannot create invitations');
select throws_ok($$select public.revoke_invitation((select invitation_id from issued where label='h'))$$,
  '42501','Invitation management denied','Suspended tenant admin cannot revoke invitations');
select throws_ok($$select public.mark_invitation_delivered((select invitation_id from issued where label='h'))$$,
  '42501','Invitation management denied','Suspended tenant admin cannot record deliveries');
reset role;
update public.tenant set tenant_subscription_status='active' where tenant_id='10000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------------------------------------------
-- L3: an MFA platform administrator revokes another administrator's live support session.
-- ---------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000001',null,'aal2'),true);
set local role authenticated;
insert into support_fixture select (public.start_support_session('10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002','Investigate invitation report','80000000-0000-0000-0000-0000000000f1')).support_session_id;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated','aal','aal1',
  'impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
  'support_session_id',(select support_session_id from support_fixture),'session_id',(select support_session_id from support_fixture),
  'support_tenant_id','10000000-0000-0000-0000-000000000001','exp',extract(epoch from now()+interval '20 minutes'))::text,true);
set local role authenticated;
select is((select count(*) from public.tenant),1::bigint,'Live support token reads the target tenant');
select is((select count(*) from public.invitation),0::bigint,'L4: support acting as an admin_management admin reads no invitations');
select throws_ok($$select public.revoke_support_session((select support_session_id from support_fixture),'Self revoke')$$,
  '42501','MFA platform administrator required','Support identity cannot revoke sessions');
select throws_ok($$select public.mark_invitation_delivered((select invitation_id from issued where label='h'))$$,
  '42501','Invitation management denied','Support identity cannot record deliveries');
reset role;
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000002'),true);
set local role authenticated;
select is((select count(*) from public.invitation where tenant_id='10000000-0000-0000-0000-000000000001')>0,true,'The same admin reads invitations without impersonation');
select throws_ok($$select public.revoke_support_session((select support_session_id from support_fixture),'Tenant revoke')$$,
  '42501','MFA platform administrator required','Tenant administrators cannot revoke support sessions');
reset role;
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000014'),true);
set local role authenticated;
select throws_ok($$select public.revoke_support_session((select support_session_id from support_fixture),'No MFA')$$,
  '42501','MFA platform administrator required','Platform administrators need MFA to revoke');
reset role;
select set_config('request.jwt.claims',pg_temp.session('20000000-0000-0000-0000-000000000014',null,'aal2'),true);
set local role authenticated;
select throws_ok($$select public.revoke_support_session((select support_session_id from support_fixture),' ')$$,
  '22023','Invalid support session input','A revocation reason is required');
select lives_ok($$select public.revoke_support_session((select support_session_id from support_fixture),'Credential exposure suspected')$$,
  'A second MFA platform administrator revokes the live session');
select throws_ok($$select public.revoke_support_session((select support_session_id from support_fixture),'Again')$$,
  '42501','Support session denied','A finished session cannot be revoked again');
reset role;
select is((select support_session_status::text||'|'||support_session_ended_by_user_id::text||'|'||support_session_revocation_reason
  from public.support_session where support_session_id=(select support_session_id from support_fixture)),
  'revoked|20000000-0000-0000-0000-000000000014|Credential exposure suspected','Revocation records status, revoker and reason');
select ok((select audit_event_actor_user_id='20000000-0000-0000-0000-000000000014'::uuid
    and audit_event_on_behalf_of_user_id='20000000-0000-0000-0000-000000000002'::uuid
    and audit_event_diff->'support_session_revocation_reason'='{"changed":true}'::jsonb
    and audit_event_diff->'support_session_status'->>'new'='revoked'
  from public.audit_event where audit_event_table_name='support_session' and support_session_id=(select support_session_id from support_fixture)
    and audit_event_action='update'),'Revocation is audited with revoker, target, session and a redacted reason');
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated','aal','aal1',
  'impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
  'support_session_id',(select support_session_id from support_fixture),'session_id',(select support_session_id from support_fixture),
  'support_tenant_id','10000000-0000-0000-0000-000000000001','exp',extract(epoch from now()+interval '20 minutes'))::text,true);
set local role authenticated;
select is((select count(*) from public.tenant),0::bigint,'The revoked token loses reads on its next request');
reset role;
select throws_ok($$update public.support_session set support_session_status='revoked'
  where client_event_id='70000000-0000-0000-0000-000000000001'$$,'23514',null,'Database requires a reason for revoked sessions');

select * from finish();
rollback;
