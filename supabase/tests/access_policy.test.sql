begin;
select no_plan();
create temp table policy_fixture(key text primary key,value jsonb);
grant all on policy_fixture to authenticated;
select is((select count(*) from public.access_policy),2::bigint,'Each seed tenant has a policy');
select is((select count(*) from public.access_policy_rule),14::bigint,'All seven visitor rules per seed tenant');
select is(app_private.access_policy_snapshot('10000000-0000-0000-0000-000000000001'),app_private.access_policy_template_data('balanced'),'Ceibos balanced');
select is(app_private.access_policy_snapshot('10000000-0000-0000-0000-000000000002'),app_private.access_policy_template_data('strict'),'Tipas strict');
-- Hard bounds survive owner SQL, independently of RPC validation or RLS.
select throws_ok(format('update public.access_policy set %I=%s where tenant_id=''10000000-0000-0000-0000-000000000001''',key,bad),
  '23514',null,'Owner CHECK for '||key||'='||bad) from (values
  ('access_policy_approval_timeout_seconds_count',29),('access_policy_approval_timeout_seconds_count',301),
  ('access_policy_permanent_authorization_max_days_count',0),('access_policy_permanent_authorization_max_days_count',3651),
  ('access_policy_pass_max_uses_count',0),('access_policy_pass_max_uses_count',101),
  ('access_policy_pass_max_days_count',0),('access_policy_pass_max_days_count',366),
  ('access_policy_event_max_guests_count',0),('access_policy_event_max_guests_count',1001)) bounds(key,bad);
select throws_ok(format('update public.access_policy_rule set access_policy_rule_allowed_modes=%L::public.household_access_mode[] where tenant_id=''10000000-0000-0000-0000-000000000001'' and access_policy_rule_visitor_type=''unknown''',modes),
  '23514',null,'DB unknown/array hard rule '||modes) from unnest(array['{approval,direct_entry}','{approval,notify}','{}','{approval,approval}','{approval,NULL}','{{approval,reject},{approval,reject}}']) modes;
select throws_ok($$update public.access_policy_rule set access_policy_rule_default_mode='reject' where tenant_id='10000000-0000-0000-0000-000000000001' and access_policy_rule_visitor_type='permanent_authorized'$$,'23514',null,'Default must be allowed');
select throws_ok($$insert into public.access_policy_rule(tenant_id,access_policy_id,access_policy_rule_visitor_type,access_policy_rule_allowed_modes,access_policy_rule_default_mode,access_policy_rule_is_identity_verification_required)
  select '10000000-0000-0000-0000-000000000099',access_policy_id,'unknown','{approval}','approval',true from public.access_policy limit 1$$,'23503',null,'Composite FK rejects foreign tenant policy');
create function pg_temp.incomplete_policy() returns void language plpgsql as $$ begin
  delete from public.access_policy_rule where tenant_id='10000000-0000-0000-0000-000000000001' and access_policy_rule_visitor_type='unknown';
  set constraints all immediate;
