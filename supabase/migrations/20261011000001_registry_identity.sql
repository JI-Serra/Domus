-- Central identity, unit scopes and authorization-first integrity checks.
create function app_private.resident_is_minor(target_person public.person, declared_minor boolean) returns boolean
language sql stable set search_path='' as $$
  select declared_minor or (target_person.person_birth_date is not null and target_person.person_birth_date>(current_date-interval '18 years')::date);
$$;
create function app_private.holder_unit_ids() returns setof uuid
language sql stable security definer set search_path='' as $$
  select distinct m.unit_id from public.membership m join public.unit_resident r using(tenant_id,unit_id,person_id)
    join public.unit u using(tenant_id,unit_id)
  where m.membership_id in(select app_private.own_membership_ids()) and m.membership_role='unit_holder'
    and r.unit_resident_is_holder and not r.unit_resident_is_minor
    and r.unit_resident_valid_from_at<=now() and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at)
    and u.unit_archived_at is null;
$$;
create function app_private.household_unit_ids() returns setof uuid
language sql stable security definer set search_path='' as $$
  select distinct m.unit_id from public.membership m join public.unit_resident r using(tenant_id,unit_id,person_id)
    join public.unit u using(tenant_id,unit_id)
  where m.membership_id in(select app_private.own_membership_ids()) and m.membership_role in('unit_holder','household_member')
    and not r.unit_resident_is_minor and r.unit_resident_valid_from_at<=now()
    and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at) and u.unit_archived_at is null;
$$;
create function app_private.household_permission_unit_ids(required_permission public.household_permission) returns setof uuid
language sql stable security definer set search_path='' as $$
  select app_private.holder_unit_ids() union
  select m.unit_id from public.membership m join public.membership_household_permission p using(tenant_id,membership_id)
  where m.membership_id in(select app_private.own_membership_ids()) and m.membership_role='household_member'
    and m.unit_id in(select app_private.household_unit_ids()) and p.membership_household_permission_permission=required_permission;
