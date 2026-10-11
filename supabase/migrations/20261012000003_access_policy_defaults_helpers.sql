create or replace function app_private.audit_redacted_columns(target_table text) returns text[]
language sql immutable set search_path='' as $$
  select case target_table
    when 'person' then array['person_first_name','person_last_name','person_document_number','person_email','person_phone','person_birth_date',
      'person_claimed_document_number','person_claimed_email']::text[]
    when 'tenant' then array[]::text[] when 'platform_admin' then array[]::text[]
    when 'membership' then array[]::text[] when 'membership_permission' then array[]::text[]
    when 'invitation' then array['invitation_email','invitation_first_name','invitation_last_name','invitation_token_hash']::text[]
    when 'support_session' then array['support_session_reason','support_session_revocation_reason']::text[]
    when 'unit' then array['unit_contact_phone','unit_backup_phone']::text[]
    when 'unit_resident' then array[]::text[] when 'membership_household_permission' then array[]::text[]
    when 'vehicle' then array['vehicle_plate_code']::text[] when 'pet' then array['pet_photo_path']::text[]
    when 'unit_join_code' then array['unit_join_code_hash']::text[]
    when 'unit_join_request' then array['unit_join_request_email','unit_join_request_first_name','unit_join_request_last_name','unit_join_request_document_number','unit_join_request_birth_date']::text[]
    when 'gate' then array[]::text[] when 'gate_guard' then array[]::text[]
    when 'device' then array['device_credential_hash']::text[] when 'device_pairing' then array['device_pairing_code_hash']::text[]
    when 'registry_import' then array[]::text[] when 'registry_import_row' then array['registry_import_row_data']::text[] when 'access_policy' then array[]::text[] when 'access_policy_rule' then array[]::text[] else null::text[] end;
$$;

-- M03-F05: tenant insertion and create_tenant receive balanced atomically.
create function app_private.initialize_access_policy() returns trigger
language plpgsql security definer set search_path='' as $$
declare origin text:=coalesce(nullif(current_setting('role',true),'none'),session_user);
begin
  if tg_table_name<>'tenant' or tg_op<>'INSERT' or (origin not in('postgres','supabase_admin')
    and (origin<>'authenticated' or not app_private.is_platform_admin())) then
    raise exception 'Access policy denied' using errcode='42501'; end if;
  perform app_private.replace_access_policy(new.tenant_id,app_private.access_policy_template_data('balanced'),'balanced');
  return new;
end;
$$;
revoke all on function app_private.initialize_access_policy() from public,anon,authenticated,service_role;
create trigger initialize_access_policy after insert on public.tenant for each row execute function app_private.initialize_access_policy();
alter table public.tenant enable always trigger initialize_access_policy;
do $$ declare tenant uuid; begin
  for tenant in select tenant_id from public.tenant loop
    perform app_private.replace_access_policy(tenant,app_private.access_policy_template_data('balanced'),'balanced');
  end loop;
end $$;

-- M04/M05: authorization-first helpers for SQL consumers; no directly exposed HTTP RPCs.
grant create on schema app_private to access_policy_writer;
set role access_policy_writer;
create function app_private.policy_allows_mode(target_tenant_id uuid,visitor public.visitor_type,mode public.household_access_mode) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id);
  return coalesce((select mode=any(access_policy_rule_allowed_modes) from public.access_policy_rule where tenant_id=target_tenant_id and access_policy_rule_visitor_type=visitor),false);
end;
$$;
create function app_private.policy_default_mode(target_tenant_id uuid,visitor public.visitor_type) returns public.household_access_mode
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id);
  return (select access_policy_rule_default_mode from public.access_policy_rule where tenant_id=target_tenant_id and access_policy_rule_visitor_type=visitor);
end;
$$;
create function app_private.policy_requires_identity(target_tenant_id uuid,visitor public.visitor_type) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id);
  return (select access_policy_rule_is_identity_verification_required from public.access_policy_rule where tenant_id=target_tenant_id and access_policy_rule_visitor_type=visitor);
end;
$$;
create function app_private.policy_limits(target_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id);
  return app_private.access_policy_snapshot(target_tenant_id)-array['rules','access_policy_approval_timeout_seconds_count'];
end;
$$;
create function app_private.policy_approval_timeout(target_tenant_id uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_access_policy(target_tenant_id);
  return (select access_policy_approval_timeout_seconds_count from public.access_policy where tenant_id=target_tenant_id);
end;
$$;
reset role;
revoke create on schema app_private from access_policy_writer;
set role access_policy_writer;
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='app_private'::regnamespace
    and proname in('policy_allows_mode','policy_default_mode','policy_requires_identity','policy_limits','policy_approval_timeout') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to registry_writer',f.signature);
  end loop;
end $$;
reset role;
