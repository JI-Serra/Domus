begin;
select no_plan();
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity),0::bigint,'Every public table has RLS');
select is((select count(*) from information_schema.columns c where c.table_schema='public' and c.column_name='tenant_id'
  and not exists(select 1 from pg_policies p where p.schemaname=c.table_schema and p.tablename=c.table_name)),0::bigint,'Every tenant table has policies');
select is((select count(*) from pg_policies p where p.schemaname='public'
  and exists(select 1 from information_schema.columns c where c.table_schema=p.schemaname and c.table_name=p.tablename and c.column_name='tenant_id')
  and p.roles && array['authenticated','anon']::name[]
  and coalesce(p.qual,'')||coalesce(p.with_check,'') !~ '(app_private[.]|tenant_id)'),0::bigint,'Every client tenant policy references a verified helper or tenant key');
select is((select count(*) from pg_policies p where p.schemaname='public'
  and coalesce(p.qual,'')||coalesce(p.with_check,'') ~ 'app_private[.][a-z_]+[(]tenant_id'),0::bigint,'No policy invokes an authorization helper per row');
select is((select count(*) from pg_constraint fk join pg_class t on t.oid=fk.conrelid
  join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public' and fk.contype='f'
  and not exists(select 1 from pg_index i where i.indrelid=fk.conrelid and i.indisvalid
    and array(select unnest((i.indkey::smallint[])[0:cardinality(fk.conkey)-1]))=fk.conkey)),0::bigint,'Every FK index starts with the exact ordered FK columns');
select is((select count(*) from information_schema.columns c where c.table_schema='public' and c.column_name='tenant_id'
  and not exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
    where i.indrelid=format('%I.%I',c.table_schema,c.table_name)::regclass and a.attname='tenant_id' and i.indisvalid)),0::bigint,'Every tenant key has a leading index');

select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('app_private','public')
  and p.prosecdef and not (p.proconfig @> array['search_path=""'])),0::bigint,'Every security definer has an empty fixed search path');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private'
  and p.proname in ('current_person_ids','own_membership_ids','member_tenant_ids','role_tenant_ids','permission_tenant_ids','is_tenant_member','has_tenant_role','has_admin_permission','is_platform_admin','current_actor_user_id')
  and p.prosecdef and p.provolatile='s'),10::bigint,'All identity and tenant-set helpers are stable security definers');
select is((select count(*) from pg_proc p where p.pronamespace='app_private'::regnamespace and p.proacl is null),0::bigint,'Every private function has explicit ACLs');
select is((select count(*) from pg_proc p cross join lateral aclexplode(p.proacl) acl
  where p.pronamespace='app_private'::regnamespace and acl.grantee=0 and acl.privilege_type='EXECUTE'),0::bigint,'PUBLIC has no private function execute');
select is((select count(*) from pg_proc p where p.pronamespace='app_private'::regnamespace
  and has_function_privilege('authenticated',p.oid,'EXECUTE')
  and p.proname not in ('current_person_ids','own_membership_ids','member_tenant_ids','role_tenant_ids','permission_tenant_ids','is_tenant_member','has_tenant_role','has_admin_permission','is_platform_admin','current_user_id','current_identity_is_valid','current_support_session_id','is_impersonating','identity_tenant_ids','writable_tenant_ids','tenant_allows_writes','writable_permission_tenant_ids','holder_unit_ids','household_unit_ids','household_permission_unit_ids','household_storage_paths','valid_registry_storage_path')),0::bigint,'Authenticated execute uses the exact private helper allowlist');
create function app_private.default_privilege_probe() returns integer language sql as $$select 1$$;
select ok(not has_function_privilege('authenticated','app_private.default_privilege_probe()','execute'),'New private functions do not inherit PUBLIC execute');
select ok(not has_function_privilege('anon','app_private.default_privilege_probe()','execute'),'New private functions are inaccessible to anon');
select ok(not has_schema_privilege('anon','app_private','usage'),'Anon cannot access private schema');
select is((select count(*) from pg_proc p cross join lateral aclexplode(p.proacl) acl
  where p.pronamespace='public'::regnamespace and acl.grantee=0 and acl.privilege_type='EXECUTE'),0::bigint,'PUBLIC cannot execute exposed RPCs');

