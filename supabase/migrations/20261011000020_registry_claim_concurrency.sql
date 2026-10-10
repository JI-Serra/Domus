-- M02-F03: handle concurrent canonical claims without a holder-visible uniqueness oracle.
alter table public.person add constraint person_created_by_user_id_fkey foreign key(person_created_by_user_id) references auth.users(id);
create index person_person_created_by_user_id_idx on public.person(person_created_by_user_id);
grant create on schema public to registry_writer;
set role registry_writer;
create or replace function public.save_resident(target_tenant_id uuid,target_unit_id uuid,person_data jsonb,resident_data jsonb,client_event_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target_person public.person; resident public.unit_resident; receipt jsonb;
  payload jsonb:=jsonb_build_array(target_unit_id,person_data,resident_data);
  registry_admin boolean; selected_person uuid; document_type public.person_document_type; document_number text; email text;
  matches uuid[]; prior_minor boolean;
begin
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  registry_admin:=target_tenant_id in(select app_private.writable_permission_tenant_ids('registry'));
  receipt:=app_private.registry_retry(client_event_id,target_tenant_id,'save_resident',payload);
  if receipt is not null then return (receipt->>'id')::uuid; end if;
  if jsonb_typeof(person_data) is distinct from 'object' or jsonb_typeof(resident_data) is distinct from 'object'
    or length(btrim(coalesce(person_data->>'person_first_name',''))) not between 1 and 100
    or length(btrim(coalesce(person_data->>'person_last_name',''))) not between 1 and 100
    or person_data ?| array['user_id','person_created_by_user_id','person_claimed_email','person_claimed_document_number','person_claimed_document_type']
    or resident_data ? 'membership_role' then raise exception 'Invalid registry input' using errcode='22023'; end if;
  perform 1 from public.unit where tenant_id=target_tenant_id and unit_id=target_unit_id and unit_archived_at is null for update;
  if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
  document_type:=nullif(person_data->>'person_document_type','')::public.person_document_type;
  document_number:=nullif(btrim(person_data->>'person_document_number'),''); email:=lower(nullif(btrim(person_data->>'person_email'),''));
  if (document_type is null)<>(document_number is null) then raise exception 'Invalid registry input' using errcode='22023'; end if;
  if not registry_admin and coalesce((resident_data->>'unit_resident_is_holder')::boolean,false) then
    raise exception 'Holder grant denied' using errcode='42501'; end if;
  selected_person:=nullif(person_data->>'person_id','')::uuid;
  if selected_person is null then
    select array_agg(p.person_id) into matches from public.person p where p.tenant_id=target_tenant_id
      and (registry_admin or exists(select 1 from public.unit_resident r where r.tenant_id=target_tenant_id and r.unit_id=target_unit_id and r.person_id=p.person_id))
      and ((document_number is not null and coalesce(p.person_claimed_document_type,p.person_document_type)=document_type
        and coalesce(p.person_claimed_document_number,p.person_document_number)=document_number)
        or (email is not null and coalesce(p.person_claimed_email,p.person_email)=email));
    if cardinality(matches)>1 then raise exception 'Person identity conflict' using errcode='23514'; end if;
    selected_person:=matches[1];
  end if;
  if selected_person is not null then
    -- Holder edits are restricted to their own created, unbound household members, including ended residences.
    if not registry_admin and not exists(select 1 from public.unit_resident r join public.person p using(tenant_id,person_id)
      where r.tenant_id=target_tenant_id and r.unit_id=target_unit_id and r.person_id=selected_person
        and not r.unit_resident_is_holder and p.user_id is null and p.person_created_by_user_id=app_private.current_user_id()
        and not exists(select 1 from public.unit_resident other where other.tenant_id=target_tenant_id and other.person_id=p.person_id and other.unit_id<>target_unit_id)) then
      raise exception 'Registry management denied' using errcode='42501'; end if;
    select p.* into target_person from public.person p where p.tenant_id=target_tenant_id and p.person_id=selected_person for update;
    if not found then raise exception 'Registry management denied' using errcode='42501'; end if;
    if target_person.user_id=app_private.current_user_id() and (resident_data ? 'unit_resident_is_holder' or resident_data ? 'unit_resident_valid_to_at') then
      raise exception 'Self role change denied' using errcode='42501'; end if;
    select r.unit_resident_is_minor into prior_minor from public.unit_resident r where r.tenant_id=target_tenant_id and r.unit_id=target_unit_id and r.person_id=selected_person;
    if not registry_admin and (prior_minor or app_private.resident_is_minor(target_person,false))
      and (not coalesce((resident_data->>'unit_resident_is_minor')::boolean,false)
        or nullif(person_data->>'person_birth_date','')::date is distinct from target_person.person_birth_date) then
      raise exception 'Registry management denied' using errcode='42501'; end if;
    if not registry_admin and exists(select 1 from public.invitation i where i.tenant_id=target_tenant_id and i.person_id=selected_person
      and i.invitation_status in('pending','accepted')) then raise exception 'Registry management denied' using errcode='42501'; end if;
  else
    insert into public.person(tenant_id,person_first_name,person_last_name,person_created_by_user_id)
      values(target_tenant_id,btrim(person_data->>'person_first_name'),btrim(person_data->>'person_last_name'),app_private.current_user_id()) returning * into target_person;
  end if;
  -- Serialize natural-key verification without reporting other households' matches to holders.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:'||target_tenant_id::text,0));
  if registry_admin and exists(select 1 from public.person p where p.tenant_id=target_tenant_id and p.person_id<>target_person.person_id
    and ((p.person_document_type=document_type and p.person_document_number=document_number) or p.person_email=email)) then
    raise exception 'Person identity conflict' using errcode='23514'; end if;
  begin
  update public.person set person_first_name=btrim(person_data->>'person_first_name'),person_last_name=btrim(person_data->>'person_last_name'),
    person_document_type=case when registry_admin or not exists(select 1 from public.person p where p.tenant_id=target_tenant_id and p.person_id<>target_person.person_id
      and p.person_document_type=document_type and p.person_document_number=document_number) then document_type end,
    person_document_number=case when registry_admin or not exists(select 1 from public.person p where p.tenant_id=target_tenant_id and p.person_id<>target_person.person_id
      and p.person_document_type=document_type and p.person_document_number=document_number) then document_number end,
    person_email=case when registry_admin or not exists(select 1 from public.person p where p.tenant_id=target_tenant_id and p.person_id<>target_person.person_id and p.person_email=email) then email end,
    person_claimed_document_type=case when not registry_admin then document_type end,
    person_claimed_document_number=case when not registry_admin then document_number end,
    person_claimed_email=case when not registry_admin then email end,
    person_phone=nullif(person_data->>'person_phone',''),person_birth_date=nullif(person_data->>'person_birth_date','')::date
    where tenant_id=target_tenant_id and person_id=target_person.person_id returning * into target_person;
  exception when unique_violation then
    if registry_admin then raise exception 'Person identity conflict' using errcode='23514'; end if;
    -- Import/direct registry writes may race verification; preserve the holder's exact same visible claim.
    update public.person set person_first_name=btrim(person_data->>'person_first_name'),person_last_name=btrim(person_data->>'person_last_name'),
      person_document_type=null,person_document_number=null,person_email=null,
      person_claimed_document_type=document_type,person_claimed_document_number=document_number,person_claimed_email=email,
      person_phone=nullif(person_data->>'person_phone',''),person_birth_date=nullif(person_data->>'person_birth_date','')::date
      where tenant_id=target_tenant_id and person_id=target_person.person_id returning * into target_person;
  end;
  insert into public.unit_resident(tenant_id,unit_id,person_id,unit_resident_relationship,unit_resident_is_holder,unit_resident_is_minor,unit_resident_valid_from_at,unit_resident_valid_to_at)
  values(target_tenant_id,target_unit_id,target_person.person_id,coalesce((resident_data->>'unit_resident_relationship')::public.unit_resident_relationship,'other'),
    coalesce((resident_data->>'unit_resident_is_holder')::boolean,false),
    app_private.resident_is_minor(target_person,coalesce((resident_data->>'unit_resident_is_minor')::boolean,false)),
    coalesce((resident_data->>'unit_resident_valid_from_at')::timestamptz,now()),(resident_data->>'unit_resident_valid_to_at')::timestamptz)
  on conflict(tenant_id,unit_id,person_id) do update set unit_resident_relationship=excluded.unit_resident_relationship,
    unit_resident_is_holder=excluded.unit_resident_is_holder,unit_resident_is_minor=excluded.unit_resident_is_minor,
    unit_resident_valid_from_at=excluded.unit_resident_valid_from_at,unit_resident_valid_to_at=excluded.unit_resident_valid_to_at returning * into resident;
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
reset role;
revoke create on schema public from registry_writer;
