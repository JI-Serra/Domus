-- M03-F01/F04: RPC-only configuration, server constraints and isolated capability.
create type public.visitor_type as enum ('permanent_authorized','recurring_authorized','pass_guest','event_guest','delivery','service_worker','unknown');
create type public.household_access_mode as enum ('direct_entry','notify','approval','reject');
create type public.access_policy_template as enum ('balanced','strict','flexible');
do $$ begin
  if not exists(select 1 from pg_roles where rolname='access_policy_writer') then create role access_policy_writer nologin noinherit; end if;
end $$;
grant access_policy_writer to postgres with inherit false, set true;
grant usage on schema public,app_private,extensions to access_policy_writer;
grant execute on function app_private.current_identity_is_valid(),app_private.current_user_id(),app_private.current_actor_user_id(),
  app_private.current_support_session_id(),app_private.is_impersonating(),app_private.is_platform_admin(),app_private.member_tenant_ids(),
  app_private.permission_tenant_ids(public.admin_permission),app_private.writable_permission_tenant_ids(public.admin_permission) to access_policy_writer;

create function app_private.access_policy_modes_are_valid(visitor public.visitor_type, modes public.household_access_mode[], default_mode public.household_access_mode) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(cardinality(modes) between 1 and 4 and array_ndims(modes)=1 and array_position(modes,null) is null
    and cardinality(modes)=(select count(distinct mode) from unnest(modes) mode)
    and default_mode=any(modes) and (visitor<>'unknown' or modes <@ array['approval','reject']::public.household_access_mode[]),false);
$$;
revoke all on function app_private.access_policy_modes_are_valid(public.visitor_type,public.household_access_mode[],public.household_access_mode) from public,anon,authenticated,service_role;
grant execute on function app_private.access_policy_modes_are_valid(public.visitor_type,public.household_access_mode[],public.household_access_mode) to access_policy_writer;

