begin;
select no_plan();
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0::bigint, 'Every public table has RLS enabled');
select is((select count(*) from information_schema.columns col
  where col.table_schema = 'public' and col.column_name = 'tenant_id'
  and not exists (select 1 from pg_policies p where p.schemaname = col.table_schema and p.tablename = col.table_name)),
  0::bigint, 'Every table with tenant_id has policies');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private' and p.proname in
    ('current_person_ids', 'is_tenant_member', 'has_tenant_role', 'has_admin_permission', 'is_platform_admin')
    and p.prosecdef and p.provolatile = 's' and p.proconfig @> array['search_path=""']),
  5::bigint, 'Authorization helpers are stable security definers with an empty search path');
select ok(not has_schema_privilege('anon', 'app_private', 'usage'), 'Anonymous users cannot access private helpers');
select ok(not has_function_privilege('authenticated', 'app_private.audit_row_change()', 'execute'),
  'Authenticated users cannot execute the audit trigger function');
select ok(not has_table_privilege('authenticated', 'public.audit_event', 'insert'), 'Clients cannot insert audit events');
select ok(not has_table_privilege('authenticated', 'public.audit_event', 'update'), 'Clients cannot update audit events');
select ok(not has_table_privilege('authenticated', 'public.audit_event', 'delete'), 'Clients cannot delete audit events');
select ok(not has_table_privilege('authenticated', 'public.audit_event', 'truncate'), 'Clients cannot truncate audit events');
select is((select count(*) from pg_policies where schemaname = 'public' and cmd = 'ALL'),
  0::bigint, 'Policies are separate per operation');
select is((select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and t.tgname = 'audit_row_change'),
  5::bigint, 'All sensitive H0 tables have audit triggers');
select is((select count(*) from pg_constraint fk
  join pg_class t on t.oid = fk.conrelid join pg_namespace ns on ns.oid = t.relnamespace
  where ns.nspname = 'public' and fk.contype = 'f' and not exists (
    select 1 from pg_index i where i.indrelid = fk.conrelid and i.indisvalid
      and (i.indkey::smallint[])[0:cardinality(fk.conkey)-1] @> fk.conkey)),
  0::bigint, 'Every foreign key has an index starting with its columns');
select * from finish();
rollback;