end $$;
select throws_ok('select pg_temp.incomplete_policy()','23514','Policy requires all visitor types','Deferred check rejects missing rule');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.access_policy),1::bigint,'Admin sees own policy only');
select is((select count(*) from public.access_policy_rule),7::bigint,'Admin sees own rules only');
select ok(public.get_access_policy('10000000-0000-0000-0000-000000000001') ? 'metadata','Config admin receives metadata');
select throws_ok($$select public.get_access_policy('10000000-0000-0000-0000-000000000002')$$,'42501','Access policy denied','Cross tenant read denied');
select throws_ok($$select public.get_access_policy('10000000-0000-0000-0000-000000000099')$$,'42501','Access policy denied','Missing tenant read same error');
select throws_ok($$select public.apply_access_policy_template('10000000-0000-0000-0000-000000000002','strict',gen_random_uuid())$$,'42501','Access policy denied','Cross tenant write denied');
select throws_ok($$select public.access_policy_history('10000000-0000-0000-0000-000000000002')$$,'42501','Access policy denied','Cross tenant history denied');
select throws_ok(format('insert into public.%I(tenant_id) values(''10000000-0000-0000-0000-000000000002'')',t),'42501',null,'Client INSERT denied '||t) from unnest(array['access_policy','access_policy_rule']) t;
select throws_ok(format('update public.%I set tenant_id=''10000000-0000-0000-0000-000000000002''',t),'42501',null,'Client UPDATE denied '||t) from unnest(array['access_policy','access_policy_rule']) t;
select throws_ok(format('delete from public.%I',t),'42501',null,'Client DELETE denied '||t) from unnest(array['access_policy','access_policy_rule']) t;
insert into policy_fixture values('before',public.get_access_policy('10000000-0000-0000-0000-000000000001'));
insert into policy_fixture values('strict',public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','strict','f0300000-0000-4000-8000-000000000001'));
select is(public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','strict','f0300000-0000-4000-8000-000000000001'),
  (select value from policy_fixture where key='strict'),'Template retry returns identical result');
select is((select count(*) from public.access_policy_history('10000000-0000-0000-0000-000000000001')),1::bigint,'Retry creates no history duplicate');
select is((select before_policy from public.access_policy_history('10000000-0000-0000-0000-000000000001')),
  (select value->'policy' from policy_fixture where key='before'),'History retains full before snapshot');
select is((select after_policy from public.access_policy_history('10000000-0000-0000-0000-000000000001')),
  (select value->'policy' from policy_fixture where key='strict'),'History retains full after snapshot');
select is((select audit_event_actor_user_id from public.access_policy_history('10000000-0000-0000-0000-000000000001')),'20000000-0000-0000-0000-000000000002'::uuid,'History attributes actor');
select throws_ok($$select public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','flexible','f0300000-0000-4000-8000-000000000001')$$,'42501','Access policy retry denied','Changed retry input denied');
insert into policy_fixture values('custom',public.update_access_policy('10000000-0000-0000-0000-000000000001',
  jsonb_set((select value->'policy' from policy_fixture where key='strict'),'{access_policy_approval_timeout_seconds_count}','150'),'f0300000-0000-4000-8000-000000000002'));
select ok((select value->'metadata'->'access_policy_applied_template'='null'::jsonb from policy_fixture where key='custom'),'Custom edit clears template');
select is(public.update_access_policy('10000000-0000-0000-0000-000000000001',jsonb_set((select value->'policy' from policy_fixture where key='strict'),'{access_policy_approval_timeout_seconds_count}','150'),'f0300000-0000-4000-8000-000000000002'),
  (select value from policy_fixture where key='custom'),'Custom update idempotent');
select throws_ok(format('select public.update_access_policy(''10000000-0000-0000-0000-000000000001'',%L::jsonb,gen_random_uuid())',policy),'22023','Invalid access policy','Invalid whole policy rejected') from (
  select '{}'::jsonb policy union all select (value->'policy')-'rules' from policy_fixture where key='before'
  union all select jsonb_set(value->'policy','{rules,unknown,access_policy_rule_allowed_modes}','["notify","approval"]') from policy_fixture where key='before'
  union all select jsonb_set(value->'policy','{access_policy_approval_timeout_seconds_count}','"90"') from policy_fixture where key='before'
  union all select jsonb_set(value->'policy','{rules,unknown,access_policy_rule_default_mode}','"direct_entry"') from policy_fixture where key='before'
  union all select jsonb_set(value->'policy','{rules,unknown,access_policy_rule_is_identity_verification_required}','null') from policy_fixture where key='before'
  union all select jsonb_set(value->'policy','{rules,unknown,access_policy_rule_allowed_modes}','[null]') from policy_fixture where key='before'
  union all select jsonb_set(value->'policy','{rules,unknown,access_policy_rule_allowed_modes}','["invented"]') from policy_fixture where key='before'
  union all select jsonb_set(value->'policy','{rules,unknown,extra}','true') from policy_fixture where key='before'
  union all select jsonb_set(value->'policy','{rules}',(value->'policy'->'rules')-'unknown') from policy_fixture where key='before'
) invalid;
reset role;
-- Member, guard and unrelated admins receive only the safe projection; none can write/history.
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000004','role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select is((select count(*) from public.access_policy),0::bigint,'Holder cannot read raw policy metadata');
select is((select count(*) from public.access_policy_rule),0::bigint,'Holder uses safe RPC projection');
select ok(not public.get_access_policy('10000000-0000-0000-0000-000000000001') ? 'metadata','Holder reads without admin metadata');
select throws_ok($$select public.update_access_policy('10000000-0000-0000-0000-000000000001','{}',gen_random_uuid())$$,'42501','Access policy denied','Holder write denied before input validation');
select throws_ok($$select public.access_policy_history('10000000-0000-0000-0000-000000000001')$$,'42501','Access policy denied','Holder history denied');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000005","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select ok(not public.get_access_policy('10000000-0000-0000-0000-000000000001') ? 'metadata','Household member reads safe subset');
select throws_ok($$select public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','strict',gen_random_uuid())$$,'42501','Access policy denied','Household member write denied');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select ok(not public.get_access_policy('10000000-0000-0000-0000-000000000001') ? 'metadata','Guard can consume rules for M05');
select throws_ok($$select public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','strict',gen_random_uuid())$$,'42501','Access policy denied','Guard write denied');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000012","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select ok(not public.get_access_policy('10000000-0000-0000-0000-000000000001') ? 'metadata','Registry-only admin gets safe rules');
select throws_ok($$select public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','strict',gen_random_uuid())$$,'42501','Access policy denied','Other admin permission cannot write');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok($$select public.get_access_policy('10000000-0000-0000-0000-000000000001')$$,'42501','Access policy denied','Platform has no standing policy access');
insert into policy_fixture values('tenant',to_jsonb(public.create_tenant('Policy initialization test','policy-initialization-test',client_event_id=>'f0300000-0000-4000-8000-000000000009')));
insert into policy_fixture values('support',to_jsonb(public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000010','Policy test',gen_random_uuid())));
reset role;
select is(app_private.access_policy_snapshot('f0300000-0000-4000-8000-000000000009'),app_private.access_policy_template_data('balanced'),'create_tenant applies balanced atomically');
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000010','role','authenticated','aal','aal1',
  'session_id',(select value->>'support_session_id' from policy_fixture where key='support'),'support_session_id',(select value->>'support_session_id' from policy_fixture where key='support'),
  'support_tenant_id','10000000-0000-0000-0000-000000000001','impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
  'exp',floor(extract(epoch from((select value->>'support_session_expires_at' from policy_fixture where key='support')::timestamptz))))::text,true);
set local role authenticated;
select lives_ok($$select public.get_access_policy('10000000-0000-0000-0000-000000000001')$$,'Valid support reads target safe policy');
select throws_ok($$select public.get_access_policy('10000000-0000-0000-0000-000000000002')$$,'42501','Access policy denied','Support bound tenant overrides dual tenant target');
select lives_ok($$select public.end_support_session((select(value->>'support_session_id')::uuid from policy_fixture where key='support'))$$,'End support');
select throws_ok($$select public.get_access_policy('10000000-0000-0000-0000-000000000001')$$,'42501','Access policy denied','Ended support denied immediately');
reset role;
-- Internal consumers preserve tenant binding without exposing helpers to client roles.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role registry_writer;
select ok(app_private.policy_allows_mode('10000000-0000-0000-0000-000000000001','unknown','approval'),'Consumer allows approval for unknown');
select ok(not app_private.policy_allows_mode('10000000-0000-0000-0000-000000000001','unknown','notify'),'Consumer rejects notify for unknown');
select is(app_private.policy_default_mode('10000000-0000-0000-0000-000000000001','unknown'),'approval'::public.household_access_mode,'Consumer reads default');
select ok(app_private.policy_requires_identity('10000000-0000-0000-0000-000000000001','unknown'),'Consumer reads identity requirement');
select is(app_private.policy_approval_timeout('10000000-0000-0000-0000-000000000001'),150,'Consumer reads current timeout');
select is(app_private.policy_limits('10000000-0000-0000-0000-000000000001')->>'access_policy_pass_max_uses_count','3','Consumer reads current limits');
select throws_ok($$select app_private.policy_default_mode('10000000-0000-0000-0000-000000000002','unknown')$$,'42501','Access policy denied','Consumer authorizes before foreign rule lookup');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
insert into policy_fixture values('admin-support',to_jsonb(public.start_support_session('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Policy admin support test',gen_random_uuid())));
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','20000000-0000-0000-0000-000000000002','role','authenticated','aal','aal1',
  'session_id',(select value->>'support_session_id' from policy_fixture where key='admin-support'),'support_session_id',(select value->>'support_session_id' from policy_fixture where key='admin-support'),
  'support_tenant_id','10000000-0000-0000-0000-000000000001','impersonator_user_id','20000000-0000-0000-0000-000000000001','impersonator_aal','aal2',
  'exp',floor(extract(epoch from((select value->>'support_session_expires_at' from policy_fixture where key='admin-support')::timestamptz))))::text,true);
set local role authenticated;
select lives_ok($$select public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','balanced','f0300000-0000-4000-8000-000000000004')$$,'Admin support has target configuration rights');
select is((select audit_event_actor_user_id from public.access_policy_history('10000000-0000-0000-0000-000000000001') where client_event_id='f0300000-0000-4000-8000-000000000004'),
  '20000000-0000-0000-0000-000000000001'::uuid,'Support history records true actor');
select is((select audit_event_on_behalf_of_user_id from public.access_policy_history('10000000-0000-0000-0000-000000000001') where client_event_id='f0300000-0000-4000-8000-000000000004'),
  '20000000-0000-0000-0000-000000000002'::uuid,'Support history records represented admin');
select lives_ok($$select public.end_support_session((select(value->>'support_session_id')::uuid from policy_fixture where key='admin-support'))$$,'End admin support');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','balanced','f0300000-0000-4000-8000-000000000004')$$,'42501','Access policy retry denied','Same target account cannot reuse support actor receipt');
reset role;
update public.tenant set tenant_subscription_status='suspended' where tenant_id='10000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.get_access_policy('10000000-0000-0000-0000-000000000001')$$,'Suspended tenant remains readable');
select throws_ok($$select public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','strict',gen_random_uuid())$$,'42501','Access policy denied','Suspended write denied');
select throws_ok($$select public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','strict','f0300000-0000-4000-8000-000000000001')$$,'42501','Access policy denied','Suspension also denies previous retry');
reset role;
select ok(not pg_has_role('authenticated','access_policy_writer','MEMBER') and not pg_has_role('service_role','access_policy_writer','MEMBER'),'Exclusive RPC capability');
select ok(not has_schema_privilege('access_policy_writer','public','CREATE') and not has_schema_privilege('access_policy_writer','app_private','CREATE'),'No arbitrary definer creation');
select ok(not has_function_privilege(role,p.oid,'EXECUTE'),role||' cannot execute '||p.proname)
  from pg_proc p cross join unnest(array['anon','service_role']) role where p.pronamespace='public'::regnamespace
    and p.proname in('get_access_policy','apply_access_policy_template','update_access_policy','access_policy_history');
select ok((select not rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls from pg_roles where rolname='access_policy_writer'),'Policy capability has no cluster elevation');
select * from finish();
rollback;
