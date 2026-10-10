begin;
select no_plan();
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}', true);
select set_config('request.headers', '{"x-forwarded-for":"192.0.2.10","x-device-id":"local-test-device"}', true);
set local role authenticated;

select lives_ok($$insert into public.person (person_id, tenant_id, person_first_name, person_last_name)
  values ('30000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001', 'Test', 'Person')$$,
  'Registry admin can create a person');
select is((select count(*) from public.audit_event where audit_event_row_id = '30000000-0000-0000-0000-000000000099'
  and audit_event_action = 'insert'), 1::bigint, 'Person insert creates exactly one audit event');
select is((select audit_event_diff from public.audit_event where audit_event_row_id = '30000000-0000-0000-0000-000000000099'
  and audit_event_action = 'insert'),
  (select to_jsonb(p) from public.person p where person_id = '30000000-0000-0000-0000-000000000099'),
  'Insert audit contains the full inserted row');
select is((select audit_event_actor_user_id from public.audit_event where audit_event_row_id = '30000000-0000-0000-0000-000000000099'),
  '20000000-0000-0000-0000-000000000002'::uuid, 'Audit actor user comes from auth.uid');
select is((select audit_event_actor_person_id from public.audit_event where audit_event_row_id = '30000000-0000-0000-0000-000000000099'),
  '30000000-0000-0000-0000-000000000002'::uuid, 'Audit actor person is resolved within the affected tenant');
select is((select audit_event_request_ip from public.audit_event where audit_event_row_id = '30000000-0000-0000-0000-000000000099'),
  '192.0.2.10', 'Audit includes optional request IP');
select is((select audit_event_request_device from public.audit_event where audit_event_row_id = '30000000-0000-0000-0000-000000000099'),
  'local-test-device', 'Audit includes optional request device');

update public.person set person_first_name = 'Test' where person_id = '30000000-0000-0000-0000-000000000099';
select is((select count(*) from public.audit_event where audit_event_row_id = '30000000-0000-0000-0000-000000000099'
  and audit_event_action = 'update'), 0::bigint, 'An update with no changed values emits no audit event');

select lives_ok($$update public.person set person_first_name = 'Updated', person_created_at = '2000-01-01', person_updated_at = '2000-01-01'
  where person_id = '30000000-0000-0000-0000-000000000099'$$, 'Registry admin can update a person');
select is((select person_created_at from public.person where person_id = '30000000-0000-0000-0000-000000000099'),
  now(), 'Created timestamp cannot be overwritten by clients');
select is((select person_updated_at from public.person where person_id = '30000000-0000-0000-0000-000000000099'),
  now(), 'Updated timestamp is maintained by the database');
select is((select audit_event_diff from public.audit_event where audit_event_row_id = '30000000-0000-0000-0000-000000000099'
  and audit_event_action = 'update'), '{"person_first_name":{"old":"Test","new":"Updated"}}'::jsonb,
  'Update audit includes exactly changed keys with old and new values');

select lives_ok($$insert into public.membership (membership_id, tenant_id, person_id, membership_role)
  values ('40000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000099', 'tenant_admin')$$, 'Registry admin can create a membership');
select lives_ok($$insert into public.membership_permission (membership_permission_id, tenant_id, membership_id, membership_permission_admin_permission)
  values ('60000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000099', 'communication')$$, 'Registry admin can assign an admin permission');
select lives_ok($$update public.membership_permission set membership_permission_admin_permission = 'guards'
  where membership_permission_id = '60000000-0000-0000-0000-000000000099'$$, 'Registry admin can update an admin permission');
select lives_ok($$delete from public.membership_permission where membership_permission_id = '60000000-0000-0000-0000-000000000099'$$,
  'Registry admin can delete an admin permission');
select is((select count(*) from public.audit_event where audit_event_table_name = 'membership_permission'
  and audit_event_row_id = '60000000-0000-0000-0000-000000000099'), 3::bigint, 'Permission CRUD produces three audit events');
select lives_ok($$update public.membership set membership_status = 'suspended'
  where membership_id = '40000000-0000-0000-0000-000000000099'$$, 'Registry admin can suspend a membership');
select lives_ok($$delete from public.membership where membership_id = '40000000-0000-0000-0000-000000000099'$$,
  'Registry admin can delete a membership');
select is((select count(*) from public.audit_event where audit_event_table_name = 'membership'
  and audit_event_row_id = '40000000-0000-0000-0000-000000000099'), 3::bigint, 'Membership CRUD produces three audit events');
