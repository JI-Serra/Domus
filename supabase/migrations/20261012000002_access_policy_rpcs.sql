-- M03-F01/F06: strict replacement validator, safe projections and atomic retries.
create function app_private.validate_access_policy(policy jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare key text; rule jsonb; visitor text; modes public.household_access_mode[]; value numeric;
begin
  if policy is null or jsonb_typeof(policy)<>'object' or (select count(*) from jsonb_object_keys(policy))<>6
    or not policy ?& array['access_policy_approval_timeout_seconds_count','access_policy_permanent_authorization_max_days_count','access_policy_pass_max_uses_count','access_policy_pass_max_days_count','access_policy_event_max_guests_count','rules'] then
    raise exception 'Invalid access policy' using errcode='22023'; end if;
  foreach key in array array['access_policy_approval_timeout_seconds_count','access_policy_permanent_authorization_max_days_count','access_policy_pass_max_uses_count','access_policy_pass_max_days_count','access_policy_event_max_guests_count'] loop
    if jsonb_typeof(policy->key)<>'number' then raise exception 'Invalid access policy' using errcode='22023'; end if;
    value:=(policy->>key)::numeric;
    if value<>trunc(value) or value < (case when key='access_policy_approval_timeout_seconds_count' then 30 else 1 end)
      or value > (case key when 'access_policy_approval_timeout_seconds_count' then 300 when 'access_policy_permanent_authorization_max_days_count' then 3650
        when 'access_policy_pass_max_uses_count' then 100 when 'access_policy_pass_max_days_count' then 365 else 1000 end) then
      raise exception 'Invalid access policy' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(policy->'rules')<>'object' or (select count(*) from jsonb_object_keys(policy->'rules'))<>7 then raise exception 'Invalid access policy' using errcode='22023'; end if;
  foreach visitor in array enum_range(null::public.visitor_type)::text[] loop
    rule:=policy->'rules'->visitor;
    if rule is null or jsonb_typeof(rule)<>'object' or (select count(*) from jsonb_object_keys(rule))<>3
      or not rule ?& array['access_policy_rule_allowed_modes','access_policy_rule_default_mode','access_policy_rule_is_identity_verification_required']
      or jsonb_typeof(rule->'access_policy_rule_allowed_modes')<>'array'
      or jsonb_typeof(rule->'access_policy_rule_default_mode')<>'string'
      or jsonb_typeof(rule->'access_policy_rule_is_identity_verification_required')<>'boolean' then raise exception 'Invalid access policy' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(rule->'access_policy_rule_allowed_modes') v where jsonb_typeof(v)<>'string') then raise exception 'Invalid access policy' using errcode='22023'; end if;
    modes:=array(select jsonb_array_elements_text(rule->'access_policy_rule_allowed_modes'))::public.household_access_mode[];
    if not app_private.access_policy_modes_are_valid(visitor::public.visitor_type,modes,(rule->>'access_policy_rule_default_mode')::public.household_access_mode) then raise exception 'Invalid access policy' using errcode='22023'; end if;
  end loop;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid access policy' using errcode='22023';
end;
$$;

