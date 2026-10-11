begin;
select no_plan();
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role registry_writer;
select throws_ok($$select app_private.policy_default_mode('10000000-0000-0000-0000-000000000001',null)$$,'55000','Access policy unavailable','NULL visitor fails closed: app_private.policy_default_mode');
select throws_ok($$select app_private.policy_requires_identity('10000000-0000-0000-0000-000000000001',null)$$,'55000','Access policy unavailable','NULL visitor fails closed: app_private.policy_requires_identity');
select throws_ok($$select app_private.policy_default_mode(null, 'unknown')$$,'42501','Access policy denied','NULL tenant denied: app_private.policy_default_mode');
select throws_ok($$select app_private.policy_requires_identity(null, 'unknown')$$,'42501','Access policy denied','NULL tenant denied: app_private.policy_requires_identity');
select throws_ok($$select app_private.policy_limits(null)$$,'42501','Access policy denied','NULL tenant denied: app_private.policy_limits');
select throws_ok($$select app_private.policy_approval_timeout(null)$$,'42501','Access policy denied','NULL tenant denied: app_private.policy_approval_timeout');
select throws_ok($$select app_private.policy_default_mode('10000000-0000-0000-0000-000000000001','invented')$$,
  '22P02',null,'Invalid enum visitor cannot enter default helper');
select throws_ok($$select app_private.policy_requires_identity('10000000-0000-0000-0000-000000000001','invented')$$,
  '22P02',null,'Invalid enum visitor cannot enter identity helper');
reset role;
set local role authenticated;
select throws_ok($$select public.get_access_policy(null)$$,'42501','Access policy denied','NULL RPC tenant denied: public.get_access_policy');
reset role;
savepoint missing_rule;
delete from public.access_policy_rule where tenant_id='10000000-0000-0000-0000-000000000001' and access_policy_rule_visitor_type='unknown';
set local role registry_writer;
select throws_ok($$select app_private.policy_default_mode('10000000-0000-0000-0000-000000000001','unknown')$$,'55000','Access policy unavailable','Missing rule fails closed: app_private.policy_default_mode');
select throws_ok($$select app_private.policy_requires_identity('10000000-0000-0000-0000-000000000001','unknown')$$,'55000','Access policy unavailable','Missing rule fails closed: app_private.policy_requires_identity');
select throws_ok($$select app_private.policy_limits('10000000-0000-0000-0000-000000000001')$$,'55000','Access policy unavailable','Missing rule fails closed: app_private.policy_limits');
select throws_ok($$select app_private.policy_approval_timeout('10000000-0000-0000-0000-000000000001')$$,'55000','Access policy unavailable','Missing rule fails closed: app_private.policy_approval_timeout');
select is(app_private.policy_allows_mode('10000000-0000-0000-0000-000000000001','unknown','approval'),false,'Missing rule cannot allow a mode');
reset role;
set local role authenticated;
select throws_ok($$select public.get_access_policy('10000000-0000-0000-0000-000000000001')$$,'55000','Access policy unavailable','Incomplete RPC read: public.get_access_policy');
reset role;
rollback to savepoint missing_rule;
savepoint missing_header;
delete from public.access_policy where tenant_id='10000000-0000-0000-0000-000000000001';
set local role registry_writer;
select throws_ok($$select app_private.policy_default_mode('10000000-0000-0000-0000-000000000001','unknown')$$,'55000','Access policy unavailable','Missing header fails closed: app_private.policy_default_mode');
select throws_ok($$select app_private.policy_requires_identity('10000000-0000-0000-0000-000000000001','unknown')$$,'55000','Access policy unavailable','Missing header fails closed: app_private.policy_requires_identity');
select throws_ok($$select app_private.policy_limits('10000000-0000-0000-0000-000000000001')$$,'55000','Access policy unavailable','Missing header fails closed: app_private.policy_limits');
select throws_ok($$select app_private.policy_approval_timeout('10000000-0000-0000-0000-000000000001')$$,'55000','Access policy unavailable','Missing header fails closed: app_private.policy_approval_timeout');
select is(app_private.policy_allows_mode('10000000-0000-0000-0000-000000000001','unknown','approval'),false,'Missing header cannot allow a mode');
reset role;
set local role authenticated;
select throws_ok($$select public.get_access_policy('10000000-0000-0000-0000-000000000001')$$,'55000','Access policy unavailable','Incomplete RPC read: public.get_access_policy');
reset role;
rollback to savepoint missing_header;
create function pg_temp.delete_policy() returns void language plpgsql as $$ begin
delete from public.access_policy where tenant_id='10000000-0000-0000-0000-000000000001';
set constraints all immediate;
end $$;
select throws_ok('select pg_temp.delete_policy()','23514','Policy requires all visitor types','Surviving tenant requires a policy');
savepoint tenant_cascade;
insert into public.tenant(tenant_id,tenant_name,tenant_slug) values('f0250000-0000-4000-8000-000000000001','Policy cascade test','policy-cascade-test');
delete from public.tenant where tenant_id='f0250000-0000-4000-8000-000000000001';
select lives_ok('set constraints all immediate','Empty tenant cascade remains valid');
rollback to savepoint tenant_cascade;
savepoint audit_redaction;
create temp table review_audit_before as select audit_event_id from public.audit_event;
create or replace function app_private.audit_redacted_columns(target_table text) returns text[]
language sql immutable set search_path='' as $$
  select case target_table
    when 'person' then array['person_first_name','person_last_name','person_document_number','person_email','person_phone','person_birth_date',
      'person_claimed_document_number','person_claimed_email']::text[]
    when 'tenant' then array[]::text[] when 'platform_admin' then array[]::text[]
    when 'membership' then array[]::text[] when 'membership_permission' then array[]::text[]
    when 'invitation' then array['invitation_email','invitation_first_name','invitation_last_name','invitation_token_hash']::text[]
    when 'support_session' then array['support_session_reason','support_session_revocation_reason']::text[]
    when 'unit' then array['unit_contact_phone','unit_backup_phone']::text[]
    when 'unit_resident' then array[]::text[] when 'membership_household_permission' then array[]::text[]
    when 'vehicle' then array['vehicle_plate_code']::text[] when 'pet' then array['pet_photo_path']::text[]
    when 'unit_join_code' then array['unit_join_code_hash']::text[]
    when 'unit_join_request' then array['unit_join_request_email','unit_join_request_first_name','unit_join_request_last_name','unit_join_request_document_number','unit_join_request_birth_date']::text[]
    when 'gate' then array[]::text[] when 'gate_guard' then array[]::text[]
    when 'device' then array['device_credential_hash']::text[] when 'device_pairing' then array['device_pairing_code_hash']::text[]
    when 'registry_import' then array[]::text[] when 'registry_import_row' then array['registry_import_row_data']::text[] when 'access_policy' then array['access_policy_updated_by_user_id','access_policy_pass_max_uses_count']::text[] when 'access_policy_rule' then array['access_policy_rule_is_identity_verification_required']::text[] else null::text[] end;
