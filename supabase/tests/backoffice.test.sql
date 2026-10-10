begin;
select no_plan();
create temp table support_fixture(support_session_id uuid);
grant select,insert,delete on support_fixture to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- current_user_cancelled_tenants(): the caller's OWN active memberships in cancelled tenants, nothing else.
-- ---------------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon','public.current_user_cancelled_tenants()','EXECUTE'),'Anonymous cannot list cancelled tenants');
select ok(not has_function_privilege('service_role','public.current_user_cancelled_tenants()','EXECUTE'),'Service role cannot list cancelled tenants');
select ok(has_function_privilege('authenticated','public.current_user_cancelled_tenants()','EXECUTE'),'Signed-in users can ask for their cancelled tenants');
select is((select prosecdef from pg_proc where oid='public.current_user_cancelled_tenants()'::regprocedure),true,'Cancelled tenants function is SECURITY DEFINER');
select is((select proconfig from pg_proc where oid='public.current_user_cancelled_tenants()'::regprocedure),array['search_path=""'],'Cancelled tenants function pins an empty search_path');

-- A support session must exist before any tenant is cancelled (starting one is a platform action).
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
insert into support_fixture select (public.start_support_session('10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002','Backoffice test','80000000-0000-0000-0000-0000000000a1')).support_session_id;
reset role;

update public.tenant set tenant_subscription_status='cancelled' where tenant_id='10000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.tenant),0::bigint,'Cancelled tenant stays invisible to its member');
select results_eq($$select tenant_id, tenant_name from public.current_user_cancelled_tenants()$$,
  $$values ('10000000-0000-0000-0000-000000000001'::uuid,'Barrio Los Ceibos'::text)$$,'Member sees only id and name of the cancelled tenant');
reset role;

-- Multi-tenant user: only the cancelled one is disclosed, never the healthy one.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select results_eq($$select tenant_id from public.current_user_cancelled_tenants()$$,
  $$values ('10000000-0000-0000-0000-000000000001'::uuid)$$,'Shared user sees only the cancelled tenant');
reset role;

-- Another tenant's users learn nothing.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.current_user_cancelled_tenants()),0::bigint,'Tenant B admin does not see tenant A cancellation');
reset role;

-- A platform administrator with no membership has nothing to disclose.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*) from public.current_user_cancelled_tenants()),0::bigint,'Platform admin without memberships gets nothing');
reset role;

-- Unknown identity, anonymous role.
select set_config('request.jwt.claims','{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.current_user_cancelled_tenants()),0::bigint,'Identity without memberships gets nothing');
reset role;
select set_config('request.jwt.claims','',true);
set local role anon;
select throws_ok($$select * from public.current_user_cancelled_tenants()$$,'42501',null,'Anonymous callers are denied');
reset role;

-- Support token (target is a member of the cancelled tenant): empty result.
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated','aal','aal1',
  'impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
  'support_session_id',(select support_session_id from support_fixture),'session_id',(select support_session_id from support_fixture),
  'support_tenant_id','10000000-0000-0000-0000-000000000001','exp',extract(epoch from now()+interval '20 minutes'))::text,true);
set local role authenticated;
select is((select count(*) from public.current_user_cancelled_tenants()),0::bigint,'Support token never learns about cancelled memberships');
reset role;

-- A revoked membership is not disclosed; neither is a suspended tenant.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.current_user_cancelled_tenants()),1::bigint,'Active guard of the cancelled tenant is disclosed');
reset role;
update public.membership set membership_status='revoked' where tenant_id='10000000-0000-0000-0000-000000000001'
  and person_id in (select person_id from public.person where user_id='20000000-0000-0000-0000-000000000003');
set local role authenticated;
select is((select count(*) from public.current_user_cancelled_tenants()),0::bigint,'Revoked membership is not disclosed');
reset role;
update public.membership set membership_status='active' where tenant_id='10000000-0000-0000-0000-000000000001'
  and person_id in (select person_id from public.person where user_id='20000000-0000-0000-0000-000000000003');