create table public.access_policy (
  access_policy_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant(tenant_id) on delete cascade,
  access_policy_approval_timeout_seconds_count integer not null,
  access_policy_permanent_authorization_max_days_count integer not null,
  access_policy_pass_max_uses_count integer not null,
  access_policy_pass_max_days_count integer not null,
  access_policy_event_max_guests_count integer not null,
  access_policy_applied_template public.access_policy_template,
  access_policy_updated_by_user_id uuid references auth.users(id),
  access_policy_updated_at timestamptz not null default statement_timestamp(),
  constraint access_policy_tenant_id_key unique(tenant_id),
  constraint access_policy_tenant_id_access_policy_id_key unique(tenant_id,access_policy_id),
  constraint access_policy_timeout_check check(access_policy_approval_timeout_seconds_count between 30 and 300),
  constraint access_policy_permanent_days_check check(access_policy_permanent_authorization_max_days_count between 1 and 3650),
  constraint access_policy_pass_uses_check check(access_policy_pass_max_uses_count between 1 and 100),
  constraint access_policy_pass_days_check check(access_policy_pass_max_days_count between 1 and 365),
  constraint access_policy_event_guests_check check(access_policy_event_max_guests_count between 1 and 1000)
);
create index access_policy_updated_by_user_id_idx on public.access_policy(access_policy_updated_by_user_id);
create table public.access_policy_rule (
  access_policy_rule_id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  access_policy_id uuid not null,
  access_policy_rule_visitor_type public.visitor_type not null,
  access_policy_rule_allowed_modes public.household_access_mode[] not null,
  access_policy_rule_default_mode public.household_access_mode not null,
  access_policy_rule_is_identity_verification_required boolean not null,
  constraint access_policy_rule_tenant_id_access_policy_id_fkey foreign key(tenant_id,access_policy_id) references public.access_policy(tenant_id,access_policy_id) on delete cascade,
  constraint access_policy_rule_tenant_id_visitor_type_key unique(tenant_id,access_policy_rule_visitor_type),
  constraint access_policy_rule_modes_check check(app_private.access_policy_modes_are_valid(access_policy_rule_visitor_type,access_policy_rule_allowed_modes,access_policy_rule_default_mode))
);
create index access_policy_rule_tenant_id_access_policy_id_idx on public.access_policy_rule(tenant_id,access_policy_id);
create table app_private.access_policy_operation (
  client_event_id uuid primary key, tenant_id uuid not null references public.tenant(tenant_id) on delete cascade,
  access_policy_operation_actor_user_id uuid not null references auth.users(id),
  support_session_id uuid references public.support_session(support_session_id),
  access_policy_operation_name text not null,
  access_policy_operation_input jsonb not null,
  access_policy_operation_result jsonb not null
);
create index access_policy_operation_tenant_id_idx on app_private.access_policy_operation(tenant_id);
create index access_policy_operation_actor_user_id_idx on app_private.access_policy_operation(access_policy_operation_actor_user_id);
create index access_policy_operation_support_session_id_idx on app_private.access_policy_operation(support_session_id);
alter table app_private.access_policy_operation enable row level security;
revoke all on app_private.access_policy_operation from public,anon,authenticated,service_role;
grant select,insert on app_private.access_policy_operation to access_policy_writer;
create policy "policy writer can read retry receipts" on app_private.access_policy_operation for select to access_policy_writer using(true);
create policy "policy writer can append retry receipts" on app_private.access_policy_operation for insert to access_policy_writer with check(true);
do $$ declare t text; begin
  foreach t in array array['access_policy','access_policy_rule'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant select,insert,update on public.%I to access_policy_writer',t);
    execute format('create policy "access config admins can read policy tables" on public.%I for select to authenticated using(tenant_id in(select app_private.permission_tenant_ids(''access_config'')))',t);
    execute format('create policy "policy writer can read configuration" on public.%I for select to access_policy_writer using(true)',t);
    execute format('create policy "policy writer can create configuration" on public.%I for insert to access_policy_writer with check(true)',t);
    execute format('create policy "policy writer can update configuration" on public.%I for update to access_policy_writer using(true) with check(true)',t);
  end loop;
end $$;
comment on table public.access_policy is 'Audit redaction: none. Configuration is replaced through authorized RPCs only.';
comment on table public.access_policy_rule is 'Audit redaction: none. Exactly one rule per visitor type per tenant.';

create function app_private.require_access_policy(target_tenant_id uuid, writing boolean default false, admin_only boolean default false) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if target_tenant_id is null or not app_private.current_identity_is_valid()
    or (writing and target_tenant_id not in(select app_private.writable_permission_tenant_ids('access_config')))
    or (admin_only and target_tenant_id not in(select app_private.permission_tenant_ids('access_config')))
    or (not writing and not admin_only and target_tenant_id not in(select app_private.member_tenant_ids())) then
    raise exception 'Access policy denied' using errcode='42501'; end if;
end;
$$;
create function app_private.enforce_access_policy_writes() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in('postgres','supabase_admin') and coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then return coalesce(new,old); end if;
  -- Platform tenant creation initializes policy in the same transaction; no client DML is granted.
  if current_user='postgres' and app_private.is_platform_admin() and tg_op in('INSERT','DELETE') then return coalesce(new,old); end if;
  if current_user<>'access_policy_writer' then raise exception 'Access policy denied' using errcode='42501'; end if;
  perform app_private.require_access_policy(coalesce(new.tenant_id,old.tenant_id),true,true);
  if tg_op='UPDATE' and (new.tenant_id<>old.tenant_id or to_jsonb(new)->(tg_table_name||'_id') is distinct from to_jsonb(old)->(tg_table_name||'_id')
    or (tg_table_name='access_policy_rule' and (to_jsonb(new)->'access_policy_id' is distinct from to_jsonb(old)->'access_policy_id'
      or to_jsonb(new)->'access_policy_rule_visitor_type' is distinct from to_jsonb(old)->'access_policy_rule_visitor_type'))) then
    raise exception 'Policy identity cannot change' using errcode='23514'; end if;
  return coalesce(new,old);
end;
$$;
-- Deferrable completeness permits atomic initialization and whole-policy changes, including owner SQL.
create function app_private.validate_access_policy_completeness() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(new.tenant_id,old.tenant_id); origin text:=coalesce(nullif(current_setting('role',true),'none'),session_user);
begin
  if origin='authenticated' and not app_private.is_platform_admin() then perform app_private.require_access_policy(target,true,true);
  elsif origin not in('postgres','supabase_admin','authenticated') then raise exception 'Access policy denied' using errcode='42501'; end if;
  if exists(select 1 from public.access_policy where tenant_id=target)
    and (select count(*) from public.access_policy_rule where tenant_id=target)<>7 then
    raise exception 'Policy requires all visitor types' using errcode='23514'; end if;
  return null;
end;
$$;
do $$ declare t text; begin
  foreach t in array array['access_policy','access_policy_rule'] loop
    execute format('create trigger enforce_access_policy_writes before insert or update or delete on public.%I for each row execute function app_private.enforce_access_policy_writes()',t);
    execute format('alter table public.%I enable always trigger enforce_access_policy_writes',t);
    execute format('create constraint trigger validate_access_policy_completeness after insert or update or delete on public.%I deferrable initially deferred for each row execute function app_private.validate_access_policy_completeness()',t);
    execute format('alter table public.%I enable always trigger validate_access_policy_completeness',t);
  end loop;
end $$;
revoke all on function app_private.require_access_policy(uuid,boolean,boolean),app_private.enforce_access_policy_writes(),app_private.validate_access_policy_completeness() from public,anon,authenticated,service_role;
grant execute on function app_private.require_access_policy(uuid,boolean,boolean),app_private.enforce_access_policy_writes(),app_private.validate_access_policy_completeness() to access_policy_writer;
