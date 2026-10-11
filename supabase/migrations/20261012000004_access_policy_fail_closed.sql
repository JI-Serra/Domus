-- M03-F01: fail closed consumers and reuse shared audit masking.


create or replace function app_private.access_policy_snapshot(target_tenant_id uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object('access_policy_approval_timeout_seconds_count',p.access_policy_approval_timeout_seconds_count,
    'access_policy_permanent_authorization_max_days_count',p.access_policy_permanent_authorization_max_days_count,
    'access_policy_pass_max_uses_count',p.access_policy_pass_max_uses_count,'access_policy_pass_max_days_count',p.access_policy_pass_max_days_count,
    'access_policy_event_max_guests_count',p.access_policy_event_max_guests_count,'rules',
    (select jsonb_object_agg(r.access_policy_rule_visitor_type,to_jsonb(r)-array['access_policy_rule_id','tenant_id','access_policy_id','access_policy_rule_visitor_type'])
      from public.access_policy_rule r where r.tenant_id=target_tenant_id)) into result from public.access_policy p where p.tenant_id=target_tenant_id;
  if result is null or exists (
    select 1 from unnest(enum_range(null::public.visitor_type)) visitor
    where not coalesce(result->'rules' ? visitor::text,false)
  ) then
    raise exception 'Access policy unavailable' using errcode='55000';
  end if;
  return result;
end;
$$;

grant create on schema app_private to access_policy_writer;
set role access_policy_writer;

create or replace function app_private.policy_default_mode(target_tenant_id uuid,visitor public.visitor_type) returns public.household_access_mode
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id);
  if visitor is null then raise exception 'Access policy unavailable' using errcode='55000'; end if;
  perform app_private.access_policy_snapshot(target_tenant_id);
  return (select access_policy_rule_default_mode from public.access_policy_rule where tenant_id=target_tenant_id and access_policy_rule_visitor_type=visitor);
end;
$$;

create or replace function app_private.policy_requires_identity(target_tenant_id uuid,visitor public.visitor_type) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id);
  if visitor is null then raise exception 'Access policy unavailable' using errcode='55000'; end if;
  perform app_private.access_policy_snapshot(target_tenant_id);
  return (select access_policy_rule_is_identity_verification_required from public.access_policy_rule where tenant_id=target_tenant_id and access_policy_rule_visitor_type=visitor);
end;
$$;

create or replace function app_private.policy_limits(target_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id);
  perform app_private.access_policy_snapshot(target_tenant_id);
  return app_private.access_policy_snapshot(target_tenant_id)-array['rules','access_policy_approval_timeout_seconds_count'];
end;
$$;

create or replace function app_private.policy_approval_timeout(target_tenant_id uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id);
  perform app_private.access_policy_snapshot(target_tenant_id);
  return (select access_policy_approval_timeout_seconds_count from public.access_policy where tenant_id=target_tenant_id);
end;
$$;

reset role;
revoke create on schema app_private from access_policy_writer;

create function app_private.mask_audit_columns(data jsonb, redacted_columns text[]) returns jsonb
language plpgsql immutable set search_path='' as $$
declare column_name text;
begin
  if redacted_columns is null then
    raise exception 'Declare audit redaction before attaching a sensitive table' using errcode='23514';
  end if;
  foreach column_name in array redacted_columns loop
    if data ? column_name then data:=jsonb_set(data,array[column_name],'{"changed":true}'::jsonb); end if;
  end loop;
  return data;
end;
$$;
revoke all on function app_private.mask_audit_columns(jsonb,text[]) from public,anon,authenticated,service_role;
grant execute on function app_private.mask_audit_columns(jsonb,text[]) to audit_writer;
grant create on schema app_private to audit_writer;
set role audit_writer;

create or replace function app_private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_data jsonb; new_data jsonb; row_data jsonb; changes jsonb;
  target_tenant_id uuid; actor_user_id uuid := (select app_private.current_actor_user_id()); actor_person_id uuid;
  headers jsonb; redacted_columns text[]; redacted_column text;
  originating_role text := coalesce(nullif(nullif(current_setting('role', true), 'none'), ''), session_user);
  authorized boolean := false;
