-- M02-F06/F07 and D24. Device credentials prove the tablet; the caller's guard identity proves the operator.
create function public.save_gate(target_tenant_id uuid,gate_data jsonb,client_event_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target_id uuid; receipt jsonb;
begin
  perform app_private.require_guards(target_tenant_id);
  receipt:=app_private.registry_retry(client_event_id,target_tenant_id,'save_gate',gate_data);
  if receipt is not null then return (receipt->>'id')::uuid; end if;
  if jsonb_typeof(gate_data) is distinct from 'object' then raise exception 'Invalid gate input' using errcode='22023'; end if;
  target_id:=(gate_data->>'gate_id')::uuid;
  if target_id is null then
    insert into public.gate(tenant_id,gate_name,gate_kind,gate_is_active)
      values(target_tenant_id,gate_data->>'gate_name',(gate_data->>'gate_kind')::public.gate_kind,coalesce((gate_data->>'gate_is_active')::boolean,true)) returning gate_id into target_id;
  else
    update public.gate set gate_name=gate_data->>'gate_name',gate_kind=(gate_data->>'gate_kind')::public.gate_kind,
      gate_is_active=coalesce((gate_data->>'gate_is_active')::boolean,true) where tenant_id=target_tenant_id and gate_id=target_id;
    if not found then raise exception 'Gate management denied' using errcode='42501'; end if;
  end if;
  perform app_private.registry_finish(client_event_id,target_tenant_id,'save_gate',gate_data,jsonb_build_object('id',target_id)); return target_id;
end;
$$;
create function public.assign_guard_gate(target_tenant_id uuid,target_gate_id uuid,target_membership_id uuid,assigned boolean,client_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_array(target_gate_id,target_membership_id,assigned);
begin
  perform app_private.require_guards(target_tenant_id);
  if app_private.registry_retry(client_event_id,target_tenant_id,'assign_guard_gate',payload) is not null then return; end if;
  perform 1 from public.gate where tenant_id=target_tenant_id and gate_id=target_gate_id;
  if not found then raise exception 'Gate management denied' using errcode='42501'; end if;
  perform 1 from public.membership where tenant_id=target_tenant_id and membership_id=target_membership_id and membership_role='guard'
    and membership_status='active' and membership_valid_from<=now() and (membership_valid_to is null or now()<membership_valid_to);
  if not found then raise exception 'Gate management denied' using errcode='42501'; end if;
  if assigned then
    insert into public.gate_guard(tenant_id,gate_id,membership_id) values(target_tenant_id,target_gate_id,target_membership_id)
      on conflict(tenant_id,gate_id,membership_id) do nothing;
  elsif assigned=false then delete from public.gate_guard where tenant_id=target_tenant_id and gate_id=target_gate_id and membership_id=target_membership_id;
  else raise exception 'Invalid assignment' using errcode='22023'; end if;
  perform app_private.registry_finish(client_event_id,target_tenant_id,'assign_guard_gate',payload,'{}');
end;
$$;
create function public.create_device_pairing(target_tenant_id uuid,target_gate_id uuid,client_event_id uuid) returns table(device_pairing_id uuid,pairing_code text,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare existing public.device_pairing; secret text:=encode(extensions.gen_random_bytes(16),'hex');
begin
  if app_private.is_impersonating() then raise exception 'Pairing management denied' using errcode='42501'; end if;
  perform app_private.require_guards(target_tenant_id);
  if create_device_pairing.client_event_id is null then raise exception 'Invalid pairing input' using errcode='22023'; end if;
  perform 1 from public.gate where tenant_id=target_tenant_id and gate_id=target_gate_id and gate_is_active for share;
  if not found then raise exception 'Pairing management denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(create_device_pairing.client_event_id::text,0));
  select * into existing from public.device_pairing where client_event_id=create_device_pairing.client_event_id for update;
  if found then
    if existing.tenant_id is distinct from target_tenant_id or existing.gate_id is distinct from target_gate_id
      or existing.device_pairing_created_by_user_id is distinct from app_private.current_user_id()
      or existing.device_pairing_redeemed_at is not null or existing.device_pairing_expires_at<=statement_timestamp() then
      raise exception 'Pairing management denied' using errcode='42501'; end if;
    update public.device_pairing set device_pairing_code_hash=encode(extensions.digest(secret,'sha256'),'hex') where device_pairing_id=existing.device_pairing_id;
  else
    insert into public.device_pairing(tenant_id,gate_id,device_pairing_code_hash,device_pairing_created_by_user_id,device_pairing_expires_at,client_event_id)
      values(target_tenant_id,target_gate_id,encode(extensions.digest(secret,'sha256'),'hex'),app_private.current_user_id(),
        now()+interval '10 minutes',create_device_pairing.client_event_id) returning * into existing;
  end if;
  return query select existing.device_pairing_id,secret,existing.device_pairing_expires_at;
end;
$$;
create function public.redeem_device_pairing(target_tenant_id uuid,pairing_code text,device_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pairing public.device_pairing; secret text:=encode(extensions.gen_random_bytes(32),'hex'); created_id uuid;
  unavailable jsonb:='{"status":"unavailable"}'; actor uuid:=app_private.current_user_id();
begin
  if actor is null or app_private.is_impersonating() or target_tenant_id not in(select app_private.writable_tenant_ids())
    or (target_tenant_id not in(select app_private.permission_tenant_ids('guards'))
      and target_tenant_id not in(select app_private.role_tenant_ids(array['guard']::public.membership_role[]))) then return unavailable; end if;
  if not app_private.consume_registry_attempt('pair:user:'||actor::text,5) then return unavailable; end if;
  if pairing_code is null or pairing_code !~ '^[a-f0-9]{32}$' or length(btrim(coalesce(device_name,''))) not between 1 and 100 then return unavailable; end if;
  select p.* into pairing from public.device_pairing p join public.gate g using(tenant_id,gate_id)
    where p.tenant_id=target_tenant_id and p.device_pairing_code_hash=encode(extensions.digest(pairing_code,'sha256'),'hex')
      and p.device_pairing_redeemed_at is null and p.device_pairing_expires_at>statement_timestamp() and g.gate_is_active for update of p;
  if pairing.device_pairing_id is null or not app_private.constant_time_hash_equal(coalesce(pairing.device_pairing_code_hash,repeat('0',64)),encode(extensions.digest(pairing_code,'sha256'),'hex')) then return unavailable; end if;
  insert into public.device(tenant_id,gate_id,device_name,device_credential_hash,device_paired_by_user_id)
    values(target_tenant_id,pairing.gate_id,btrim(device_name),encode(extensions.digest(secret,'sha256'),'hex'),actor) returning device_id into created_id;
  update public.device_pairing set device_pairing_redeemed_at=statement_timestamp(),device_id=created_id where device_pairing_id=pairing.device_pairing_id;
  return jsonb_build_object('status','paired','device_id',created_id,'device_token',secret);
end;
$$;
create function public.sync_device(target_tenant_id uuid,target_device_id uuid,device_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.device; unavailable jsonb:='{"status":"unavailable"}';
begin
  if app_private.current_user_id() is null or app_private.is_impersonating() or target_tenant_id not in(select app_private.writable_tenant_ids())
    or (target_tenant_id not in(select app_private.permission_tenant_ids('guards'))
      and target_tenant_id not in(select app_private.role_tenant_ids(array['guard']::public.membership_role[]))) then return unavailable; end if;
  if device_token is null or device_token !~ '^[a-f0-9]{64}$' then return unavailable; end if;
  select d.* into target from public.device d join public.gate g using(tenant_id,gate_id)
    where d.tenant_id=target_tenant_id and d.device_id=target_device_id and d.device_status='active' and g.gate_is_active
      and d.device_credential_hash=encode(extensions.digest(device_token,'sha256'),'hex') for update of d;
  if target.device_id is null or not app_private.constant_time_hash_equal(coalesce(target.device_credential_hash,repeat('0',64)),encode(extensions.digest(device_token,'sha256'),'hex')) then return unavailable; end if;
  update public.device set device_last_sync_at=statement_timestamp() where tenant_id=target_tenant_id and device_id=target_device_id;
  return jsonb_build_object('status','active','device_id',target.device_id,'gate_id',target.gate_id,'synced_at',statement_timestamp());
end;
$$;
create function public.revoke_device(target_tenant_id uuid,target_device_id uuid,client_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if app_private.is_impersonating() then raise exception 'Device management denied' using errcode='42501'; end if;
  perform app_private.require_guards(target_tenant_id);
  if app_private.registry_retry(client_event_id,target_tenant_id,'revoke_device',to_jsonb(target_device_id)) is not null then return; end if;
  update public.device set device_status='revoked' where tenant_id=target_tenant_id and device_id=target_device_id;
  if not found then raise exception 'Device management denied' using errcode='42501'; end if;
  perform app_private.registry_finish(client_event_id,target_tenant_id,'revoke_device',to_jsonb(target_device_id),'{}');
end;
$$;
create function public.guard_registry(target_tenant_id uuid,search text default null) returns table
  (unit_id uuid,unit_code text,person_id uuid,resident_display_name text,unit_resident_is_holder boolean,unit_resident_is_minor boolean)
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare pattern text;
begin
  if target_tenant_id not in(select app_private.role_tenant_ids(array['guard']::public.membership_role[])) then
    raise exception 'Operational registry denied' using errcode='42501'; end if;
  if length(coalesce(search,''))>100 then raise exception 'Invalid registry search' using errcode='22023'; end if;
  pattern:='%'||replace(replace(replace(coalesce(search,''),'\','\\'),'%','\%'),'_','\_')||'%';
  return query select u.unit_id,u.unit_code,p.person_id,p.person_first_name||' '||p.person_last_name,r.unit_resident_is_holder,r.unit_resident_is_minor
    from public.unit u join public.unit_resident r using(tenant_id,unit_id) join public.person p using(tenant_id,person_id)
    where u.tenant_id=target_tenant_id and u.unit_archived_at is null and r.unit_resident_valid_from_at<=now()
      and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at)
      and (u.unit_code ilike pattern escape '\' or (p.person_first_name||' '||p.person_last_name) ilike pattern escape '\')
    order by u.unit_code,p.person_last_name,p.person_first_name limit 200;
end;
$$;
-- Backup phones are a separate, deliberately narrow, audited operational action, never part of search/listing.
create function public.guard_backup_contact(target_tenant_id uuid,target_unit_id uuid,operation_code text) returns text
language plpgsql security definer set search_path='' as $$
declare phone text;
begin
  if target_tenant_id not in(select app_private.role_tenant_ids(array['guard']::public.membership_role[]))
    or operation_code is distinct from 'approval_phone_fallback' then
    raise exception 'Operational contact denied' using errcode='42501'; end if;
  select unit_backup_phone into phone from public.unit where tenant_id=target_tenant_id and unit_id=target_unit_id and unit_archived_at is null;
  if not found then raise exception 'Operational contact denied' using errcode='42501'; end if;
  perform app_private.record_registry_contact_lookup(target_tenant_id,target_unit_id);
  return phone;
end;
$$;
create function app_private.record_registry_contact_lookup(target_tenant_id uuid,target_unit_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if target_tenant_id not in(select app_private.role_tenant_ids(array['guard']::public.membership_role[])) then
    raise exception 'Operational contact denied' using errcode='42501'; end if;
  insert into public.audit_event(tenant_id,audit_event_actor_user_id,audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,
    audit_event_diff,audit_event_on_behalf_of_user_id,support_session_id)
    values(target_tenant_id,app_private.current_actor_user_id(),'authenticated','insert','registry_contact_lookup',target_unit_id,
      '{"operation_code":"approval_phone_fallback"}',case when app_private.is_impersonating() then app_private.current_user_id() end,app_private.current_support_session_id());
end;
$$;
revoke all on function app_private.record_registry_contact_lookup(uuid,uuid) from public,anon,authenticated,service_role;
grant create on schema app_private to audit_writer;
alter function app_private.record_registry_contact_lookup(uuid,uuid) owner to audit_writer;
revoke create on schema app_private from audit_writer;
set role audit_writer;
grant execute on function app_private.record_registry_contact_lookup(uuid,uuid) to postgres,registry_writer;
reset role;
grant execute on function app_private.role_tenant_ids(public.membership_role[]) to audit_writer;
