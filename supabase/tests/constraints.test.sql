begin;
select no_plan();
select lives_ok($$select '+54 381 555 0100'::public.phone_number$$, 'Phone domain accepts a normal phone number');
select throws_ok($$select ''::public.phone_number$$, '23514', null, 'Phone domain rejects empty values');
select throws_ok($$select repeat('1', 33)::public.phone_number$$, '23514', null, 'Phone domain rejects excessive length');
select lives_ok($$select '12345678'::public.document_number$$, 'Document domain accepts a normal document number');
select throws_ok($$select ''::public.document_number$$, '23514', null, 'Document domain rejects empty values');
select throws_ok($$select repeat('1', 33)::public.document_number$$, '23514', null, 'Document domain rejects excessive length');
select throws_ok($$insert into public.person (tenant_id, person_first_name, person_last_name, person_document_type)
  values ('10000000-0000-0000-0000-000000000001', 'Missing', 'Number', 'dni')$$,
  '23514', null, 'Document type requires a document number');
select throws_ok($$insert into public.person (tenant_id, person_first_name, person_last_name, person_document_number)
  values ('10000000-0000-0000-0000-000000000001', 'Missing', 'Type', '12345678')$$,
  '23514', null, 'Document number requires a document type');
select throws_ok($$insert into public.membership (tenant_id, person_id, membership_role, membership_valid_from, membership_valid_to)
  values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'guard', now(), now())$$,
  '23514', null, 'Membership validity cannot be an empty window');
select throws_ok($$insert into public.membership (tenant_id, person_id, membership_role, membership_valid_from, membership_valid_to)
  values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'guard', now(), now() - interval '1 second')$$,
  '23514', null, 'Membership validity cannot end before its start');
select throws_ok($$insert into public.membership_permission (tenant_id, membership_id, membership_permission_admin_permission)
  values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'registry')$$,
  '23505', null, 'A membership cannot receive the same permission twice');
select throws_ok($$update public.tenant set tenant_settings = '[]' where tenant_id = '10000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'Tenant settings must be a JSON object');
select throws_ok('update public.person set person_id=''90000000-0000-0000-0000-000000000099'' where person_id=''30000000-0000-0000-0000-000000000003''','23514',null,'person.person_id is immutable even for maintenance writes');
select throws_ok('update public.person set tenant_id=''10000000-0000-0000-0000-000000000002'' where person_id=''30000000-0000-0000-0000-000000000003''','23514',null,'person.tenant_id is immutable even for maintenance writes');
select throws_ok('update public.membership set membership_id=''90000000-0000-0000-0000-000000000099'' where membership_id=''40000000-0000-0000-0000-000000000003''','23514',null,'membership.membership_id is immutable even for maintenance writes');
select throws_ok('update public.membership set tenant_id=''10000000-0000-0000-0000-000000000002'' where membership_id=''40000000-0000-0000-0000-000000000003''','23514',null,'membership.tenant_id is immutable even for maintenance writes');
select throws_ok('update public.membership_permission set membership_permission_id=''90000000-0000-0000-0000-000000000099'' where membership_id=''40000000-0000-0000-0000-000000000002'' and membership_permission_admin_permission=''registry''','23514',null,'membership_permission.membership_permission_id is immutable even for maintenance writes');
select throws_ok('update public.membership_permission set tenant_id=''10000000-0000-0000-0000-000000000002'' where membership_id=''40000000-0000-0000-0000-000000000002'' and membership_permission_admin_permission=''registry''','23514',null,'membership_permission.tenant_id is immutable even for maintenance writes');
select throws_ok('update public.tenant set tenant_id=''10000000-0000-0000-0000-000000000002'' where tenant_id=''10000000-0000-0000-0000-000000000001''','23514',null,'tenant.tenant_id is immutable even for maintenance writes');
select throws_ok($$update public.membership set person_id='30000000-0000-0000-0000-000000000004' where membership_id='40000000-0000-0000-0000-000000000003'$$,'23514',null,'Membership person cannot be reassigned by server writes');
select throws_ok($$update public.membership_permission set membership_id='40000000-0000-0000-0000-000000000012' where membership_id='40000000-0000-0000-0000-000000000002' and membership_permission_admin_permission='registry'$$,'23514',null,'Permission membership cannot be reassigned by server writes');
select throws_ok($$insert into public.membership(tenant_id,person_id,membership_role) values('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006','guard')$$,'23503',null,'Composite membership FK rejects a cross-tenant person');
alter table public.membership_permission disable trigger validate_admin_permission;
select throws_ok($$insert into public.membership_permission(tenant_id,membership_id,membership_permission_admin_permission) values('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000006','registry')$$,'23503',null,'Composite permission FK independently rejects another tenant');
alter table public.membership_permission enable trigger validate_admin_permission;
select throws_ok($$insert into public.membership_permission(tenant_id,membership_id,membership_permission_admin_permission) values('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','registry')$$,'23514',null,'Only admin memberships may hold permissions');
select throws_ok($$update public.membership set membership_role='guard' where membership_id='40000000-0000-0000-0000-000000000002'$$,'23514',null,'Permissions must be removed before an admin role is downgraded');
select throws_ok($$insert into public.person(tenant_id,user_id,person_first_name,person_last_name) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Duplicate','User')$$,'23505',null,'Auth identity is unique within a tenant');
select throws_ok($$insert into public.person(tenant_id,person_first_name,person_last_name,person_document_type,person_document_number) values('10000000-0000-0000-0000-000000000001','Duplicate','Document','dni','90000002')$$,'23505',null,'Document identity is unique within a tenant');
select lives_ok($$insert into public.person(tenant_id,person_first_name,person_last_name,person_document_type,person_document_number) values('10000000-0000-0000-0000-000000000002','Same','Document','dni','90000002')$$,'Document identity can exist independently in another tenant');
select throws_ok($$select 'DNI'::public.person_document_type$$,'22P02',null,'Document enum prevents alternate-case identities');
select throws_ok($$select 'truncate'::public.audit_event_action$$,'22P02',null,'Audit action enum is constrained to insert update delete');

update public.membership set membership_valid_from = now() where membership_id = '40000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select ok(app_private.is_tenant_member('10000000-0000-0000-0000-000000000001'), 'Membership is active exactly at its lower bound');
reset role;
select * from finish();
rollback;