begin
  if tg_op <> 'INSERT' then old_data := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_data := to_jsonb(new); end if;
  row_data := coalesce(new_data, old_data);
  target_tenant_id := (row_data ->> 'tenant_id')::uuid;
  if originating_role in ('postgres', 'supabase_admin', 'service_role') then authorized := true;
  elsif originating_role = 'authenticated' then
    case tg_table_name
      when 'tenant' then authorized := (select app_private.is_platform_admin())
        or target_tenant_id in (select app_private.permission_tenant_ids('tenant_settings'));
      when 'platform_admin' then authorized := (select app_private.is_platform_admin());
      when 'person' then authorized := target_tenant_id in (select app_private.permission_tenant_ids('registry'));
      when 'membership' then authorized := (select app_private.is_platform_admin())
        or target_tenant_id in (select app_private.permission_tenant_ids('admin_management'))
        or target_tenant_id in (select app_private.permission_tenant_ids('registry'));
      when 'membership_permission' then authorized := (select app_private.is_platform_admin())
        or target_tenant_id in (select app_private.permission_tenant_ids('admin_management'));
      when 'invitation' then authorized := app_private.can_invite(target_tenant_id, (row_data->>'invitation_membership_role')::public.membership_role, array(select jsonb_array_elements_text(row_data->'invitation_admin_permissions'))::public.admin_permission[]);
      when 'support_session' then authorized := app_private.is_platform_admin() or app_private.current_support_session_id() = (row_data->>'support_session_id')::uuid;
      else authorized := false;
    end case;
  end if;
  if originating_role = 'authenticated' and tg_table_name = 'tenant' and tg_op = 'UPDATE'
    and (new_data -> 'tenant_slug' is distinct from old_data -> 'tenant_slug'
      or new_data -> 'tenant_subscription_status' is distinct from old_data -> 'tenant_subscription_status')
    and not (select app_private.is_platform_admin()) then authorized := false; end if;
  if not coalesce(authorized, false) then
    raise exception 'Audited write denied' using errcode = '42501';
  end if;
  redacted_columns := app_private.audit_redacted_columns(tg_table_name);
  if redacted_columns is null then
    raise exception 'Declare audit redaction before attaching a sensitive table' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', old_data -> n.key, 'new', n.value)), '{}'::jsonb)
      into changes from jsonb_each(new_data) n where n.value is distinct from old_data -> n.key;
    if changes = '{}'::jsonb then return new; end if;
  else changes := row_data;
  end if;
  changes := app_private.mask_audit_columns(changes, redacted_columns);
  select p.person_id into actor_person_id from public.person p
    where p.tenant_id = target_tenant_id and p.user_id = actor_user_id;
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when invalid_text_representation then headers := null;
  end;
  insert into public.audit_event (
    tenant_id, audit_event_actor_user_id, audit_event_actor_person_id, audit_event_db_role,
    audit_event_action, audit_event_table_name, audit_event_row_id, audit_event_diff,
    audit_event_request_ip, audit_event_request_device, audit_event_on_behalf_of_user_id, support_session_id
  ) values (
    target_tenant_id, actor_user_id, actor_person_id, originating_role,
    lower(tg_op)::public.audit_event_action, tg_table_name, (row_data ->> (tg_table_name || '_id'))::uuid, changes,
    left(nullif(btrim(split_part(headers ->> 'x-forwarded-for', ',', 1)), ''), 256),
    left(headers ->> 'x-device-id', 256),
    case when tg_table_name='support_session' then (row_data->>'support_session_target_user_id')::uuid when app_private.is_impersonating() then app_private.current_user_id() end, case when tg_table_name='support_session' then (row_data->>'support_session_id')::uuid else app_private.current_support_session_id() end
  );
  return coalesce(new, old);
end;
$$;

create or replace function app_private.audit_access_policy_row() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_data jsonb; after_data jsonb; data jsonb; target uuid; origin text:=coalesce(nullif(current_setting('role',true),'none'),session_user);
begin
  if tg_name<>'audit_row_change' or tg_table_name not in('access_policy','access_policy_rule') then raise exception 'Audited write denied' using errcode='42501'; end if;
  if tg_op<>'INSERT' then before_data:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then after_data:=to_jsonb(new); end if;
  data:=coalesce(after_data,before_data); target:=(data->>'tenant_id')::uuid;
  if origin not in('postgres','supabase_admin') and (origin<>'authenticated' or not app_private.current_identity_is_valid()
    or (target not in(select app_private.writable_permission_tenant_ids('access_config')) and not app_private.is_platform_admin())) then
    raise exception 'Audited write denied' using errcode='42501'; end if;
  if app_private.audit_redacted_columns(tg_table_name) is null then raise exception 'Declare audit redaction' using errcode='23514'; end if;
  if before_data is not distinct from after_data then return coalesce(new,old); end if;
  before_data:=app_private.mask_audit_columns(before_data,app_private.audit_redacted_columns(tg_table_name));
  after_data:=app_private.mask_audit_columns(after_data,app_private.audit_redacted_columns(tg_table_name));
  insert into public.audit_event(tenant_id,audit_event_actor_user_id,audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff,
    audit_event_on_behalf_of_user_id,support_session_id)
  values(target,app_private.current_actor_user_id(),origin,lower(tg_op)::public.audit_event_action,tg_table_name,(data->>(tg_table_name||'_id'))::uuid,
    jsonb_build_object('before',before_data,'after',after_data),case when app_private.is_impersonating() then app_private.current_user_id() end,app_private.current_support_session_id());
  return coalesce(new,old);
end;
$$;

reset role;
revoke create on schema app_private from audit_writer;

create or replace function app_private.validate_access_policy_completeness() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(new.tenant_id,old.tenant_id); origin text:=coalesce(nullif(current_setting('role',true),'none'),session_user);
begin
  if origin='authenticated' and not app_private.is_platform_admin() then perform app_private.require_access_policy(target,true,true);
  elsif origin not in('postgres','supabase_admin','authenticated') then raise exception 'Access policy denied' using errcode='42501'; end if;
  if exists(select 1 from public.tenant where tenant_id=target)
    and (not exists(select 1 from public.access_policy where tenant_id=target)
      or (select count(*) from public.access_policy_rule where tenant_id=target)<>cardinality(enum_range(null::public.visitor_type))) then
    raise exception 'Policy requires all visitor types' using errcode='23514'; end if;
  return null;
end;
$$;

-- I1: capability reads only the aggregate events needed by the history RPC.
alter policy "policy writer can read configuration history" on public.audit_event
  using (audit_event_table_name='access_policy_change');
