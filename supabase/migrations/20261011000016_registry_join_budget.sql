-- M02-F04: tenant failure budgets tighten user throttling without blocking first valid attempts.
grant create on schema public to registry_writer;
set role registry_writer;
create or replace function public.submit_unit_join_request(join_code text,person_data jsonb,client_event_id uuid,target_tenant_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.current_user_id(); normalized text:=upper(regexp_replace(coalesce(join_code,''),'[-[:space:]]','','g'));
  code public.unit_join_code; created_id uuid; existing public.unit_join_request; payload jsonb:=jsonb_build_array(normalized,person_data);
  unavailable jsonb:='{"status":"unavailable"}'; allowed boolean; budget_tenant uuid;
begin
  if actor is null or app_private.is_impersonating() or app_private.verified_email() is null then return unavailable; end if;
  allowed:=app_private.consume_registry_attempt('join:user:'||actor::text,5);
  if not allowed then return unavailable; end if;
  -- No unit lookup or lock until the caller has proved a live authenticated identity.
  if normalized ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$' then
    select c.* into code from public.unit_join_code c join public.unit u using(tenant_id,unit_id) join public.tenant t using(tenant_id)
      where (target_tenant_id is null or c.tenant_id=target_tenant_id) and c.unit_join_code_hash=encode(extensions.digest(normalized,'sha256'),'hex')
        and u.unit_archived_at is null and t.tenant_subscription_status in('pilot','active') for share of c,u;
  end if;
  budget_tenant:=coalesce(code.tenant_id,target_tenant_id);
  if app_private.registry_failure_budget_exceeded('join:tenant:'||coalesce(budget_tenant::text,'none'),100)
    and app_private.registry_failure_budget_exceeded('join:user:'||actor::text,1) then return unavailable; end if;
  if code.unit_id is null or not app_private.constant_time_hash_equal(coalesce(code.unit_join_code_hash,repeat('0',64)),encode(extensions.digest(normalized,'sha256'),'hex')) then
    -- Tenant failed counters never reject a valid secret, so an attacker cannot exhaust legitimate onboarding.
    if not app_private.consume_registry_attempt('join:tenant:'||coalesce(target_tenant_id::text,'none'),100) then
      if target_tenant_id is not null then perform app_private.record_join_code_abuse(target_tenant_id); end if;
      return unavailable;
    end if;
    return unavailable;
  end if;
  begin
  if client_event_id is null or jsonb_typeof(person_data) is distinct from 'object'
    or length(btrim(coalesce(person_data->>'person_first_name',''))) not between 1 and 100
    or length(btrim(coalesce(person_data->>'person_last_name',''))) not between 1 and 100
    or coalesce((person_data->>'unit_resident_is_minor')::boolean,false)
    or (person_data->>'person_birth_date')::date>(current_date-interval '18 years')::date then return unavailable; end if;
  exception when invalid_text_representation or datetime_field_overflow then return unavailable;
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(client_event_id::text,0));
  select r.* into existing from public.unit_join_request r where r.client_event_id=submit_unit_join_request.client_event_id;
  if found then
    if existing.unit_join_request_user_id is distinct from actor or existing.tenant_id is distinct from code.tenant_id
      or existing.unit_id is distinct from code.unit_id then return unavailable; end if;
    return jsonb_build_object('status',existing.unit_join_request_status,'unit_join_request_id',existing.unit_join_request_id);
  end if;
  select unit_join_request_id into created_id from public.unit_join_request where tenant_id=code.tenant_id and unit_id=code.unit_id
    and unit_join_request_user_id=actor and unit_join_request_status='pending';
  if created_id is null then
    begin
    insert into public.unit_join_request(tenant_id,unit_id,unit_join_request_user_id,unit_join_request_email,unit_join_request_first_name,
      unit_join_request_last_name,unit_join_request_document_type,unit_join_request_document_number,unit_join_request_birth_date,client_event_id)
    values(code.tenant_id,code.unit_id,actor,app_private.verified_email(),btrim(person_data->>'person_first_name'),btrim(person_data->>'person_last_name'),
      nullif(person_data->>'person_document_type','')::public.person_document_type,nullif(person_data->>'person_document_number',''),
      nullif(person_data->>'person_birth_date','')::date,submit_unit_join_request.client_event_id) returning unit_join_request_id into created_id;
    exception when check_violation or invalid_text_representation or datetime_field_overflow then return unavailable;
    end;
  end if;
  return jsonb_build_object('status','pending','unit_join_request_id',created_id);
end;
$$;
reset role;
revoke create on schema public from registry_writer;

create function app_private.registry_failure_budget_exceeded(scope_code text,maximum_count integer) returns boolean
language sql stable security definer set search_path='' as $$
  select app_private.current_identity_is_valid() and not app_private.is_impersonating() and exists(select 1 from app_private.registry_attempt
    where registry_attempt_scope_code=scope_code and registry_attempt_started_at>statement_timestamp()-interval '15 minutes'
      and registry_attempt_count>maximum_count);
$$;
revoke all on function app_private.registry_failure_budget_exceeded(text,integer) from public,anon,authenticated,service_role;
grant execute on function app_private.registry_failure_budget_exceeded(text,integer) to registry_writer;

create function app_private.record_join_code_abuse(target_tenant_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not app_private.current_identity_is_valid() or app_private.is_impersonating() then return; end if;
  -- At most one suspicion event per tenant per window; no document, email or attempted code.
  if not app_private.consume_registry_attempt('join:alert:'||target_tenant_id::text,1) then return; end if;
  if not exists(select 1 from public.tenant where tenant_id=target_tenant_id) then return; end if;
  insert into public.audit_event(tenant_id,audit_event_actor_user_id,audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff)
    values(target_tenant_id,app_private.current_actor_user_id(),'authenticated','insert','join_code_bruteforce_suspected',target_tenant_id,'{}');
end;
$$;
revoke all on function app_private.record_join_code_abuse(uuid) from public,anon,authenticated,service_role;
grant create on schema app_private to audit_writer;
alter function app_private.record_join_code_abuse(uuid) owner to audit_writer;
revoke create on schema app_private from audit_writer;
set role audit_writer;
grant execute on function app_private.record_join_code_abuse(uuid) to registry_writer;
reset role;
grant execute on function app_private.consume_registry_attempt(text,integer) to audit_writer;

