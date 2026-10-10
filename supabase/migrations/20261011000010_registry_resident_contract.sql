-- M02-F04 / M02-F05: resident onboarding contracts; complete function definitions.
-- Named RPC arguments remain compatible; the optional tenant comes last in SQL.
drop function public.submit_unit_join_request(uuid,text,jsonb,uuid);
create function public.submit_unit_join_request(join_code text,person_data jsonb,client_event_id uuid,target_tenant_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.current_user_id(); normalized text:=upper(regexp_replace(coalesce(join_code,''),'[-[:space:]]','','g'));
  code public.unit_join_code; created_id uuid; existing public.unit_join_request; payload jsonb:=jsonb_build_array(normalized,person_data);
  unavailable jsonb:='{"status":"unavailable"}'; allowed boolean;
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
  if code.unit_id is null or not app_private.constant_time_hash_equal(coalesce(code.unit_join_code_hash,repeat('0',64)),encode(extensions.digest(normalized,'sha256'),'hex')) then
    -- Tenant failed counters never reject a valid secret, so an attacker cannot exhaust legitimate onboarding.
    if not app_private.consume_registry_attempt('join:tenant:'||coalesce(target_tenant_id::text,'none'),100) then return unavailable; end if;
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

create function public.my_unit_join_requests()
returns table(unit_join_request_id uuid,unit_join_request_status public.unit_join_request_status,
  unit_join_request_created_at timestamptz,tenant_name text,unit_code text)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_private.current_user_id();
begin
  if actor is null or app_private.is_impersonating() then
    raise exception 'Join request management denied' using errcode='42501'; end if;
  return query select r.unit_join_request_id,r.unit_join_request_status,r.unit_join_request_created_at,t.tenant_name,u.unit_code
    from public.unit_join_request r join public.tenant t using(tenant_id) join public.unit u using(tenant_id,unit_id)
    where r.unit_join_request_user_id=actor and t.tenant_subscription_status<>'cancelled'
    order by r.unit_join_request_created_at desc,r.unit_join_request_id;
end;
$$;

create function public.cancel_unit_join_request(target_unit_join_request_id uuid,client_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.current_user_id(); request public.unit_join_request; receipt jsonb;
  payload jsonb:=jsonb_build_array(target_unit_join_request_id);
begin
  if actor is null or app_private.is_impersonating() or client_event_id is null then
    raise exception 'Join request management denied' using errcode='42501'; end if;
  -- Only an owned request in a writable tenant can be read or locked. Applicants need no membership.
  select r.* into request from public.unit_join_request r join public.tenant t using(tenant_id)
    where r.unit_join_request_id=target_unit_join_request_id and r.unit_join_request_user_id=actor
      and t.tenant_subscription_status in('pilot','active') for update of r for share of t;
  if not found then raise exception 'Join request management denied' using errcode='42501'; end if;
  receipt:=app_private.registry_retry(client_event_id,request.tenant_id,'cancel_unit_join_request',payload);
  if receipt is not null then return receipt; end if;
  if request.unit_join_request_status<>'pending' then
    raise exception 'Join request management denied' using errcode='42501'; end if;
  update public.unit_join_request set unit_join_request_status='cancelled',unit_join_request_decided_at=statement_timestamp(),
    unit_join_request_decided_by_user_id=actor where unit_join_request_id=target_unit_join_request_id;
  receipt:=jsonb_build_object('status','cancelled');
  perform app_private.registry_finish(client_event_id,request.tenant_id,'cancel_unit_join_request',payload,receipt);
  return receipt;
exception when insufficient_privilege then
  raise exception 'Join request management denied' using errcode='42501';
end;
$$;

grant create on schema public to registry_writer;
set role registry_writer;
create or replace function public.unit_sheet(target_tenant_id uuid,target_unit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare registry_admin boolean; holder boolean; target public.unit; residents jsonb; vehicles jsonb; pets jsonb;
  member_permissions jsonb:='{}'; memberships jsonb:='[]'; invitations jsonb:='[]'; requests jsonb:='[]'; capabilities public.household_permission[]; result jsonb;
begin
  registry_admin:=target_tenant_id in(select app_private.permission_tenant_ids('registry'));
  holder:=target_unit_id in(select app_private.holder_unit_ids());
  if not registry_admin and (target_tenant_id not in(select app_private.member_tenant_ids()) or target_unit_id not in(select app_private.household_unit_ids())) then
    raise exception 'Unit sheet denied' using errcode='42501'; end if;
  select * into target from public.unit where tenant_id=target_tenant_id and unit_id=target_unit_id;
  if not found then raise exception 'Unit sheet denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)||case when registry_admin or holder or p.user_id=app_private.current_user_id()
    then to_jsonb(p)-'user_id' else jsonb_build_object('person_first_name',p.person_first_name,'person_last_name',p.person_last_name) end
    order by r.unit_resident_is_holder desc,p.person_last_name,p.person_first_name),'[]') into residents
    from public.unit_resident r join public.person p using(tenant_id,person_id) where r.tenant_id=target_tenant_id and r.unit_id=target_unit_id;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.vehicle_plate_code),'[]') into vehicles from public.vehicle v
    where tenant_id=target_tenant_id and unit_id=target_unit_id and vehicle_archived_at is null;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.pet_name),'[]') into pets from public.pet p
    where tenant_id=target_tenant_id and unit_id=target_unit_id and pet_archived_at is null;
  if registry_admin or holder then
    select coalesce(jsonb_agg(to_jsonb(m) order by m.membership_created_at),'[]') into memberships from public.membership m
      where tenant_id=target_tenant_id and unit_id=target_unit_id;
    select coalesce(jsonb_object_agg(m.membership_id::text,
      coalesce((select jsonb_agg(p.membership_household_permission_permission order by p.membership_household_permission_permission)
        from public.membership_household_permission p
        where p.tenant_id=m.tenant_id and p.membership_id=m.membership_id),'[]'::jsonb)),'{}'::jsonb)
      into member_permissions from public.membership m
      where m.tenant_id=target_tenant_id and m.unit_id=target_unit_id and m.membership_role='household_member';
    if not app_private.is_impersonating() then
      select coalesce(jsonb_agg(to_jsonb(i)-'invitation_token_hash' order by i.invitation_created_at),'[]') into invitations from public.invitation i
        where tenant_id=target_tenant_id and unit_id=target_unit_id and invitation_status='pending' and invitation_expires_at>statement_timestamp();
      select coalesce(jsonb_agg(to_jsonb(r) order by r.unit_join_request_created_at),'[]') into requests from public.unit_join_request r
        where tenant_id=target_tenant_id and unit_id=target_unit_id and unit_join_request_status='pending';
    end if;
  end if;
  capabilities:=case when registry_admin then enum_range(null::public.household_permission)
    else public.current_household_permissions(target_tenant_id,target_unit_id) end;
  result:=jsonb_build_object('unit',to_jsonb(target),'residents',residents,'vehicles',vehicles,'pets',pets,'memberships',memberships,
    'member_permissions',member_permissions,'pending_invitations',invitations,'pending_join_requests',requests,'permissions',capabilities,'movements','[]'::jsonb);
  if 'view_unit_finance'=any(capabilities) then result:=result||'{"balance":null}'; end if;
  if 'manage_access_authorizations'=any(capabilities) then result:=result||'{"authorizations":[]}'; end if;
  return result;
end;
$$;


reset role;
revoke create on schema public from registry_writer;

revoke all on function public.submit_unit_join_request(text,jsonb,uuid,uuid),public.my_unit_join_requests(),
  public.cancel_unit_join_request(uuid,uuid) from public,anon,service_role;
grant execute on function public.submit_unit_join_request(text,jsonb,uuid,uuid),public.my_unit_join_requests(),
  public.cancel_unit_join_request(uuid,uuid) to authenticated;
grant create on schema public to registry_writer;
alter function public.submit_unit_join_request(text,jsonb,uuid,uuid) owner to registry_writer;
alter function public.my_unit_join_requests() owner to registry_writer;
alter function public.cancel_unit_join_request(uuid,uuid) owner to registry_writer;
revoke create on schema public from registry_writer;
notify pgrst,'reload schema';