update public.tenant set tenant_subscription_status='suspended' where tenant_id='10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.current_user_cancelled_tenants()),0::bigint,'Suspended tenants are not reported as cancelled');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- list_support_targets(): authorization, minimization, search, cap and audit.
-- ---------------------------------------------------------------------------------------------------------------
update public.tenant set tenant_subscription_status='active' where tenant_id='10000000-0000-0000-0000-000000000001';
select ok(not has_function_privilege('anon','public.list_support_targets(uuid,text)','EXECUTE'),'Anonymous cannot look up support targets');
select ok(not has_function_privilege('service_role','public.list_support_targets(uuid,text)','EXECUTE'),'Service role cannot look up support targets');
select ok(not has_function_privilege('authenticated','app_private.record_support_target_lookup(uuid,uuid,integer,integer)','EXECUTE'),'Clients cannot call the audit entry point');
select is((select proconfig from pg_proc where oid='public.list_support_targets(uuid,text)'::regprocedure),array['search_path=""'],'Lookup pins an empty search_path');
select is((select proargnames from pg_proc where oid='public.list_support_targets(uuid,text)'::regprocedure),
  array['target_tenant_id','search','user_id','person_first_name','person_last_name','membership_role'],
  'Lookup returns only user id, names and role');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select * from public.list_support_targets('10000000-0000-0000-0000-000000000001')$$,'42501','MFA platform administrator required','AAL1 platform admin is denied');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select * from public.list_support_targets('10000000-0000-0000-0000-000000000001')$$,'42501','MFA platform administrator required','Tenant admin is denied');
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated','aal','aal1',
  'impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
  'support_session_id',(select support_session_id from support_fixture),'session_id',(select support_session_id from support_fixture),
  'support_tenant_id','10000000-0000-0000-0000-000000000001','exp',extract(epoch from now()+interval '20 minutes'))::text,true);
select throws_ok($$select * from public.list_support_targets('10000000-0000-0000-0000-000000000001')$$,'42501','MFA platform administrator required','Support token is denied');
reset role;
select is((select count(*) from public.audit_event where audit_event_table_name='support_target_lookup'),0::bigint,'Denied calls write no lookup audit');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select results_eq($$select user_id, person_first_name, person_last_name, membership_role::text from public.list_support_targets('10000000-0000-0000-0000-000000000001')$$,
  $$values
    ('20000000-0000-0000-0000-000000000002'::uuid,'Ana'::text,'Ceibos'::text,'tenant_admin'::text),
    ('20000000-0000-0000-0000-000000000003','Bruno','Ceibos','guard'),
    ('20000000-0000-0000-0000-000000000004','Carla','Ceibos','unit_holder'),
    ('20000000-0000-0000-0000-000000000005','Diego','Ceibos','household_member'),
    ('20000000-0000-0000-0000-000000000010','Ines','Compartida','unit_holder'),
    ('20000000-0000-0000-0000-000000000012','Julian','Registro','tenant_admin')$$,'Lookup lists active users of the tenant only');
select is((select count(*) from public.list_support_targets('10000000-0000-0000-0000-000000000002')),5::bigint,'Tenant B lookup lists tenant B users');
select is((select count(*) from public.list_support_targets('10000000-0000-0000-0000-000000000002') where user_id='20000000-0000-0000-0000-000000000002'),0::bigint,'Tenant A user is not listed for tenant B');
select is((select count(*) from public.list_support_targets('10000000-0000-0000-0000-000000000001','ceib')),4::bigint,'Search matches names case-insensitively');
select is((select count(*) from public.list_support_targets('10000000-0000-0000-0000-000000000001','ana ceibos')),1::bigint,'Search matches first and last name together');
select is((select count(*) from public.list_support_targets('10000000-0000-0000-0000-000000000001','   ')),6::bigint,'Blank search lists everybody');
select is((select count(*) from public.list_support_targets('10000000-0000-0000-0000-000000000001','%')),0::bigint,'LIKE wildcards are matched literally (percent)');
select is((select count(*) from public.list_support_targets('10000000-0000-0000-0000-000000000001','_')),0::bigint,'LIKE wildcards are matched literally (underscore)');
select throws_ok($$select * from public.list_support_targets('10000000-0000-0000-0000-000000000001',repeat('a',101))$$,'22023','Invalid support target search','Oversized search term is rejected');
select throws_ok($$select * from public.list_support_targets(gen_random_uuid())$$,'42501','Support target lookup denied','Unknown tenant is denied');
reset role;
update public.tenant set tenant_subscription_status='cancelled' where tenant_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select * from public.list_support_targets('10000000-0000-0000-0000-000000000001')$$,'42501','Support target lookup denied','Cancelled tenant is denied');
reset role;
update public.tenant set tenant_subscription_status='active' where tenant_id='10000000-0000-0000-0000-000000000001';

-- Exclusions: revoked memberships, unclaimed people and platform administrators.
update public.membership set membership_status='revoked' where tenant_id='10000000-0000-0000-0000-000000000001'
  and person_id in (select person_id from public.person where user_id='20000000-0000-0000-0000-000000000003');
insert into public.person(tenant_id,person_first_name,person_last_name) values('10000000-0000-0000-0000-000000000001','Sin','Usuario');
insert into public.platform_admin(user_id) values('20000000-0000-0000-0000-000000000004');
set local role authenticated;
select is((select count(*) from public.list_support_targets('10000000-0000-0000-0000-000000000001')),4::bigint,
  'Revoked members, unclaimed people and platform admins are excluded');