select lives_ok($$delete from public.person where person_id = '30000000-0000-0000-0000-000000000099'$$,
  'Registry admin can delete an unreferenced person');
select is((select audit_event_diff ->> 'person_first_name' from public.audit_event
  where audit_event_row_id = '30000000-0000-0000-0000-000000000099' and audit_event_action = 'delete'),
  'Updated', 'Delete audit preserves the deleted row values');
select is((select count(*) from public.audit_event where audit_event_row_id = '30000000-0000-0000-0000-000000000099'),
  3::bigint, 'Historical audit survives source person deletion');
select lives_ok($$update public.tenant set tenant_settings = '{"test":true}' where tenant_id = '10000000-0000-0000-0000-000000000001'$$,
  'Tenant settings admin can change settings');
select is((select audit_event_diff -> 'tenant_settings' from public.audit_event
  where audit_event_row_id = '10000000-0000-0000-0000-000000000001' and audit_event_action = 'update'),
  '{"old":{},"new":{"test":true}}'::jsonb, 'Tenant settings update is audited');
select throws_ok($$update public.audit_event set audit_event_diff = '{}'$$, '42501', null, 'Even an audit reader cannot update audit');
select throws_ok($$delete from public.audit_event$$, '42501', null, 'Even an audit reader cannot delete audit');
select throws_ok($$truncate public.audit_event$$, '42501', null, 'Even an audit reader cannot truncate audit');
reset role;

select throws_ok($$update public.audit_event set audit_event_diff = '{}'$$, '42501', null, 'Audit trigger rejects owner updates');
select throws_ok($$delete from public.audit_event$$, '42501', null, 'Audit trigger rejects owner deletes');
select throws_ok($$truncate public.audit_event$$, '42501', null, 'Audit trigger rejects owner truncation');
select throws_ok($$insert into public.audit_event (audit_event_action, audit_event_table_name, audit_event_row_id, audit_event_diff)
  values ('insert', 'person', gen_random_uuid(), '{}')$$, '42501', null, 'Owner cannot forge a direct audit insert');

select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
select set_config('request.headers', '', true);
set local role authenticated;
insert into public.tenant (tenant_id, tenant_name, tenant_slug)
  values ('10000000-0000-0000-0000-000000000099', 'Audit platform test', 'audit-platform-test');
select is((select audit_event_actor_person_id from public.audit_event
  where audit_event_row_id = '10000000-0000-0000-0000-000000000099'), null::uuid,
  'Platform actor without tenant person has a nullable actor person');
select is((select audit_event_request_ip from public.audit_event
  where audit_event_row_id = '10000000-0000-0000-0000-000000000099'), null::text,
  'Missing request metadata is nullable');
update public.platform_admin set platform_admin_is_active = true;
select ok(exists(select 1 from public.audit_event where audit_event_table_name = 'platform_admin' and tenant_id is null),
  'Platform events have no tenant');
reset role;

-- Exercise the FK itself separately from the permission-role trigger.
alter table public.membership_permission disable trigger validate_admin_permission;
select throws_ok($$insert into public.membership_permission (tenant_id, membership_id, membership_permission_admin_permission)
  values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000006', 'registry')$$,
  '23503', null, 'Composite permission FK independently rejects cross-tenant references');
alter table public.membership_permission enable trigger validate_admin_permission;
select throws_ok($$insert into public.person (tenant_id, user_id, person_first_name, person_last_name)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Duplicate', 'User')$$,
  '23505', null, 'A user has at most one person per tenant');
select throws_ok($$insert into public.person (tenant_id, person_first_name, person_last_name, person_document_type, person_document_number)
  values ('10000000-0000-0000-0000-000000000001', 'Duplicate', 'Document', 'DNI', '90000002')$$,
  '23505', null, 'Document identity is unique within a tenant');
select lives_ok($$insert into public.person (tenant_id, person_first_name, person_last_name, person_document_type, person_document_number)
  values ('10000000-0000-0000-0000-000000000002', 'Same', 'Document', 'DNI', '90000002')$$,
  'The same document can exist independently in another tenant');
select set_config('request.headers', 'invalid-json', true);
select lives_ok($$insert into public.person (person_id, tenant_id, person_first_name, person_last_name)
  values ('30000000-0000-0000-0000-000000000098', '10000000-0000-0000-0000-000000000001', 'Malformed', 'Metadata')$$,
  'Malformed optional request headers do not abort an audited write');
select is((select audit_event_request_ip from public.audit_event where audit_event_row_id = '30000000-0000-0000-0000-000000000098'),
  null::text, 'Malformed optional request headers produce null audit metadata');
select * from finish();
rollback;
