-- M02-F01/F03/F05: RPC-only mutations, stable retry receipts and tenant/unit authorization before target lookup.
create function public.save_resident(target_tenant_id uuid,target_unit_id uuid,person_data jsonb,resident_data jsonb,client_event_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target_person public.person; resident public.unit_resident; receipt jsonb;
  payload jsonb:=jsonb_build_array(target_unit_id,person_data,resident_data);
  registry_admin boolean; selected_person uuid; document_type public.person_document_type; document_number text; email text;
begin
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  registry_admin:=target_tenant_id in(select app_private.writable_permission_tenant_ids('registry'));
  receipt:=app_private.registry_retry(client_event_id,target_tenant_id,'save_resident',payload);
  if receipt is not null then return (receipt->>'id')::uuid; end if;
  if jsonb_typeof(person_data) is distinct from 'object' or jsonb_typeof(resident_data) is distinct from 'object'
    or length(btrim(coalesce(person_data->>'person_first_name',''))) not between 1 and 100
    or length(btrim(coalesce(person_data->>'person_last_name',''))) not between 1 and 100
    or person_data ? 'user_id' or resident_data ? 'membership_role' then
    raise exception 'Invalid registry input' using errcode='22023'; end if;
  perform 1 from public.unit where tenant_id=target_tenant_id and unit_id=target_unit_id and unit_archived_at is null for update;
  if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
  document_type:=nullif(person_data->>'person_document_type','')::public.person_document_type;
  document_number:=nullif(btrim(person_data->>'person_document_number'),''); email:=lower(nullif(btrim(person_data->>'person_email'),''));
  selected_person:=nullif(person_data->>'person_id','')::uuid;
  if selected_person is null then
    select p.person_id into selected_person from public.person p where p.tenant_id=target_tenant_id
      and ((document_number is not null and p.person_document_type=document_type and p.person_document_number=document_number)
        or (email is not null and p.person_email=email)) order by person_id limit 1;
  end if;
  if selected_person is not null then
    -- Holders cannot recruit/edit other households, promote a holder, or modify their own role.
    if not registry_admin and not exists(select 1 from public.unit_resident r join public.person p using(tenant_id,person_id)
      where r.tenant_id=target_tenant_id and r.unit_id=target_unit_id and r.person_id=selected_person
        and not r.unit_resident_is_holder and p.user_id is distinct from app_private.current_user_id()
        and not exists(select 1 from public.unit_resident other where other.person_id=p.person_id and other.unit_id<>target_unit_id)) then
      raise exception 'Registry management denied' using errcode='42501'; end if;
    select p.* into target_person from public.person p where p.tenant_id=target_tenant_id and p.person_id=selected_person for update;
    if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
    if target_person.user_id=app_private.current_user_id() and (resident_data ? 'unit_resident_is_holder' or resident_data ? 'unit_resident_valid_to_at') then
      raise exception 'Self role change denied' using errcode='42501'; end if;
    update public.person set person_first_name=btrim(person_data->>'person_first_name'),person_last_name=btrim(person_data->>'person_last_name'),
      person_document_type=document_type,person_document_number=document_number,person_email=email,
      person_phone=nullif(person_data->>'person_phone',''),person_birth_date=nullif(person_data->>'person_birth_date','')::date
      where tenant_id=target_tenant_id and person_id=selected_person returning * into target_person;
  else
    insert into public.person(tenant_id,person_first_name,person_last_name,person_document_type,person_document_number,person_email,person_phone,person_birth_date)
      values(target_tenant_id,btrim(person_data->>'person_first_name'),btrim(person_data->>'person_last_name'),document_type,document_number,email,
        nullif(person_data->>'person_phone',''),nullif(person_data->>'person_birth_date','')::date) returning * into target_person;
  end if;
  if not registry_admin and coalesce((resident_data->>'unit_resident_is_holder')::boolean,false) then
    raise exception 'Holder grant denied' using errcode='42501'; end if;
  insert into public.unit_resident(tenant_id,unit_id,person_id,unit_resident_relationship,unit_resident_is_holder,unit_resident_is_minor,unit_resident_valid_from_at,unit_resident_valid_to_at)
  values(target_tenant_id,target_unit_id,target_person.person_id,coalesce((resident_data->>'unit_resident_relationship')::public.unit_resident_relationship,'other'),
    coalesce((resident_data->>'unit_resident_is_holder')::boolean,false),
    app_private.resident_is_minor(target_person,coalesce((resident_data->>'unit_resident_is_minor')::boolean,false)),
    coalesce((resident_data->>'unit_resident_valid_from_at')::timestamptz,now()),(resident_data->>'unit_resident_valid_to_at')::timestamptz)
  on conflict(tenant_id,unit_id,person_id) do update set unit_resident_relationship=excluded.unit_resident_relationship,
    unit_resident_is_holder=excluded.unit_resident_is_holder,unit_resident_is_minor=excluded.unit_resident_is_minor,
    unit_resident_valid_from_at=excluded.unit_resident_valid_from_at,unit_resident_valid_to_at=excluded.unit_resident_valid_to_at returning * into resident;
  -- Ending residence or making a person a minor invalidates their existing unit roles on the next request.
  update public.membership set membership_status='revoked' where tenant_id=target_tenant_id and unit_id=target_unit_id
    and person_id=target_person.person_id and membership_status='active' and
    (resident.unit_resident_is_minor or resident.unit_resident_valid_from_at>now() or resident.unit_resident_valid_to_at<=now()
      or (membership_role='unit_holder' and not resident.unit_resident_is_holder));
  update public.membership set membership_valid_to=resident.unit_resident_valid_to_at
    where tenant_id=target_tenant_id and unit_id=target_unit_id and person_id=target_person.person_id and membership_status='active';
  perform app_private.registry_finish(client_event_id,target_tenant_id,'save_resident',payload,jsonb_build_object('id',resident.unit_resident_id));
  return resident.unit_resident_id;
end;
$$;

create function public.save_unit(target_tenant_id uuid,unit_data jsonb,client_event_id uuid,residents jsonb default '[]') returns uuid
language plpgsql security definer set search_path='' as $$
declare target_unit uuid; receipt jsonb; entry jsonb; row_number integer:=0;
  payload jsonb:=jsonb_build_array(unit_data,residents);
begin
  perform app_private.require_registry(target_tenant_id);
  receipt:=app_private.registry_retry(client_event_id,target_tenant_id,'save_unit',payload);
  if receipt is not null then return (receipt->>'id')::uuid; end if;
  if jsonb_typeof(unit_data) is distinct from 'object' or jsonb_typeof(residents) is distinct from 'array'
    or length(btrim(coalesce(unit_data->>'unit_code',''))) not between 1 and 100 or jsonb_array_length(residents)>100 then
    raise exception 'Invalid registry input' using errcode='22023'; end if;
  target_unit:=nullif(unit_data->>'unit_id','')::uuid;
  if target_unit is not null then
    perform 1 from public.unit where tenant_id=target_tenant_id and unit_id=target_unit for update;
    if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
    update public.unit set unit_code=btrim(unit_data->>'unit_code'),unit_block_code=nullif(unit_data->>'unit_block_code',''),
      unit_lot_number=nullif(unit_data->>'unit_lot_number',''),unit_status=coalesce((unit_data->>'unit_status')::public.unit_status,'vacant'),
      unit_coefficient=coalesce((unit_data->>'unit_coefficient')::numeric,1),unit_is_billable=(unit_data->>'unit_is_billable')::boolean,
      unit_contact_phone=nullif(unit_data->>'unit_contact_phone',''),unit_backup_phone=nullif(unit_data->>'unit_backup_phone','')
      where tenant_id=target_tenant_id and unit_id=target_unit;
  else
    insert into public.unit(tenant_id,unit_code,unit_block_code,unit_lot_number,unit_status,unit_coefficient,unit_is_billable,unit_contact_phone,unit_backup_phone)
      values(target_tenant_id,btrim(unit_data->>'unit_code'),nullif(unit_data->>'unit_block_code',''),nullif(unit_data->>'unit_lot_number',''),
        coalesce((unit_data->>'unit_status')::public.unit_status,'vacant'),coalesce((unit_data->>'unit_coefficient')::numeric,1),
        (unit_data->>'unit_is_billable')::boolean,nullif(unit_data->>'unit_contact_phone',''),nullif(unit_data->>'unit_backup_phone','')) returning unit_id into target_unit;
  end if;
  for entry in select value from jsonb_array_elements(residents) loop
    row_number:=row_number+1;
    perform public.save_resident(target_tenant_id,target_unit,entry->'person',entry->'resident',
      extensions.uuid_generate_v5(client_event_id,row_number::text));
  end loop;
  set constraints public.validate_occupied_unit immediate;
  set constraints public.validate_occupied_unit deferred;
  perform app_private.registry_finish(client_event_id,target_tenant_id,'save_unit',payload,jsonb_build_object('id',target_unit));
  return target_unit;
end;
$$;
create function public.archive_unit(target_tenant_id uuid,target_unit_id uuid,client_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.require_registry(target_tenant_id);
  if app_private.registry_retry(client_event_id,target_tenant_id,'archive_unit',to_jsonb(target_unit_id)) is not null then return; end if;
  update public.unit set unit_archived_at=statement_timestamp() where tenant_id=target_tenant_id and unit_id=target_unit_id and unit_archived_at is null;
  if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
  update public.membership set membership_status='revoked' where tenant_id=target_tenant_id and unit_id=target_unit_id and membership_status='active';
  update public.invitation set invitation_status='revoked' where tenant_id=target_tenant_id and unit_id=target_unit_id and invitation_status='pending';
  delete from public.unit_join_code where tenant_id=target_tenant_id and unit_id=target_unit_id;
  perform app_private.registry_finish(client_event_id,target_tenant_id,'archive_unit',to_jsonb(target_unit_id),'{}');
end;
$$;
create function public.billable_unit_count(target_tenant_id uuid) returns bigint
language plpgsql stable security definer set search_path='' as $$
begin
  if not app_private.is_platform_admin() and target_tenant_id not in(select app_private.role_tenant_ids(array['tenant_admin']::public.membership_role[])) then
    raise exception 'Billing count denied' using errcode='42501'; end if;
  return(select count(*) from public.unit u join public.tenant t using(tenant_id) where u.tenant_id=target_tenant_id
    and u.unit_archived_at is null and coalesce(u.unit_is_billable,u.unit_status=any(t.tenant_billable_unit_statuses)));
end;
$$;

create function public.save_vehicle(target_tenant_id uuid,target_unit_id uuid,vehicle_data jsonb,client_event_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target_id uuid; receipt jsonb; payload jsonb:=jsonb_build_array(target_unit_id,vehicle_data);
begin
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  receipt:=app_private.registry_retry(client_event_id,target_tenant_id,'save_vehicle',payload);
  if receipt is not null then return (receipt->>'id')::uuid; end if;
  if jsonb_typeof(vehicle_data) is distinct from 'object' then raise exception 'Invalid registry input' using errcode='22023'; end if;
  perform 1 from public.unit where tenant_id=target_tenant_id and unit_id=target_unit_id and unit_archived_at is null;
  if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
  target_id:=(vehicle_data->>'vehicle_id')::uuid;
  if target_id is null then
    insert into public.vehicle(tenant_id,unit_id,vehicle_plate_code,vehicle_make_name,vehicle_model_name,vehicle_color_name)
      values(target_tenant_id,target_unit_id,regexp_replace(upper(vehicle_data->>'vehicle_plate_code'),'[^A-Z0-9]','','g'),
        vehicle_data->>'vehicle_make_name',vehicle_data->>'vehicle_model_name',vehicle_data->>'vehicle_color_name') returning vehicle_id into target_id;
  else
    update public.vehicle set vehicle_plate_code=regexp_replace(upper(vehicle_data->>'vehicle_plate_code'),'[^A-Z0-9]','','g'),
      vehicle_make_name=vehicle_data->>'vehicle_make_name',vehicle_model_name=vehicle_data->>'vehicle_model_name',vehicle_color_name=vehicle_data->>'vehicle_color_name',
      vehicle_archived_at=(vehicle_data->>'vehicle_archived_at')::timestamptz where tenant_id=target_tenant_id and unit_id=target_unit_id and vehicle_id=target_id;
    if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
  end if;
  perform app_private.registry_finish(client_event_id,target_tenant_id,'save_vehicle',payload,jsonb_build_object('id',target_id)); return target_id;
end;
$$;
create function public.save_pet(target_tenant_id uuid,target_unit_id uuid,pet_data jsonb,client_event_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target_id uuid; receipt jsonb; payload jsonb:=jsonb_build_array(target_unit_id,pet_data);
begin
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  receipt:=app_private.registry_retry(client_event_id,target_tenant_id,'save_pet',payload);
  if receipt is not null then return (receipt->>'id')::uuid; end if;
  if jsonb_typeof(pet_data) is distinct from 'object' then raise exception 'Invalid registry input' using errcode='22023'; end if;
  perform 1 from public.unit where tenant_id=target_tenant_id and unit_id=target_unit_id and unit_archived_at is null;
  if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
  target_id:=(pet_data->>'pet_id')::uuid;
  if target_id is null then
    insert into public.pet(tenant_id,unit_id,pet_name,pet_species_name,pet_breed_name,pet_photo_path)
      values(target_tenant_id,target_unit_id,pet_data->>'pet_name',pet_data->>'pet_species_name',pet_data->>'pet_breed_name',pet_data->>'pet_photo_path') returning pet_id into target_id;
  else
    update public.pet set pet_name=pet_data->>'pet_name',pet_species_name=pet_data->>'pet_species_name',pet_breed_name=pet_data->>'pet_breed_name',
      pet_photo_path=pet_data->>'pet_photo_path',pet_archived_at=(pet_data->>'pet_archived_at')::timestamptz
      where tenant_id=target_tenant_id and unit_id=target_unit_id and pet_id=target_id;
    if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
  end if;
  perform app_private.registry_finish(client_event_id,target_tenant_id,'save_pet',payload,jsonb_build_object('id',target_id)); return target_id;
end;
$$;
create function public.set_household_permissions(target_tenant_id uuid,target_unit_id uuid,target_membership_id uuid,
  permissions public.household_permission[],client_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare payload jsonb:=jsonb_build_array(target_unit_id,target_membership_id,permissions);
begin
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  if app_private.registry_retry(client_event_id,target_tenant_id,'set_household_permissions',payload) is not null then return; end if;
  perform 1 from public.membership m join public.person p using(tenant_id,person_id)
    join public.unit_resident r using(tenant_id,unit_id,person_id)
    where m.tenant_id=target_tenant_id and m.unit_id=target_unit_id and m.membership_id=target_membership_id
      and m.membership_role='household_member' and m.membership_status='active' and m.membership_valid_from<=now()
      and (m.membership_valid_to is null or now()<m.membership_valid_to)
      and p.user_id is distinct from app_private.current_user_id() and not app_private.resident_is_minor(p,r.unit_resident_is_minor)
      and r.unit_resident_valid_from_at<=now() and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at) for update of m;
  if not found then raise exception 'Household delegation denied' using errcode='42501'; end if;
  if permissions is null or array_position(permissions,null) is not null then raise exception 'Invalid household permissions' using errcode='22023'; end if;
  delete from public.membership_household_permission where tenant_id=target_tenant_id and membership_id=target_membership_id;
  insert into public.membership_household_permission(tenant_id,membership_id,membership_household_permission_permission)
    select target_tenant_id,target_membership_id,p from(select distinct unnest(permissions) p) selected;
  perform app_private.registry_finish(client_event_id,target_tenant_id,'set_household_permissions',payload,'{}');
end;
$$;
create function public.current_household_permissions(target_tenant_id uuid,target_unit_id uuid) returns public.household_permission[]
language plpgsql stable security definer set search_path='' as $$
begin
  if target_tenant_id not in(select app_private.member_tenant_ids()) or target_unit_id not in(select app_private.household_unit_ids()) then
    raise exception 'Household read denied' using errcode='42501'; end if;
  return array(select p from unnest(enum_range(null::public.household_permission)) p
    where target_unit_id in(select app_private.household_permission_unit_ids(p)));
end;
$$;