create function app_private.access_policy_snapshot(target_tenant_id uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('access_policy_approval_timeout_seconds_count',p.access_policy_approval_timeout_seconds_count,
    'access_policy_permanent_authorization_max_days_count',p.access_policy_permanent_authorization_max_days_count,
    'access_policy_pass_max_uses_count',p.access_policy_pass_max_uses_count,'access_policy_pass_max_days_count',p.access_policy_pass_max_days_count,
    'access_policy_event_max_guests_count',p.access_policy_event_max_guests_count,'rules',
    (select jsonb_object_agg(r.access_policy_rule_visitor_type,to_jsonb(r)-array['access_policy_rule_id','tenant_id','access_policy_id','access_policy_rule_visitor_type'])
      from public.access_policy_rule r where r.tenant_id=target_tenant_id)) from public.access_policy p where p.tenant_id=target_tenant_id;
$$;
create function app_private.replace_access_policy(target_tenant_id uuid,policy jsonb,template public.access_policy_template) returns void
language plpgsql set search_path='' as $$
declare policy_id uuid; rule record;
begin
  perform app_private.validate_access_policy(policy);
  insert into public.access_policy(tenant_id,access_policy_approval_timeout_seconds_count,access_policy_permanent_authorization_max_days_count,
    access_policy_pass_max_uses_count,access_policy_pass_max_days_count,access_policy_event_max_guests_count,access_policy_applied_template,access_policy_updated_by_user_id)
  values(target_tenant_id,(policy->>'access_policy_approval_timeout_seconds_count')::integer,(policy->>'access_policy_permanent_authorization_max_days_count')::integer,
    (policy->>'access_policy_pass_max_uses_count')::integer,(policy->>'access_policy_pass_max_days_count')::integer,(policy->>'access_policy_event_max_guests_count')::integer,template,app_private.current_actor_user_id())
  on conflict(tenant_id) do update set access_policy_approval_timeout_seconds_count=excluded.access_policy_approval_timeout_seconds_count,
    access_policy_permanent_authorization_max_days_count=excluded.access_policy_permanent_authorization_max_days_count,
    access_policy_pass_max_uses_count=excluded.access_policy_pass_max_uses_count,access_policy_pass_max_days_count=excluded.access_policy_pass_max_days_count,
    access_policy_event_max_guests_count=excluded.access_policy_event_max_guests_count,access_policy_applied_template=excluded.access_policy_applied_template,
    access_policy_updated_by_user_id=excluded.access_policy_updated_by_user_id,access_policy_updated_at=statement_timestamp()
  returning access_policy_id into policy_id;
  for rule in select * from jsonb_each(policy->'rules') loop
    insert into public.access_policy_rule(tenant_id,access_policy_id,access_policy_rule_visitor_type,access_policy_rule_allowed_modes,access_policy_rule_default_mode,access_policy_rule_is_identity_verification_required)
      values(target_tenant_id,policy_id,rule.key::public.visitor_type,array(select jsonb_array_elements_text(rule.value->'access_policy_rule_allowed_modes'))::public.household_access_mode[],
        (rule.value->>'access_policy_rule_default_mode')::public.household_access_mode,(rule.value->>'access_policy_rule_is_identity_verification_required')::boolean)
    on conflict(tenant_id,access_policy_rule_visitor_type) do update set access_policy_rule_allowed_modes=excluded.access_policy_rule_allowed_modes,
      access_policy_rule_default_mode=excluded.access_policy_rule_default_mode,access_policy_rule_is_identity_verification_required=excluded.access_policy_rule_is_identity_verification_required
    where (access_policy_rule.access_policy_rule_allowed_modes,access_policy_rule.access_policy_rule_default_mode,access_policy_rule.access_policy_rule_is_identity_verification_required)
      is distinct from (excluded.access_policy_rule_allowed_modes,excluded.access_policy_rule_default_mode,excluded.access_policy_rule_is_identity_verification_required);
  end loop;
end;
$$;
-- Row and aggregate audit events both use the append-only audit writer.
grant create on schema app_private to audit_writer;
set role audit_writer;
create function app_private.audit_access_policy_row() returns trigger
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
  insert into public.audit_event(tenant_id,audit_event_actor_user_id,audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff,
    audit_event_on_behalf_of_user_id,support_session_id)
  values(target,app_private.current_actor_user_id(),origin,lower(tg_op)::public.audit_event_action,tg_table_name,(data->>(tg_table_name||'_id'))::uuid,
    jsonb_build_object('before',before_data,'after',after_data),case when app_private.is_impersonating() then app_private.current_user_id() end,app_private.current_support_session_id());
  return coalesce(new,old);
end;
$$;
create function app_private.record_access_policy_change(target_tenant_id uuid,before_policy jsonb,after_policy jsonb,template public.access_policy_template,event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id,true,true);
  insert into public.audit_event(tenant_id,audit_event_actor_user_id,audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff,
    audit_event_on_behalf_of_user_id,support_session_id)
  values(target_tenant_id,app_private.current_actor_user_id(),'authenticated','update','access_policy_change',target_tenant_id,
    jsonb_build_object('before',before_policy,'after',after_policy,'access_policy_applied_template',template,'client_event_id',event_id),
    case when app_private.is_impersonating() then app_private.current_user_id() end,app_private.current_support_session_id());
end;
$$;
reset role;
revoke create on schema app_private from audit_writer;
grant execute on function app_private.current_identity_is_valid(),app_private.writable_permission_tenant_ids(public.admin_permission),app_private.require_access_policy(uuid,boolean,boolean) to audit_writer;

grant create on schema public to access_policy_writer;
set role access_policy_writer;
create function public.get_access_policy(target_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform app_private.require_access_policy(target_tenant_id);
  result:=jsonb_build_object('policy',app_private.access_policy_snapshot(target_tenant_id));
  if target_tenant_id in(select app_private.permission_tenant_ids('access_config')) then
    result:=result||jsonb_build_object('metadata',(select jsonb_build_object('access_policy_id',access_policy_id,'access_policy_applied_template',access_policy_applied_template,
      'access_policy_updated_by_user_id',access_policy_updated_by_user_id,'access_policy_updated_at',access_policy_updated_at) from public.access_policy where tenant_id=target_tenant_id));
  end if;
  return result;
end;
$$;
reset role;
grant create on schema app_private to access_policy_writer;
set role access_policy_writer;
create function app_private.write_access_policy(target_tenant_id uuid,policy jsonb,template public.access_policy_template,event_id uuid,operation text) returns jsonb
language plpgsql set search_path='' as $$
declare receipt app_private.access_policy_operation; before_policy jsonb; result jsonb;
  input jsonb:=jsonb_build_object('policy',policy,'template',template);
begin
  perform app_private.require_access_policy(target_tenant_id,true,true);
  if event_id is null then raise exception 'Invalid access policy event' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('policy-event:'||event_id::text,0));
  select * into receipt from app_private.access_policy_operation where client_event_id=event_id;
  if found then
    if receipt.tenant_id is distinct from target_tenant_id or receipt.access_policy_operation_actor_user_id is distinct from app_private.current_actor_user_id()
      or receipt.support_session_id is distinct from app_private.current_support_session_id()
      or receipt.access_policy_operation_name is distinct from operation or receipt.access_policy_operation_input is distinct from input then
      raise exception 'Access policy retry denied' using errcode='42501'; end if;
    return receipt.access_policy_operation_result;
  end if;
  perform app_private.validate_access_policy(policy);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('policy-tenant:'||target_tenant_id::text,0));
  before_policy:=app_private.access_policy_snapshot(target_tenant_id);
  perform app_private.replace_access_policy(target_tenant_id,policy,template);
  perform app_private.record_access_policy_change(target_tenant_id,before_policy,app_private.access_policy_snapshot(target_tenant_id),template,event_id);
  result:=public.get_access_policy(target_tenant_id);
  insert into app_private.access_policy_operation values(event_id,target_tenant_id,app_private.current_actor_user_id(),app_private.current_support_session_id(),operation,input,result);
  return result;
