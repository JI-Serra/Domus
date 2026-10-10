-- M02-F08: safe unit sheet and tenant-scoped global registry search.
create function public.search_registry(target_tenant_id uuid,search text,result_limit integer default 50)
returns table(entity_kind text,entity_id uuid,unit_id uuid,unit_code text,display_name text,email text,plate_code text)
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare pattern text;
begin
  perform app_private.require_registry(target_tenant_id,false);
  if search is null or length(btrim(search)) not between 1 and 100 or result_limit is null or result_limit not between 1 and 100 then
    raise exception 'Invalid registry search' using errcode='22023'; end if;
  pattern:='%'||replace(replace(replace(btrim(search),'\','\\'),'%','\%'),'_','\_')||'%';
  return query
    select * from (
      select 'unit'::text entity_kind,u.unit_id entity_id,u.unit_id,u.unit_code,u.unit_code display_name,null::text email,null::text plate_code
        from public.unit u where u.tenant_id=target_tenant_id and u.unit_archived_at is null and u.unit_code ilike pattern escape '\'
      union all
      select 'person',p.person_id,u.unit_id,u.unit_code,p.person_first_name||' '||p.person_last_name,p.person_email,null::text
        from public.person p left join public.unit_resident r on(r.tenant_id,r.person_id)=(p.tenant_id,p.person_id)
          and r.unit_resident_valid_from_at<=now() and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at)
        left join public.unit u on(u.tenant_id,u.unit_id)=(r.tenant_id,r.unit_id) and u.unit_archived_at is null
        where p.tenant_id=target_tenant_id and ((p.person_first_name||' '||p.person_last_name) ilike pattern escape '\' or p.person_email ilike pattern escape '\')
      union all
      select 'vehicle',v.vehicle_id,u.unit_id,u.unit_code,v.vehicle_plate_code,null::text,v.vehicle_plate_code
        from public.vehicle v join public.unit u using(tenant_id,unit_id) where v.tenant_id=target_tenant_id
          and v.vehicle_archived_at is null and u.unit_archived_at is null and v.vehicle_plate_code ilike pattern escape '\'
    ) results order by unit_code,entity_kind,entity_id limit result_limit;
end;
$$;
create function public.unit_sheet(target_tenant_id uuid,target_unit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare registry_admin boolean; holder boolean; target public.unit; residents jsonb; vehicles jsonb; pets jsonb;
  memberships jsonb:='[]'; invitations jsonb:='[]'; requests jsonb:='[]'; capabilities public.household_permission[]; result jsonb;
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
    'pending_invitations',invitations,'pending_join_requests',requests,'permissions',capabilities,'movements','[]'::jsonb);
  if 'view_unit_finance'=any(capabilities) then result:=result||'{"balance":null}'; end if;
  if 'manage_access_authorizations'=any(capabilities) then result:=result||'{"authorizations":[]}'; end if;
  return result;
end;
$$;

-- Every new application RPC has an explicit ACL. Only billable count keeps platform metadata authority;
-- other readers may use the isolated writer's SELECT policies, but always authorize through the central identity.
do $$ declare f record; begin
  for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname in
    ('save_resident','save_unit','archive_unit','billable_unit_count','save_vehicle','save_pet','set_household_permissions',
     'current_household_permissions','create_resident_invitation','mark_resident_invitation_delivered','revoke_resident_invitation',
     'rotate_unit_join_code','submit_unit_join_request','decide_unit_join_request','save_gate','assign_guard_gate','create_device_pairing',
     'redeem_device_pairing','sync_device','revoke_device','guard_registry','guard_backup_contact','create_registry_import',
     'preview_registry_import','confirm_registry_import','search_registry','unit_sheet') loop
    execute format('revoke all on function %s from public,anon,service_role',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
    if f.proname<>'billable_unit_count' then
      grant create on schema public to registry_writer;
      execute format('alter function %s owner to registry_writer',f.signature);
      revoke create on schema public from registry_writer;
    end if;
  end loop;
end $$;
-- Helpers required by trigger execution under the two exclusive capabilities.
grant execute on function app_private.is_platform_admin() to registry_writer;
grant execute on function app_private.enforce_tenant_writes() to registry_writer;
comment on table public.membership is 'Optional unit_id for unit_holder and household_member; unit-bound roles require an eligible adult resident.';
do $$ declare table_name text; begin
  foreach table_name in array array['unit','unit_resident','membership_household_permission','vehicle','pet','unit_join_code',
    'unit_join_request','gate','gate_guard','device','device_pairing','registry_import','registry_import_row'] loop
    execute format('comment on table public.%I is %L',table_name,
      'M02 registry. Audit redaction declared by app_private.audit_redacted_columns; RPC-only client writes.');
  end loop;
end $$;