$$;
create function app_private.can_manage_unit(target_tenant_id uuid,target_unit_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select target_tenant_id in(select app_private.writable_permission_tenant_ids('registry'))
    or (target_tenant_id in(select app_private.writable_tenant_ids()) and target_unit_id in(select app_private.holder_unit_ids()));
$$;
create function app_private.require_registry(target_tenant_id uuid,writing boolean default true) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if target_tenant_id is null or target_tenant_id not in(select app_private.permission_tenant_ids('registry'))
    or (writing and target_tenant_id not in(select app_private.writable_tenant_ids())) then
    raise exception 'Registry management denied' using errcode='42501'; end if;
end;
$$;
create function app_private.require_unit_manager(target_tenant_id uuid,target_unit_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce(app_private.can_manage_unit(target_tenant_id,target_unit_id),false) then
    raise exception 'Registry management denied' using errcode='42501'; end if;
end;
$$;
create function app_private.require_guards(target_tenant_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if target_tenant_id is null or target_tenant_id not in(select app_private.writable_permission_tenant_ids('guards')) then
    raise exception 'Gate management denied' using errcode='42501'; end if;
end;
$$;

create function app_private.registry_retry(event_id uuid,target_tenant_id uuid,operation text,payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare receipt app_private.registry_operation; actor uuid:=app_private.current_user_id();
begin
  if event_id is null or actor is null then raise exception 'Invalid registry input' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(event_id::text,0));
  select * into receipt from app_private.registry_operation where client_event_id=event_id;
  if not found then return null; end if;
  if receipt.tenant_id is distinct from target_tenant_id or receipt.registry_operation_actor_user_id is distinct from actor
    or receipt.registry_operation_name is distinct from operation
    or receipt.registry_operation_input_hash is distinct from encode(extensions.digest(payload::text,'sha256'),'hex') then
    raise exception 'Registry retry denied' using errcode='42501'; end if;
  return receipt.registry_operation_result;
end;
$$;
create function app_private.registry_finish(event_id uuid,target_tenant_id uuid,operation text,payload jsonb,result jsonb) returns void
language sql set search_path='' as $$
  insert into app_private.registry_operation(client_event_id,tenant_id,registry_operation_actor_user_id,registry_operation_name,registry_operation_input_hash,registry_operation_result)
    values(event_id,target_tenant_id,app_private.current_user_id(),operation,
    encode(extensions.digest(payload::text,'sha256'),'hex'),result);
$$;
-- Counters survive rejected attempts because public code RPCs return a uniform result instead of raising.
create function app_private.consume_registry_attempt(scope_code text,maximum_count integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare attempt_count integer;
begin
  if app_private.current_user_id() is null or app_private.is_impersonating() then return false; end if;
  insert into app_private.registry_attempt(registry_attempt_scope_code,registry_attempt_started_at,registry_attempt_count) values(scope_code,statement_timestamp(),1)
  on conflict(registry_attempt_scope_code) do update set
    registry_attempt_started_at=case when registry_attempt.registry_attempt_started_at<=statement_timestamp()-interval '15 minutes'
      then statement_timestamp() else registry_attempt.registry_attempt_started_at end,
    registry_attempt_count=case when registry_attempt.registry_attempt_started_at<=statement_timestamp()-interval '15 minutes'
      then 1 else least(registry_attempt.registry_attempt_count+1,1000000) end
  returning registry_attempt_count into attempt_count;
  return attempt_count<=maximum_count;
end;
$$;

create function app_private.enforce_registry_writes() returns trigger
language plpgsql set search_path='' as $$
declare target_tenant_id uuid:=coalesce(new.tenant_id,old.tenant_id);
begin
  if current_user in('postgres','supabase_admin') and coalesce(nullif(current_setting('role',true),'none'),session_user)<>'authenticated' then
    return coalesce(new,old); end if;
  if current_user not in('registry_writer','invitation_acceptor') or not app_private.current_identity_is_valid()
    or not exists(select 1 from public.tenant where tenant_id=target_tenant_id and tenant_subscription_status in('pilot','active')) then
    raise exception 'Tenant write denied' using errcode='42501'; end if;
  return coalesce(new,old);
end;
$$;
create function app_private.protect_registry_relationships() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (to_jsonb(new)->'unit_id' is distinct from to_jsonb(old)->'unit_id'
    or to_jsonb(new)->'person_id' is distinct from to_jsonb(old)->'person_id'
    or to_jsonb(new)->'membership_id' is distinct from to_jsonb(old)->'membership_id'
    or to_jsonb(new)->'gate_id' is distinct from to_jsonb(old)->'gate_id') then
    raise exception 'Registry relationships cannot change' using errcode='23514'; end if;
  if tg_op='DELETE' and tg_table_name='unit' then raise exception 'Archive units instead of deleting' using errcode='23514'; end if;
  return coalesce(new,old);
end;
$$;
-- Invoker checks run only after a caller has table privileges or has entered an authorized RPC.
create function app_private.lock_resident_unit() returns trigger
language plpgsql set search_path='' as $$
begin
  perform 1 from public.unit where tenant_id=coalesce(new.tenant_id,old.tenant_id)
    and unit_id=coalesce(new.unit_id,old.unit_id) for update;
  return coalesce(new,old);
end;
$$;
create function app_private.validate_occupied_unit() returns trigger
language plpgsql set search_path='' as $$
declare target_unit uuid:=case when tg_table_name='unit' then coalesce(new.unit_id,old.unit_id) else coalesce(new.unit_id,old.unit_id) end;
begin
  if exists(select 1 from public.unit where unit_id=target_unit and unit_status='occupied' and unit_archived_at is null)
    and not exists(select 1 from public.unit_resident where unit_id=target_unit and unit_resident_is_holder
      and not unit_resident_is_minor and unit_resident_valid_from_at<=now()
      and (unit_resident_valid_to_at is null or now()<unit_resident_valid_to_at)) then
    raise exception 'Occupied unit requires an active holder' using errcode='23514'; end if;
  return null;
end;
$$;
create constraint trigger validate_occupied_unit after insert or update on public.unit
  deferrable initially deferred for each row execute function app_private.validate_occupied_unit();
create constraint trigger validate_occupied_unit after insert or update or delete on public.unit_resident
  deferrable initially deferred for each row execute function app_private.validate_occupied_unit();
create trigger lock_resident_unit before insert or update or delete on public.unit_resident for each row execute function app_private.lock_resident_unit();

create function app_private.validate_household_membership() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user='registry_writer' and new.membership_role not in('unit_holder','household_member') then
    raise exception 'Registry role grant denied' using errcode='42501'; end if;
  if new.unit_id is not null and new.membership_status='active' and not exists(
    select 1 from public.unit_resident r join public.person p using(tenant_id,person_id)
    where r.tenant_id=new.tenant_id and r.unit_id=new.unit_id and r.person_id=new.person_id
      and not app_private.resident_is_minor(p,r.unit_resident_is_minor)
      and (new.membership_role<>'unit_holder' or r.unit_resident_is_holder)
      and r.unit_resident_valid_from_at<=new.membership_valid_from
      and (r.unit_resident_valid_to_at is null or (new.membership_valid_to is not null and new.membership_valid_to<=r.unit_resident_valid_to_at))) then
    raise exception 'Membership requires an eligible resident' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger validate_household_membership before insert or update on public.membership for each row execute function app_private.validate_household_membership();
create function app_private.validate_household_permission() returns trigger
language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.membership m join public.unit_resident r using(tenant_id,unit_id,person_id)
    join public.person p using(tenant_id,person_id)
    where m.tenant_id=new.tenant_id and m.membership_id=new.membership_id and m.membership_role='household_member'
      and m.membership_status='active' and not app_private.resident_is_minor(p,r.unit_resident_is_minor)
      and r.unit_resident_valid_from_at<=now() and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at)) then
    raise exception 'Delegation requires an adult household member' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger validate_household_permission before insert or update on public.membership_household_permission
  for each row execute function app_private.validate_household_permission();
create function app_private.validate_gate_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.membership where tenant_id=new.tenant_id and membership_id=new.membership_id and membership_role='guard') then
    raise exception 'Gate assignment requires a guard' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger validate_gate_guard before insert or update on public.gate_guard for each row execute function app_private.validate_gate_guard();

do $$ declare table_name text; begin
  foreach table_name in array array['unit','unit_resident','membership_household_permission','vehicle','pet',
    'unit_join_code','unit_join_request','gate','gate_guard','device','device_pairing','registry_import','registry_import_row'] loop
    execute format('create trigger enforce_registry_writes before insert or update or delete on public.%I for each row execute function app_private.enforce_registry_writes()',table_name);
    execute format('create trigger protect_registry_relationships before update or delete on public.%I for each row execute function app_private.protect_registry_relationships()',table_name);
    execute format('alter table public.%I enable always trigger enforce_registry_writes',table_name);
    execute format('alter table public.%I enable always trigger protect_registry_relationships',table_name);
  end loop;
end $$;
-- Explicit ACLs for all new helpers, including invoker trigger functions.
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='app_private'::regnamespace and proname in
    ('resident_is_minor','holder_unit_ids','household_unit_ids','household_permission_unit_ids','can_manage_unit','require_registry',
     'require_unit_manager','require_guards','registry_retry','registry_finish','consume_registry_attempt','enforce_registry_writes',
     'protect_registry_relationships','lock_resident_unit','validate_occupied_unit','validate_household_membership','validate_household_permission','validate_gate_guard') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    execute format('grant execute on function %s to registry_writer,invitation_acceptor',f.signature);
  end loop;
end $$;
grant execute on function app_private.holder_unit_ids(),app_private.household_unit_ids(),app_private.household_permission_unit_ids(public.household_permission) to authenticated;
grant execute on function app_private.current_user_id(),app_private.current_identity_is_valid(),app_private.current_actor_user_id(),
  app_private.current_support_session_id(),app_private.is_impersonating(),app_private.verified_email(),app_private.member_tenant_ids(),
  app_private.own_membership_ids(),app_private.current_person_ids(),app_private.permission_tenant_ids(public.admin_permission),
  app_private.writable_permission_tenant_ids(public.admin_permission),app_private.writable_tenant_ids(),app_private.role_tenant_ids(public.membership_role[]),
  app_private.tenant_allows_writes(uuid),app_private.constant_time_hash_equal(text,text) to registry_writer;