select is((select count(*) from pg_policies where schemaname='public' and cmd='ALL'),0::bigint,'All policies are separate per operation');
select is((select count(*) from pg_policies where schemaname='public' and tablename in ('person','membership','membership_permission')
  and roles @> array['authenticated']::name[] and (coalesce(qual,'')||coalesce(with_check,'')) like '%is_platform_admin%'),0::bigint,'No standing platform policy exposes tenant registry data');
select is((select count(*) from pg_policies where schemaname='public' and tablename in ('platform_admin','membership','membership_permission') and roles && array['authenticated','anon']::name[] and cmd in ('INSERT','UPDATE','DELETE')),0::bigint,'Role and permission tables have no client write policies');
select is((select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and t.tgname='audit_row_change'),22::bigint,'All sensitive tables are audited');
select is((select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and t.tgname in ('audit_row_change','protect_audit_event','protect_audit_event_truncate') and t.tgenabled<>'A'),0::bigint,'Audit triggers are enabled always');
select is((select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and t.tgname='audit_row_change' and app_private.audit_redacted_columns(c.relname) is null),0::bigint,'Every audited table declares redaction columns');
select is((select p.proowner::regrole::text from pg_proc p where p.oid='app_private.audit_row_change()'::regprocedure),'audit_writer','Audit capture is owned by dedicated writer');
select is((select p.proowner::regrole::text from pg_proc p where p.oid='app_private.purge_audit_events(timestamptz)'::regprocedure),'audit_purger','Retention function is owned by dedicated purger');
select ok(not has_schema_privilege('audit_writer','app_private','create'),'Audit writer cannot create arbitrary functions');
select ok(not has_schema_privilege('audit_purger','app_private','create'),'Audit purger cannot create arbitrary functions');
select is((select count(*) from pg_roles where rolname in ('audit_writer','audit_purger')
  and (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)),0::bigint,
  'Dedicated audit roles have no elevated cluster or RLS bypass capabilities');
