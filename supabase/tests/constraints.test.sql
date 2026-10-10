begin;
select no_plan();
select lives_ok($$select '+54 381 555 0100'::public.phone_number$$, 'Phone domain accepts a normal phone number');
select throws_ok($$select ''::public.phone_number$$, '23514', null, 'Phone domain rejects empty values');
select throws_ok($$select repeat('1', 33)::public.phone_number$$, '23514', null, 'Phone domain rejects excessive length');
select lives_ok($$select '12345678'::public.document_number$$, 'Document domain accepts a normal document number');
select throws_ok($$select ''::public.document_number$$, '23514', null, 'Document domain rejects empty values');
select throws_ok($$select repeat('1', 33)::public.document_number$$, '23514', null, 'Document domain rejects excessive length');
select throws_ok($$insert into public.person (tenant_id, person_first_name, person_last_name, person_document_type)
  values ('10000000-0000-0000-0000-000000000001', 'Missing', 'Number', 'DNI')$$,
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
update public.membership set membership_valid_from = now() where membership_id = '40000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select ok(app_private.is_tenant_member('10000000-0000-0000-0000-000000000001'), 'Membership is active exactly at its lower bound');
reset role;
select * from finish();
rollback;
