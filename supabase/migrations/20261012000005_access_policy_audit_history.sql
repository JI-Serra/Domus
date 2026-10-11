-- M03-F01: normalize validated integer JSON numbers and redact aggregate history.

create or replace function app_private.replace_access_policy(target_tenant_id uuid,policy jsonb,template public.access_policy_template) returns void
language plpgsql set search_path='' as $$
declare policy_id uuid; rule record;
begin
  perform app_private.validate_access_policy(policy);
  insert into public.access_policy(tenant_id,access_policy_approval_timeout_seconds_count,access_policy_permanent_authorization_max_days_count,
    access_policy_pass_max_uses_count,access_policy_pass_max_days_count,access_policy_event_max_guests_count,access_policy_applied_template,access_policy_updated_by_user_id)
  values(target_tenant_id,(policy->>'access_policy_approval_timeout_seconds_count')::numeric::integer,(policy->>'access_policy_permanent_authorization_max_days_count')::numeric::integer,
    (policy->>'access_policy_pass_max_uses_count')::numeric::integer,(policy->>'access_policy_pass_max_days_count')::numeric::integer,(policy->>'access_policy_event_max_guests_count')::numeric::integer,template,app_private.current_actor_user_id())
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

create function app_private.mask_access_policy_audit(policy jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare rules jsonb; visitor text; rule jsonb;
begin
  if policy is null then return null; end if;
  rules:=policy->'rules';
  for visitor,rule in select key,value from jsonb_each(rules) loop
    rules:=jsonb_set(rules,array[visitor],app_private.mask_audit_columns(rule,app_private.audit_redacted_columns('access_policy_rule')));
  end loop;
  return app_private.mask_audit_columns(jsonb_set(policy,'{rules}',rules),app_private.audit_redacted_columns('access_policy'));
end;
$$;
revoke all on function app_private.mask_access_policy_audit(jsonb) from public,anon,authenticated,service_role;
grant execute on function app_private.mask_access_policy_audit(jsonb) to audit_writer;
grant create on schema app_private to audit_writer;
set role audit_writer;

create or replace function app_private.record_access_policy_change(target_tenant_id uuid,before_policy jsonb,after_policy jsonb,template public.access_policy_template,event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id,true,true);
  insert into public.audit_event(tenant_id,audit_event_actor_user_id,audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff,
    audit_event_on_behalf_of_user_id,support_session_id)
  values(target_tenant_id,app_private.current_actor_user_id(),'authenticated','update','access_policy_change',target_tenant_id,
    jsonb_build_object('before',app_private.mask_access_policy_audit(before_policy),'after',app_private.mask_access_policy_audit(after_policy),'access_policy_applied_template',template,'client_event_id',event_id),
    case when app_private.is_impersonating() then app_private.current_user_id() end,app_private.current_support_session_id());
end;
$$;

reset role;
revoke create on schema app_private from audit_writer;
