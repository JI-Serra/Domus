begin;
select no_plan();
create temp table test_membership_id (membership_id uuid);
grant select, insert on test_membership_id to authenticated;
-- Model a future unsafe definer: the audit guard must still enforce platform-only fields.
create function pg_temp.unsafe_settings_probe(change_slug boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if change_slug then
    update public.tenant set tenant_slug='bypassed' where tenant_id='10000000-0000-0000-0000-000000000001';
  else
    update public.tenant set tenant_subscription_status='active' where tenant_id='10000000-0000-0000-0000-000000000001';
  end if;
end;
$$;
grant execute on function pg_temp.unsafe_settings_probe(boolean) to authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
select set_config('request.headers','{"x-forwarded-for":"192.0.2.10, 198.51.100.9","x-device-id":"local-test-device"}',true);
set local role authenticated;
select throws_ok($$select pg_temp.unsafe_settings_probe(true)$$,'42501',null,'A definer cannot bypass platform-only slug authorization');
select throws_ok($$select pg_temp.unsafe_settings_probe(false)$$,'42501',null,'A definer cannot bypass platform-only subscription authorization');
select lives_ok($$insert into public.person (person_id,tenant_id,person_first_name,person_last_name,person_document_type,person_document_number,person_phone,person_birth_date)
  values ('30000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','Test','Person','dni','12345678','+54 381 555 0100','1990-05-01')$$,'Registry can insert an unbound person');
select is((select count(*) from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099'),1::bigint,'Person insert produces one atomic event');
select is((select audit_event_diff from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099'),
  (select to_jsonb(p)||'{"person_first_name":{"changed":true},"person_last_name":{"changed":true},"person_email":{"changed":true},"person_document_number":{"changed":true},"person_phone":{"changed":true},"person_birth_date":{"changed":true},"person_claimed_email":{"changed":true},"person_claimed_document_number":{"changed":true}}'::jsonb from public.person p where person_id='30000000-0000-0000-0000-000000000099'),'Insert preserves the full row except declared redactions');
select is((select audit_event_actor_user_id from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099'),'20000000-0000-0000-0000-000000000002'::uuid,'Actor user comes from signed claims');
select is((select audit_event_actor_person_id from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099'),'30000000-0000-0000-0000-000000000002'::uuid,'Actor person is resolved within the tenant');
select is((select audit_event_db_role from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099'),'authenticated','Audit retains originating role instead of audit_writer');
select is((select audit_event_request_ip from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099'),'192.0.2.10','Only the first forwarded hop is stored');
select is((select audit_event_request_device from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099'),'local-test-device','Optional device is captured');
update public.person set person_first_name='Test' where person_id='30000000-0000-0000-0000-000000000099';
select is((select count(*) from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099' and audit_event_action='update'),0::bigint,'No-op writes emit no audit event');
select throws_ok($$update public.person set person_created_at='2000-01-01',person_updated_at='2000-01-01' where person_id='30000000-0000-0000-0000-000000000099'$$,'42501',null,'Clients cannot override timestamps');
select lives_ok($$update public.person set person_first_name='Updated' where person_id='30000000-0000-0000-0000-000000000099'$$,'Registry can update a person');
select is((select person_created_at from public.person where person_id='30000000-0000-0000-0000-000000000099'),now(),'Created timestamp is maintained');
select is((select person_updated_at from public.person where person_id='30000000-0000-0000-0000-000000000099'),now(),'Updated timestamp is maintained');
select is((select audit_event_diff from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099' and audit_event_action='update'),'{"person_first_name":{"changed":true}}'::jsonb,'Update redacts changed personal names');
select lives_ok($$update public.person set person_document_number='87654321',person_phone='+54 381 555 0200',person_birth_date='1991-06-01' where person_id='30000000-0000-0000-0000-000000000099'$$,'Sensitive fields can be rectified');
select is((select audit_event_diff from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099' and audit_event_diff ? 'person_phone' and audit_event_action='update'),
  '{"person_document_number":{"changed":true},"person_phone":{"changed":true},"person_birth_date":{"changed":true}}'::jsonb,'Sensitive update records markers without old or new PII');

select lives_ok($$insert into test_membership_id select public.create_membership('30000000-0000-0000-0000-000000000099','tenant_admin')$$,'Management RPC creates another admin');
select lives_ok($$select public.grant_admin_permission((select membership_id from test_membership_id),'communication')$$,'Management RPC grants another admin permission');
select lives_ok($$select public.grant_admin_permission((select membership_id from test_membership_id),'communication')$$,'Repeated grant is idempotent');
select lives_ok($$select public.revoke_admin_permission((select membership_id from test_membership_id),'communication')$$,'Management RPC revokes another admin permission');
select is((select count(*) from public.audit_event where audit_event_table_name='membership_permission' and audit_event_diff->>'membership_id'=(select membership_id::text from test_membership_id)),2::bigint,'Permission RPCs emit insert and delete audit events');
select lives_ok($$select public.update_membership((select membership_id from test_membership_id),'tenant_admin','suspended','2020-01-01',null)$$,'Management RPC updates another admin');
select lives_ok($$select public.delete_membership((select membership_id from test_membership_id))$$,'Management RPC deletes another admin');
select is((select count(*) from public.audit_event where audit_event_table_name='membership' and audit_event_row_id=(select membership_id from test_membership_id)),3::bigint,'Membership RPC CRUD produces three audit events');
select lives_ok($$delete from public.person where person_id='30000000-0000-0000-0000-000000000099'$$,'Registry deletes an unreferenced person');
select is((select audit_event_diff->'person_first_name' from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099' and audit_event_action='delete'),'{"changed":true}'::jsonb,'Delete audit redacts personal names');
select is((select audit_event_diff->'person_phone' from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099' and audit_event_action='delete'),'{"changed":true}'::jsonb,'Delete audit redacts sensitive values');
select is((select count(*) from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000099'),4::bigint,'Historical events survive source deletion');
select throws_ok($$update public.audit_event set audit_event_diff='{}'$$,'42501',null,'Client audit UPDATE is denied');
select throws_ok($$delete from public.audit_event$$,'42501',null,'Client audit DELETE is denied');
select throws_ok($$truncate public.audit_event$$,'42501',null,'Client audit TRUNCATE is denied');
select throws_ok($$select app_private.purge_audit_events(now()-interval '1 year')$$,'42501',null,'Client cannot invoke retention purge');
reset role;

select throws_ok($$update public.audit_event set audit_event_diff='{}'$$,'42501',null,'Owner audit UPDATE is rejected');
select throws_ok($$delete from public.audit_event$$,'42501',null,'Owner direct audit DELETE is rejected');
select throws_ok($$truncate public.audit_event$$,'42501',null,'Owner audit TRUNCATE is rejected');
select throws_ok($$insert into public.audit_event(audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff) values('forged','insert','person',gen_random_uuid(),'{}')$$,'42501',null,'Owner cannot directly forge an event');
set local session_replication_role=replica;
select throws_ok($$delete from public.audit_event$$,'42501',null,'Replica mode cannot bypass audit DELETE protection');
select throws_ok($$truncate public.audit_event$$,'42501',null,'Replica mode cannot bypass audit TRUNCATE protection');
insert into public.person(person_id,tenant_id,person_first_name,person_last_name)
  values('30000000-0000-0000-0000-000000000097','10000000-0000-0000-0000-000000000001','Replica','Test');
select is((select count(*) from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000097'),1::bigint,'Sensitive writes remain audited in replica mode');
set local session_replication_role=origin;

-- An unrelated nested trigger cannot use depth to forge audit events.
create temp table test_forge (test_id uuid);
create function pg_temp.forge_audit() returns trigger language plpgsql as $$
begin
  insert into public.audit_event(audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff)
    values('forged','insert','person',new.test_id,'{}');
  return new;
end;
$$;
create trigger forge_audit after insert on test_forge for each row execute function pg_temp.forge_audit();
select throws_ok($$insert into test_forge values(gen_random_uuid())$$,'42501',null,'Unrelated nested trigger cannot forge audit');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"service_role"}',true);
set local role service_role;
select lives_ok($$insert into public.person(person_id,tenant_id,person_first_name,person_last_name)
  values('30000000-0000-0000-0000-000000000096','10000000-0000-0000-0000-000000000001','Server','Actor')$$,'Server writes use SQL role without service credentials');
select throws_ok($$truncate public.membership_permission$$,'42501',null,'Server role cannot truncate an audited table');
select throws_ok($$select app_private.purge_audit_events(now()-interval '1 year')$$,'42501',null,'Server role cannot invoke retention purge');
reset role;
select is((select audit_event_db_role from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000096'),'service_role','Server audit includes originating database role');
select is((select audit_event_actor_user_id from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000096'),'20000000-0000-0000-0000-000000000002'::uuid,'Server audit includes validated acting user when supplied');
select is((select audit_event_actor_person_id from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000096'),'30000000-0000-0000-0000-000000000002'::uuid,'Server actor person remains tenant scoped');
select set_config('request.jwt.claims','{}',true);
set local role service_role;
insert into public.person(person_id,tenant_id,person_first_name,person_last_name)
  values('30000000-0000-0000-0000-000000000095','10000000-0000-0000-0000-000000000001','Server','System');
reset role;
select is((select audit_event_actor_user_id from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000095'),null::uuid,'System server writes have nullable user attribution');
select is((select audit_event_db_role from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000095'),'service_role','System server writes retain database role');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('request.headers','',true);
set local role authenticated;
insert into public.tenant(tenant_id,tenant_name,tenant_slug)
  values('10000000-0000-0000-0000-000000000099','Audit platform','audit-platform');
delete from public.tenant where tenant_id='10000000-0000-0000-0000-000000000099';
select is((select count(*) from public.audit_event where audit_event_row_id='10000000-0000-0000-0000-000000000099' and audit_event_action='delete'),1::bigint,'Tenant deletion is audited');
select is((select audit_event_actor_person_id from public.audit_event where audit_event_row_id='10000000-0000-0000-0000-000000000099' and audit_event_action='insert'),null::uuid,'Platform actor person can be null');
select is((select audit_event_request_ip from public.audit_event where audit_event_row_id='10000000-0000-0000-0000-000000000099' and audit_event_action='insert'),null::text,'Missing metadata stays nullable');
reset role;
select set_config('request.headers','invalid-json',true);
select lives_ok($$insert into public.person(person_id,tenant_id,person_first_name,person_last_name)
  values('30000000-0000-0000-0000-000000000094','10000000-0000-0000-0000-000000000001','Malformed','Metadata')$$,'Malformed metadata does not abort a valid write');
select is((select audit_event_request_ip from public.audit_event where audit_event_row_id='30000000-0000-0000-0000-000000000094'),null::text,'Malformed metadata becomes null');

-- Only the dedicated NOLOGIN retention entry point can remove old records.
set local role audit_writer;
insert into public.audit_event(audit_event_id,audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff,audit_event_occurred_at)
  values('70000000-0000-0000-0000-000000000099','postgres','insert','retention_fixture',gen_random_uuid(),'{}',now()-interval '2 years');
reset role;
select is(app_private.purge_audit_events(now()-interval '1 year'),1::bigint,'Sanctioned retention removes the expired event');
select is((select count(*) from public.audit_event where audit_event_id='70000000-0000-0000-0000-000000000099'),0::bigint,'Expired history is removed through retention');
select is((select audit_event_diff->>'audit_event_purged_count' from public.audit_event where audit_event_table_name='audit_event'),'1','Retention volume is audited');
select is((select audit_event_db_role from public.audit_event where audit_event_table_name='audit_event'),'audit_purger','Retention audit records dedicated role');
select throws_ok($$select app_private.purge_audit_events(now())$$,'22023',null,'Retention cannot purge present or future events');
select * from finish();
rollback;
