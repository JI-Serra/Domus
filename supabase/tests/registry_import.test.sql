begin;
select no_plan();
create temp table import_fixture(key text primary key,value jsonb);
grant all on import_fixture to authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
insert into import_fixture values('rows','[
  {"unit_code":"Import A","unit_status":"occupied","person_first_name":"Import","person_last_name":"Holder","person_email":"import.holder@domus.local","unit_resident_is_holder":true},
  {"unit_code":"Import A","unit_status":"occupied","person_first_name":"Import","person_last_name":"Minor","person_document_type":"dni","person_document_number":"88770001","person_birth_date":"2015-01-01","unit_resident_is_minor":true},
  {"unit_code":"Import B","unit_status":"under_construction","unit_coefficient":2}
]'::jsonb);
insert into import_fixture values('batch',to_jsonb(public.create_registry_import('10000000-0000-0000-0000-000000000001',
  (select value from import_fixture where key='rows'),'f2000000-0000-4000-8000-000000000001')));
select is(to_jsonb(public.create_registry_import('10000000-0000-0000-0000-000000000001',(select value from import_fixture where key='rows'),
  'f2000000-0000-4000-8000-000000000001')),(select value from import_fixture where key='batch'),'Import creation is idempotent by event');
select is(public.preview_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from import_fixture where key='batch'))->'batch'->>'registry_import_error_count',
  '0','Valid preview has no errors');
select is((select count(*) from public.unit where unit_code='Import A'),0::bigint,'Preview applies no units');
select is(public.confirm_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from import_fixture where key='batch'),
  'f2000000-0000-4000-8000-000000000002'),'{"status":"confirmed","unit_count":2,"resident_count":2}'::jsonb,'Atomic confirmation applies batch');
select is((select count(*) from public.unit where unit_code like 'Import %'),2::bigint,'Import applied two units');
select is((select count(*) from public.unit_resident r join public.unit u using(tenant_id,unit_id) where u.unit_code='Import A'),2::bigint,'Import applied holder and minor');
select is((select count(*) from public.membership m join public.person p using(tenant_id,person_id) where p.person_email='import.holder@domus.local'),0::bigint,'Import never grants account access');
insert into import_fixture values('snapshot',jsonb_build_object(
  'units',(select jsonb_agg(to_jsonb(u) order by unit_id) from public.unit u),
  'people',(select jsonb_agg(to_jsonb(p) order by person_id) from public.person p),
  'residents',(select jsonb_agg(to_jsonb(r) order by unit_resident_id) from public.unit_resident r),
  'audit_count',(select count(*) from public.audit_event where audit_event_table_name in('unit','person','unit_resident'))));
insert into import_fixture values('repeat_batch',to_jsonb(public.create_registry_import('10000000-0000-0000-0000-000000000001',(select value from import_fixture where key='rows'),gen_random_uuid())));
select is(public.confirm_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from import_fixture where key='repeat_batch'),gen_random_uuid())->>'status',
  'confirmed','Second parsed file confirms');
select is(jsonb_build_object(
  'units',(select jsonb_agg(to_jsonb(u) order by unit_id) from public.unit u),
  'people',(select jsonb_agg(to_jsonb(p) order by person_id) from public.person p),
  'residents',(select jsonb_agg(to_jsonb(r) order by unit_resident_id) from public.unit_resident r),
  'audit_count',(select count(*) from public.audit_event where audit_event_table_name in('unit','person','unit_resident'))),
  (select value from import_fixture where key='snapshot'),'Natural-key re-import changes no row, timestamp or registry audit');
select is(public.confirm_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from import_fixture where key='batch'),
  'f2000000-0000-4000-8000-000000000002')->>'status','confirmed','Confirm retry returns receipt');
select is(public.confirm_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from import_fixture where key='batch'),gen_random_uuid())->>'status',
  'confirmed','Already confirmed batch never reapplies');
insert into import_fixture values('bad',to_jsonb(public.create_registry_import('10000000-0000-0000-0000-000000000001','[
 {"unit_code":"Bad occupied","unit_status":"occupied"},
 {"unit_code":"Bad person","person_first_name":"Only"},
 {"unit_code":"Bad coefficient","unit_coefficient":-1},
 {"unit_code":"Bad birthday","person_first_name":"Minor","person_last_name":"Holder","person_email":"b@domus.local","person_birth_date":"2015-01-01","unit_resident_is_holder":true},
 {"unit_code":"Bad unknown","user_id":"forbidden"},
 {"unit_code":"Bad type","unit_resident_is_holder":"true"},
 {"unit_code":"Conflict","unit_status":"vacant"},
 {"unit_code":"Conflict","unit_status":"under_construction"}
]'::jsonb,gen_random_uuid())));
select is(public.preview_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from import_fixture where key='bad'))->'batch'->>'registry_import_error_count','8','Per-row validation catches types, minor holders, unknown fields and conflicting units');
select is(public.confirm_registry_import('10000000-0000-0000-0000-000000000001',(select(value#>>'{}')::uuid from import_fixture where key='bad'),gen_random_uuid())->>'status','invalid','Invalid batch cannot apply');
select is((select count(*) from public.unit where unit_code like 'Bad %' or unit_code='Conflict'),0::bigint,'Invalid import is atomic with zero applied units');
select throws_ok($$select public.create_registry_import('10000000-0000-0000-0000-000000000002','[{"unit_code":"Foreign"}]',gen_random_uuid())$$,
  '42501','Registry management denied','Import creation tenant-bound');
select throws_ok($$select public.preview_registry_import('10000000-0000-0000-0000-000000000002',(select(value#>>'{}')::uuid from import_fixture where key='batch'))$$,
  '42501','Registry management denied','Import preview tenant-bound');
select throws_ok($$select public.confirm_registry_import('10000000-0000-0000-0000-000000000002',(select(value#>>'{}')::uuid from import_fixture where key='batch'),gen_random_uuid())$$,
  '42501','Registry management denied','Import confirmation tenant-bound');
select throws_ok($$select public.create_registry_import('10000000-0000-0000-0000-000000000001','[]',gen_random_uuid())$$,'22023','Invalid registry import','Empty batches rejected');
select throws_ok($$select public.create_registry_import('10000000-0000-0000-0000-000000000001','{}',gen_random_uuid())$$,'22023','Invalid registry import','Object batch rejected');
select throws_ok($$select public.create_registry_import('10000000-0000-0000-0000-000000000001',
  (select jsonb_agg(jsonb_build_object('unit_code','Too many '||n)) from generate_series(1,8001) n),gen_random_uuid())$$,'22023','Invalid registry import','Target envelope caps at 8000 rows');
select ok(not exists(select 1 from public.audit_event where audit_event_table_name='registry_import_row' and audit_event_diff::text like '%import.holder@domus.local%'),'Audit redacts staged row PII');
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.registry_import),0::bigint,'Holder cannot browse staged imports');
select throws_ok($$select public.create_registry_import('10000000-0000-0000-0000-000000000001','[{"unit_code":"Holder import"}]',gen_random_uuid())$$,
  '42501','Registry management denied','Holder cannot import registry');
reset role;
select * from finish();
rollback;
