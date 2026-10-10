-- Local-only, rolled-back 2,000-unit / 6,000-resident acceptance and EXPLAIN evidence.
\set ON_ERROR_STOP on
\timing on
begin;
create temp table registry_performance(rows jsonb,batch_id uuid,unit_id uuid);
grant select,update on registry_performance to authenticated;
insert into registry_performance(rows)
select jsonb_agg(jsonb_build_object('unit_code','Scale '||n,'unit_status','occupied',
  'person_first_name','Scale','person_last_name','Resident '||n||' '||r,'person_document_type','dni',
  'person_document_number',(85000000+n*3+r)::text,'person_email','scale.'||n||'.'||r||'@domus.local',
  'unit_resident_relationship',case when r=0 then 'owner' else 'family' end,'unit_resident_is_holder',r=0,'unit_resident_is_minor',r=2)
  order by n,r) from generate_series(1,2000) n cross join generate_series(0,2) r;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
update registry_performance set batch_id=public.create_registry_import('10000000-0000-0000-0000-000000000001',rows,gen_random_uuid());
select public.confirm_registry_import('10000000-0000-0000-0000-000000000001',batch_id,gen_random_uuid()) from registry_performance;
set constraints all immediate;
set constraints all deferred;
update registry_performance p set unit_id=u.unit_id from public.unit u where u.tenant_id='10000000-0000-0000-0000-000000000001' and u.unit_code='Scale 1000';
reset role;
analyze public.unit;
analyze public.person;
analyze public.unit_resident;
analyze public.vehicle;
set local role authenticated;
explain(analyze,buffers) select * from public.search_registry('10000000-0000-0000-0000-000000000001','Scale 1000');
explain(analyze,buffers) select * from public.search_registry('10000000-0000-0000-0000-000000000001','Scale');
explain(analyze,buffers) select public.unit_sheet('10000000-0000-0000-0000-000000000001',unit_id) from registry_performance;
-- Exact search predicate and sheet-resident join, with ordinary admin RLS, to show the chosen indexes.
explain(analyze,buffers) select unit_id,unit_code from public.unit where tenant_id='10000000-0000-0000-0000-000000000001' and unit_code ilike '%Scale 1000%';
explain(analyze,buffers) select r.unit_resident_id,p.person_first_name,p.person_last_name from public.unit_resident r
  join public.person p using(tenant_id,person_id) where r.tenant_id='10000000-0000-0000-0000-000000000001' and r.unit_id=(select unit_id from registry_performance);
rollback;