select is((select count(*) from public.list_support_targets('10000000-0000-0000-0000-000000000001')
  where user_id in ('20000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000004')),0::bigint,'Excluded users are not listed');
reset role;

-- Cap: never more than 50 rows.
insert into auth.users(instance_id,id,aud,role,email)
  select '00000000-0000-0000-0000-000000000000',('21000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','bulk'||n||'@domus.local'
  from generate_series(1,55) n;
insert into public.person(person_id,tenant_id,user_id,person_first_name,person_last_name)
  select ('31000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001',
    ('21000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'Masivo','Persona'||lpad(n::text,2,'0') from generate_series(1,55) n;
insert into public.membership(tenant_id,person_id,membership_role)
  select '10000000-0000-0000-0000-000000000001',('31000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'unit_holder' from generate_series(1,55) n;
set local role authenticated;
select is((select count(*) from public.list_support_targets('10000000-0000-0000-0000-000000000001')),50::bigint,'Result size is capped at 50');
select is((select count(*) from public.list_support_targets('10000000-0000-0000-0000-000000000001','masivo')),50::bigint,'Search results are capped too');
reset role;

-- Every successful call is audited with the actor, the tenant and the SIZE of the search term, never the term.
select is((select count(*) from public.audit_event where audit_event_table_name='support_target_lookup'),12::bigint,'Each successful lookup writes one audit event');
select is((select count(*) from public.audit_event where audit_event_table_name='support_target_lookup'
  and audit_event_actor_user_id='20000000-0000-0000-0000-000000000001'
  and tenant_id in ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')),12::bigint,'Lookup audit names the platform actor and the tenant');
select is((select audit_event_diff from public.audit_event where audit_event_table_name='support_target_lookup'
  and audit_event_diff->>'support_target_lookup_search_length'='4'),
  '{"support_target_lookup_search_length":4,"support_target_lookup_result_count":4}'::jsonb,'Lookup audit keeps only term length and result count');
select is((select count(*) from public.audit_event where audit_event_table_name='support_target_lookup'
  and (audit_event_diff::text ilike '%ceib%' or audit_event_diff::text ilike '%masivo%')),0::bigint,'Lookup audit never stores the search term');

-- Audit visibility stays tenant-scoped and clients still cannot forge events.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.audit_event where audit_event_table_name='support_target_lookup' and tenant_id='10000000-0000-0000-0000-000000000001'),0::bigint,'Tenant B audit admin cannot read tenant A lookups');
select throws_ok($$insert into public.audit_event(audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff) values('x','insert','support_target_lookup',gen_random_uuid(),'{}')$$,'42501',null,'Clients still cannot forge audit events');
reset role;


-- ---------------------------------------------------------------------------------------------------------------
-- preview_invitation(): same gate as accept_invitation, only tenant name and role come back.
-- ---------------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon','public.preview_invitation(text)','EXECUTE'),'Anonymous cannot preview invitations');
select ok(not has_function_privilege('service_role','public.preview_invitation(text)','EXECUTE'),'Service role cannot preview invitations');
select ok(not has_function_privilege('authenticated','app_private.pending_invitation_for_token(text,boolean)','EXECUTE'),'Clients cannot call the shared invitation gate');
select is((select proconfig from pg_proc where oid='public.preview_invitation(text)'::regprocedure),array['search_path=""'],'Preview pins an empty search_path');
select is((select proargnames from pg_proc where oid='public.preview_invitation(text)'::regprocedure),
  array['token','tenant_name','invitation_membership_role'],'Preview returns only tenant name and role');
select is((select proowner::regrole::text from pg_proc where oid='public.accept_invitation(text)'::regprocedure),'invitation_acceptor','Acceptance keeps the isolated consent owner');
select ok(not has_schema_privilege('invitation_acceptor','public','CREATE'),'Consent capability still cannot create RPCs');
select is((select prosrc ~ 'pending_invitation_for_token' from pg_proc where oid='public.accept_invitation(text)'::regprocedure),true,'Acceptance consumes the shared gate');
select is((select prosrc ~ 'pending_invitation_for_token' from pg_proc where oid='public.preview_invitation(text)'::regprocedure),true,'Preview consumes the shared gate');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select lives_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','holder.tipas@domus.local','guard',
  encode(extensions.digest(repeat('p',64),'sha256'),'hex'),now()+interval '1 day','80000000-0000-0000-0000-0000000000b1',null,'Nuevo','Guardia')$$,'Platform invites a guard');
select lives_ok($$select public.create_invitation('10000000-0000-0000-0000-000000000001','admin.ceibos@domus.local','household_member',
  encode(extensions.digest(repeat('q',64),'sha256'),'hex'),now()+interval '1 day','80000000-0000-0000-0000-0000000000b2',null,'Soporte','Probe')$$,'Platform invites the supported user');
reset role;

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000008","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select results_eq($$select tenant_name, invitation_membership_role::text from public.preview_invitation(repeat('p',64))$$,
  $$values ('Barrio Los Ceibos'::text,'guard'::text)$$,'Invitee sees tenant name and role');
select is((select count(*) from public.invitation where client_event_id='80000000-0000-0000-0000-0000000000b1'),0::bigint,'Invitees still cannot read invitation rows');
reset role;
select is((select invitation_status::text from public.invitation where client_event_id='80000000-0000-0000-0000-0000000000b1'),'pending','Preview changes nothing');

set local role authenticated;
select throws_ok($$select * from public.preview_invitation(repeat('z',64))$$,'42501','Invitation unavailable','Unknown token is the uniform error');
select throws_ok($$select * from public.preview_invitation('short')$$,'42501','Invitation unavailable','Malformed token is the uniform error');
select throws_ok($$select * from public.preview_invitation(null)$$,'42501','Invitation unavailable','Missing token is the uniform error');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000009","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select * from public.preview_invitation(repeat('p',64))$$,'42501','Invitation unavailable','Another account gets the uniform error');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000008","role":"authenticated","aal":"aal1"}',true);

update public.invitation set invitation_expires_at=now()-interval '1 minute' where client_event_id='80000000-0000-0000-0000-0000000000b1';
set local role authenticated;
select throws_ok($$select * from public.preview_invitation(repeat('p',64))$$,'42501','Invitation unavailable','Expired invitation gets the uniform error');
reset role;
update public.invitation set invitation_expires_at=now()+interval '1 day' where client_event_id='80000000-0000-0000-0000-0000000000b1';

update public.invitation set invitation_status='revoked' where client_event_id='80000000-0000-0000-0000-0000000000b1';
set local role authenticated;
select throws_ok($$select * from public.preview_invitation(repeat('p',64))$$,'42501','Invitation unavailable','Revoked invitation gets the uniform error');
reset role;
update public.invitation set invitation_status='pending' where client_event_id='80000000-0000-0000-0000-0000000000b1';

update public.tenant set tenant_subscription_status='suspended' where tenant_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select * from public.preview_invitation(repeat('p',64))$$,'42501','Invitation unavailable','Suspended tenant gets the uniform error');
reset role;
update public.tenant set tenant_subscription_status='cancelled' where tenant_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select * from public.preview_invitation(repeat('p',64))$$,'42501','Invitation unavailable','Cancelled tenant gets the uniform error');
reset role;
update public.tenant set tenant_subscription_status='active' where tenant_id='10000000-0000-0000-0000-000000000001';