$$;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','strict',gen_random_uuid());
select public.apply_access_policy_template('10000000-0000-0000-0000-000000000001','balanced',gen_random_uuid());
reset role;
select is((select count(*) from public.audit_event where audit_event_table_name='access_policy' and audit_event_id not in(select audit_event_id from review_audit_before) and audit_event_diff->'after'->'access_policy_updated_by_user_id'='{"changed":true}'::jsonb),2::bigint,'Declared policy actor is masked in new row events');
select ok(not exists(select 1 from public.audit_event where audit_event_table_name='access_policy' and audit_event_id not in(select audit_event_id from review_audit_before) and (audit_event_diff->'before'->>'access_policy_updated_by_user_id'='20000000-0000-0000-0000-000000000002' or audit_event_diff->'after'->>'access_policy_updated_by_user_id'='20000000-0000-0000-0000-000000000002')),'Reviewer probe: neither snapshot retains declared actor UUID');
select ok(not exists(select 1 from public.audit_event where audit_event_table_name='access_policy_rule' and audit_event_id not in(select audit_event_id from review_audit_before) and (jsonb_typeof(audit_event_diff->'before'->'access_policy_rule_is_identity_verification_required')='boolean' or jsonb_typeof(audit_event_diff->'after'->'access_policy_rule_is_identity_verification_required')='boolean')),'Declared rule values are masked in both snapshots');
select ok(exists(select 1 from public.audit_event where audit_event_table_name='access_policy_rule' and audit_event_id not in(select audit_event_id from review_audit_before)), 'Rule redaction probe exercised new row events');
select is((select count(*) from public.audit_event where audit_event_table_name='access_policy_change' and audit_event_id not in(select audit_event_id from review_audit_before)
  and audit_event_diff->'before'->'access_policy_pass_max_uses_count'='{"changed":true}'::jsonb
  and audit_event_diff->'after'->'access_policy_pass_max_uses_count'='{"changed":true}'::jsonb),2::bigint,'Aggregate history masks declared header values in both snapshots');
select ok(not exists(select 1 from public.audit_event a cross join lateral jsonb_each(a.audit_event_diff->'after'->'rules') r
  where a.audit_event_table_name='access_policy_change' and a.audit_event_id not in(select audit_event_id from review_audit_before)
    and jsonb_typeof(r.value->'access_policy_rule_is_identity_verification_required')='boolean'),'Aggregate history masks declared rule values');
rollback to savepoint audit_redaction;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.update_access_policy('10000000-0000-0000-0000-000000000001',
  jsonb_set(public.get_access_policy('10000000-0000-0000-0000-000000000001')->'policy','{access_policy_approval_timeout_seconds_count}','90.0'),gen_random_uuid())$$,
  'Integral JSON decimal is accepted consistently with validator');
select throws_ok($$select public.update_access_policy('10000000-0000-0000-0000-000000000001',
  jsonb_set(public.get_access_policy('10000000-0000-0000-0000-000000000001')->'policy','{access_policy_approval_timeout_seconds_count}','90.5'),gen_random_uuid())$$,
  '22023','Invalid access policy','Fractional decimal remains invalid');
reset role;
set local role access_policy_writer;
select is((select count(*) from public.audit_event where audit_event_table_name<>'access_policy_change'),0::bigint,'Policy writer cannot read unrelated module audit');
reset role;
select * from finish();
rollback;