end;
$$;
reset role;
revoke create on schema app_private from access_policy_writer;
set role access_policy_writer;
create function public.update_access_policy(target_tenant_id uuid,policy jsonb,client_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id,true,true);
  return app_private.write_access_policy(target_tenant_id,policy,null,client_event_id,'update');
end;
$$;
create function public.apply_access_policy_template(target_tenant_id uuid,template public.access_policy_template,client_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id,true,true);
  if template is null then raise exception 'Invalid access policy template' using errcode='22023'; end if;
  return app_private.write_access_policy(target_tenant_id,app_private.access_policy_template_data(template),template,client_event_id,'template');
end;
$$;
create function public.access_policy_history(target_tenant_id uuid) returns table(audit_event_id uuid,audit_event_actor_user_id uuid,audit_event_occurred_at timestamptz,
  audit_event_on_behalf_of_user_id uuid,support_session_id uuid,before_policy jsonb,after_policy jsonb,access_policy_applied_template public.access_policy_template,client_event_id uuid)
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id,false,true);
  return query select a.audit_event_id,a.audit_event_actor_user_id,a.audit_event_occurred_at,a.audit_event_on_behalf_of_user_id,a.support_session_id,
    a.audit_event_diff->'before',a.audit_event_diff->'after',(a.audit_event_diff->>'access_policy_applied_template')::public.access_policy_template,(a.audit_event_diff->>'client_event_id')::uuid
    from public.audit_event a where a.tenant_id=target_tenant_id and a.audit_event_table_name='access_policy_change' order by a.audit_event_occurred_at desc,a.audit_event_id;
end;
$$;
reset role;
revoke create on schema public from access_policy_writer;
grant select on public.audit_event to access_policy_writer;
create policy "policy writer can read configuration history" on public.audit_event for select to access_policy_writer using(true);
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='app_private'::regnamespace and proname in
    ('validate_access_policy','access_policy_snapshot','replace_access_policy','audit_access_policy_row','record_access_policy_change','write_access_policy') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to access_policy_writer',f.signature);
  end loop;
end $$;
do $$ declare t text; begin
  foreach t in array array['access_policy','access_policy_rule'] loop
    execute format('create trigger audit_row_change after insert or update or delete on public.%I for each row execute function app_private.audit_access_policy_row()',t);
    execute format('alter table public.%I enable always trigger audit_row_change',t);
  end loop;
end $$;
-- PostgreSQL NOINHERIT capability owners must issue their own ACL mutations.
set role audit_writer;
revoke all on function app_private.audit_access_policy_row(),app_private.record_access_policy_change(uuid,jsonb,jsonb,public.access_policy_template,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.audit_access_policy_row() to postgres;
grant execute on function app_private.record_access_policy_change(uuid,jsonb,jsonb,public.access_policy_template,uuid) to access_policy_writer;
reset role;
set role access_policy_writer;
revoke all on function app_private.write_access_policy(uuid,jsonb,public.access_policy_template,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.get_access_policy(uuid),public.update_access_policy(uuid,jsonb,uuid),public.apply_access_policy_template(uuid,public.access_policy_template,uuid),public.access_policy_history(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_access_policy(uuid),public.update_access_policy(uuid,jsonb,uuid),public.apply_access_policy_template(uuid,public.access_policy_template,uuid),public.access_policy_history(uuid) to authenticated;
reset role;