select ok(not pg_has_role('anon','audit_writer','MEMBER'),'anon cannot assume audit_writer');
select ok(not pg_has_role('anon','audit_purger','MEMBER'),'anon cannot assume audit_purger');
select ok(not has_function_privilege('anon','app_private.purge_audit_events(timestamptz)','execute'),'anon cannot execute retention');
select ok(not pg_has_role('authenticated','audit_writer','MEMBER'),'authenticated cannot assume audit_writer');
select ok(not pg_has_role('authenticated','audit_purger','MEMBER'),'authenticated cannot assume audit_purger');
select ok(not has_function_privilege('authenticated','app_private.purge_audit_events(timestamptz)','execute'),'authenticated cannot execute retention');
select ok(not pg_has_role('service_role','audit_writer','MEMBER'),'service_role cannot assume audit_writer');
select ok(not pg_has_role('service_role','audit_purger','MEMBER'),'service_role cannot assume audit_purger');
select ok(not has_function_privilege('service_role','app_private.purge_audit_events(timestamptz)','execute'),'service_role cannot execute retention');
select ok((select not rolcanlogin and not rolinherit from pg_roles where rolname='audit_writer'),'audit_writer is NOLOGIN and NOINHERIT');
select ok((select not rolcanlogin and not rolinherit from pg_roles where rolname='audit_purger'),'audit_purger is NOLOGIN and NOINHERIT');
select ok(not has_table_privilege('service_role','public.tenant','TRUNCATE'),'Server role lacks TRUNCATE on tenant');
select ok(not has_table_privilege('service_role','public.tenant','TRIGGER'),'Server role lacks TRIGGER on tenant');
select ok(not has_table_privilege('service_role','public.tenant','REFERENCES'),'Server role lacks REFERENCES on tenant');
select ok(not has_table_privilege('service_role','public.platform_admin','TRUNCATE'),'Server role lacks TRUNCATE on platform_admin');
select ok(not has_table_privilege('service_role','public.platform_admin','TRIGGER'),'Server role lacks TRIGGER on platform_admin');
select ok(not has_table_privilege('service_role','public.platform_admin','REFERENCES'),'Server role lacks REFERENCES on platform_admin');
select ok(not has_table_privilege('service_role','public.person','TRUNCATE'),'Server role lacks TRUNCATE on person');
select ok(not has_table_privilege('service_role','public.person','TRIGGER'),'Server role lacks TRIGGER on person');
select ok(not has_table_privilege('service_role','public.person','REFERENCES'),'Server role lacks REFERENCES on person');
select ok(not has_table_privilege('service_role','public.membership','TRUNCATE'),'Server role lacks TRUNCATE on membership');
select ok(not has_table_privilege('service_role','public.membership','TRIGGER'),'Server role lacks TRIGGER on membership');
select ok(not has_table_privilege('service_role','public.membership','REFERENCES'),'Server role lacks REFERENCES on membership');
select ok(not has_table_privilege('service_role','public.membership_permission','TRUNCATE'),'Server role lacks TRUNCATE on membership_permission');
select ok(not has_table_privilege('service_role','public.membership_permission','TRIGGER'),'Server role lacks TRIGGER on membership_permission');
select ok(not has_table_privilege('service_role','public.membership_permission','REFERENCES'),'Server role lacks REFERENCES on membership_permission');
select ok(not has_table_privilege('authenticated','public.membership','INSERT'),'Clients lack INSERT on membership');
select ok(not has_table_privilege('authenticated','public.platform_admin','INSERT'),'Clients lack INSERT on platform_admin');
select ok(not has_table_privilege('authenticated','public.platform_admin','UPDATE'),'Clients lack UPDATE on platform_admin');
select ok(not has_table_privilege('authenticated','public.platform_admin','DELETE'),'Clients lack DELETE on platform_admin');
select ok(not has_table_privilege('authenticated','public.membership','UPDATE'),'Clients lack UPDATE on membership');
select ok(not has_table_privilege('authenticated','public.membership','DELETE'),'Clients lack DELETE on membership');
select ok(not has_table_privilege('authenticated','public.membership_permission','INSERT'),'Clients lack INSERT on membership_permission');
select ok(not has_table_privilege('authenticated','public.membership_permission','UPDATE'),'Clients lack UPDATE on membership_permission');
select ok(not has_table_privilege('authenticated','public.membership_permission','DELETE'),'Clients lack DELETE on membership_permission');
select ok(not has_table_privilege('authenticated','public.audit_event','INSERT'),'Clients lack INSERT on audit_event');
select ok(not has_table_privilege('authenticated','public.audit_event','UPDATE'),'Clients lack UPDATE on audit_event');
select ok(not has_table_privilege('authenticated','public.audit_event','DELETE'),'Clients lack DELETE on audit_event');
select ok(not has_column_privilege('authenticated','public.tenant','tenant_slug','UPDATE'),'Clients cannot directly update tenant_slug');
select ok(not has_column_privilege('authenticated','public.tenant','tenant_subscription_status','UPDATE'),'Clients cannot directly update tenant_subscription_status');
select ok(not has_column_privilege('authenticated','public.tenant','tenant_id','UPDATE'),'Clients cannot directly update tenant_id');
select ok(not has_column_privilege('authenticated','public.tenant','tenant_created_at','UPDATE'),'Clients cannot directly update tenant_created_at');
select ok(not has_column_privilege('authenticated','public.tenant','tenant_updated_at','UPDATE'),'Clients cannot directly update tenant_updated_at');
select ok(not has_column_privilege('authenticated','public.person','user_id','INSERT'),'Clients lack INSERT on person.user_id');
select ok(not has_column_privilege('authenticated','public.person','user_id','UPDATE'),'Clients lack UPDATE on person.user_id');
-- M1 (T10 review): functions are only ever written as complete definitions. No applied migration may derive a
-- function body from the catalog or patch source text and execute it.
select is((select count(*) from supabase_migrations.schema_migrations m cross join unnest(m.statements) statement
  where statement ~* '(pg_get_functiondef|prosrc)'),0::bigint,'No migration reads function source from the catalog');
select is((select count(*) from supabase_migrations.schema_migrations m cross join unnest(m.statements) statement
  where statement ~* 'replace\s*\(\s*(body|definition|source|function_body)\M'),0::bigint,'No migration rewrites function source with replace()');
select is((select count(*) from supabase_migrations.schema_migrations m cross join unnest(m.statements) statement
  where statement ~* 'execute\s+[a-z_]*(body|definition)\M'),0::bigint,'No migration executes generated function source');
select * from finish();
rollback;