update auth.users set email_confirmed_at=null where id='20000000-0000-0000-0000-000000000008';
set local role authenticated;
select throws_ok($$select * from public.preview_invitation(repeat('p',64))$$,'42501','Invitation unavailable','Unverified email gets the uniform error');
reset role;
update auth.users set email_confirmed_at=now() where id='20000000-0000-0000-0000-000000000008';

select set_config('request.jwt.claims','',true);
set local role anon;
select throws_ok($$select * from public.preview_invitation(repeat('p',64))$$,'42501',null,'Anonymous callers are denied');
reset role;

-- A support token (even for the invited account) never previews.
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated','aal','aal1',
  'impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
  'support_session_id',(select support_session_id from support_fixture),'session_id',(select support_session_id from support_fixture),
  'support_tenant_id','10000000-0000-0000-0000-000000000001','exp',extract(epoch from now()+interval '20 minutes'))::text,true);
set local role authenticated;
select throws_ok($$select * from public.preview_invitation(repeat('q',64))$$,'42501','Invitation unavailable','Support token cannot preview even a matching invitation');
reset role;

-- The shared gate keeps accept_invitation working exactly as before, and a preview does not consume the token.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000008","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select * from public.preview_invitation(repeat('p',64))$$,'Preview can repeat');
select lives_ok($$select public.accept_invitation(repeat('p',64))$$,'Acceptance still works after previews');
select throws_ok($$select * from public.preview_invitation(repeat('p',64))$$,'42501','Invitation unavailable','A used invitation can no longer be previewed');
select throws_ok($$select public.accept_invitation(repeat('p',64))$$,'42501','Invitation unavailable','A used invitation can no longer be accepted');
reset role;
select is((select count(*) from public.membership m join public.person p using(tenant_id,person_id) where p.user_id='20000000-0000-0000-0000-000000000008' and m.tenant_id='10000000-0000-0000-0000-000000000001' and m.membership_role='guard'),1::bigint,'Acceptance created the membership');

select * from finish();
rollback;
