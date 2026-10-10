-- M02-F03/F08: holder plate claims and uniform household projections.
grant create on schema public to registry_writer;
set role registry_writer;
create or replace function public.save_vehicle(target_tenant_id uuid,target_unit_id uuid,vehicle_data jsonb,client_event_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target_id uuid; receipt jsonb; payload jsonb:=jsonb_build_array(target_unit_id,vehicle_data);
  plate text; verified boolean; registry_admin boolean;
begin
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  receipt:=app_private.registry_retry(client_event_id,target_tenant_id,'save_vehicle',payload);
  if receipt is not null then return (receipt->>'id')::uuid; end if;
  if jsonb_typeof(vehicle_data) is distinct from 'object' or vehicle_data ? 'vehicle_is_verified' then
    raise exception 'Invalid registry input' using errcode='22023'; end if;
  perform 1 from public.unit where tenant_id=target_tenant_id and unit_id=target_unit_id and unit_archived_at is null;
  if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
  target_id:=(vehicle_data->>'vehicle_id')::uuid;
  if target_id is not null then
    perform 1 from public.vehicle where tenant_id=target_tenant_id and unit_id=target_unit_id and vehicle_id=target_id for update;
    if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
  end if;
  plate:=regexp_replace(upper(vehicle_data->>'vehicle_plate_code'),'[^A-Z0-9]','','g');
  registry_admin:=target_tenant_id in(select app_private.writable_permission_tenant_ids('registry'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('plate:'||target_tenant_id::text||':'||plate,0));
  verified:=not exists(select 1 from public.vehicle v where v.tenant_id=target_tenant_id and v.vehicle_plate_code=plate
    and v.vehicle_archived_at is null and v.vehicle_is_verified and v.vehicle_id is distinct from target_id);
  if registry_admin and not verified and vehicle_data->>'vehicle_archived_at' is null then
    raise exception 'Registry management denied' using errcode='42501'; end if;
  if target_id is null then
    insert into public.vehicle(tenant_id,unit_id,vehicle_plate_code,vehicle_make_name,vehicle_model_name,vehicle_color_name,vehicle_is_verified)
      values(target_tenant_id,target_unit_id,plate,vehicle_data->>'vehicle_make_name',vehicle_data->>'vehicle_model_name',vehicle_data->>'vehicle_color_name',verified)
      returning vehicle_id into target_id;
  else
    update public.vehicle set vehicle_plate_code=plate,vehicle_make_name=vehicle_data->>'vehicle_make_name',vehicle_model_name=vehicle_data->>'vehicle_model_name',
      vehicle_color_name=vehicle_data->>'vehicle_color_name',vehicle_archived_at=(vehicle_data->>'vehicle_archived_at')::timestamptz,vehicle_is_verified=verified
      where tenant_id=target_tenant_id and unit_id=target_unit_id and vehicle_id=target_id;
  end if;
  perform app_private.registry_finish(client_event_id,target_tenant_id,'save_vehicle',payload,jsonb_build_object('id',target_id)); return target_id;
exception when unique_violation then raise exception 'Registry management denied' using errcode='42501';
end;
$$;

create function public.registry_pending_verification(target_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_registry(target_tenant_id,false);
  return jsonb_build_object('people',(select coalesce(jsonb_agg(to_jsonb(p)-'user_id'),'[]') from public.person p
    where p.tenant_id=target_tenant_id and
      (p.person_claimed_document_number is distinct from p.person_document_number or p.person_claimed_email is distinct from p.person_email)
      and (p.person_claimed_document_number is not null or p.person_claimed_email is not null)),
    'vehicles',(select coalesce(jsonb_agg(to_jsonb(v)),'[]') from public.vehicle v where v.tenant_id=target_tenant_id and not v.vehicle_is_verified and v.vehicle_archived_at is null));
end;
$$;
revoke all on function public.registry_pending_verification(uuid) from public,anon,service_role;
grant execute on function public.registry_pending_verification(uuid) to authenticated;

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
    then case when registry_admin then to_jsonb(p)-'user_id' else
      (to_jsonb(p)-array['user_id','person_claimed_document_type','person_claimed_document_number','person_claimed_email','person_created_by_user_id'])
        ||jsonb_build_object('person_document_type',coalesce(p.person_claimed_document_type,p.person_document_type),
          'person_document_number',coalesce(p.person_claimed_document_number,p.person_document_number),'person_email',coalesce(p.person_claimed_email,p.person_email)) end
    else jsonb_build_object('person_first_name',p.person_first_name,'person_last_name',p.person_last_name) end
    order by r.unit_resident_is_holder desc,p.person_last_name,p.person_first_name),'[]') into residents
    from public.unit_resident r join public.person p using(tenant_id,person_id) where r.tenant_id=target_tenant_id and r.unit_id=target_unit_id;
  select coalesce(jsonb_agg(case when registry_admin then to_jsonb(v) else to_jsonb(v)-'vehicle_is_verified' end order by v.vehicle_plate_code),'[]') into vehicles from public.vehicle v
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
