-- M02-F02: flat, canonical import rows; all errors are field/code identifiers, never duplicated PII.
create function app_private.registry_import_row_errors(row_data jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare errors jsonb:='[]'; key text; value jsonb; has_person boolean; birthday date;
  allowed text[]:=array['unit_code','unit_block_code','unit_lot_number','unit_status','unit_coefficient','unit_is_billable','unit_contact_phone','unit_backup_phone',
    'person_first_name','person_last_name','person_document_type','person_document_number','person_email','person_phone','person_birth_date',
    'unit_resident_relationship','unit_resident_is_holder','unit_resident_is_minor'];
begin
  if jsonb_typeof(row_data) is distinct from 'object' then return '["row_object_required"]'; end if;
  for key,value in select * from jsonb_each(row_data) loop
    if not key=any(allowed) then errors:=errors||jsonb_build_array('unknown_field');
    elsif value<>'null' and key in('unit_coefficient') then
      if jsonb_typeof(value)<>'number' then errors:=errors||jsonb_build_array(key||'_invalid'); end if;
    elsif value<>'null' and key in('unit_is_billable','unit_resident_is_holder','unit_resident_is_minor') then
      if jsonb_typeof(value)<>'boolean' then errors:=errors||jsonb_build_array(key||'_invalid'); end if;
    elsif value<>'null' and jsonb_typeof(value)<>'string' then errors:=errors||jsonb_build_array(key||'_invalid'); end if;
  end loop;
  if length(btrim(coalesce(row_data->>'unit_code',''))) not between 1 and 100 then errors:=errors||'"unit_code_required"'::jsonb; end if;
  if coalesce(row_data->>'unit_status','vacant') not in('vacant','occupied','under_construction') then errors:=errors||'"unit_status_invalid"'::jsonb; end if;
  if row_data ? 'unit_coefficient' and (jsonb_typeof(row_data->'unit_coefficient')<>'number'
    or (row_data->>'unit_coefficient')::numeric<=0 or (row_data->>'unit_coefficient')::numeric>=100000000) then errors:=errors||'"unit_coefficient_invalid"'::jsonb; end if;
  foreach key in array array['unit_block_code','unit_lot_number'] loop
    if length(row_data->>key)>100 then errors:=errors||jsonb_build_array(key||'_invalid'); end if;
  end loop;
  foreach key in array array['unit_contact_phone','unit_backup_phone','person_phone'] loop
    if row_data->>key is not null and length(row_data->>key) not between 1 and 32 then errors:=errors||jsonb_build_array(key||'_invalid'); end if;
  end loop;
  has_person:=row_data->>'person_first_name' is not null or row_data->>'person_last_name' is not null
    or row_data->>'person_email' is not null or row_data->>'person_document_number' is not null;
  if has_person then
    if length(btrim(coalesce(row_data->>'person_first_name',''))) not between 1 and 100 then errors:=errors||'"person_first_name_required"'::jsonb; end if;
    if length(btrim(coalesce(row_data->>'person_last_name',''))) not between 1 and 100 then errors:=errors||'"person_last_name_required"'::jsonb; end if;
    if row_data->>'person_email' is null and row_data->>'person_document_number' is null then errors:=errors||'"person_identity_required"'::jsonb; end if;
  end if;
  if (row_data->>'person_document_type' is null)<>(row_data->>'person_document_number' is null)
    or (row_data->>'person_document_type' is not null and row_data->>'person_document_type' not in('dni','passport','other'))
    or (row_data->>'person_document_number' is not null and length(btrim(row_data->>'person_document_number')) not between 1 and 32) then errors:=errors||'"person_document_invalid"'::jsonb; end if;
  if row_data->>'person_email' is not null and btrim(row_data->>'person_email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then errors:=errors||'"person_email_invalid"'::jsonb; end if;
  if coalesce(row_data->>'unit_resident_relationship','other') not in('owner','tenant','family','other') then errors:=errors||'"unit_resident_relationship_invalid"'::jsonb; end if;
  if row_data->>'person_birth_date' is not null then
    if row_data->>'person_birth_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then errors:=errors||'"person_birth_date_invalid"'::jsonb;
    else birthday:=(row_data->>'person_birth_date')::date;
      if birthday>current_date then errors:=errors||'"person_birth_date_invalid"'::jsonb; end if;
    end if;
  end if;
  if coalesce((row_data->>'unit_resident_is_holder')::boolean,false)
    and (not has_person or coalesce((row_data->>'unit_resident_is_minor')::boolean,false) or birthday>(current_date-interval '18 years')::date) then
    errors:=errors||'"holder_requires_adult_person"'::jsonb; end if;
  return errors;
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  return errors||'"invalid_value"'::jsonb;
end;
$$;
create function app_private.normalize_registry_import_row(row_data jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select coalesce(jsonb_object_agg(key,case when jsonb_typeof(value)='string' then
    to_jsonb(case when key='person_email' then lower(btrim(value#>>'{}')) else btrim(value#>>'{}') end) else value end),'{}')
    ||jsonb_build_object('unit_status',coalesce(row_data->>'unit_status','vacant'),'unit_coefficient',coalesce(row_data->'unit_coefficient','1'),
      'unit_resident_relationship',coalesce(row_data->>'unit_resident_relationship','other'),
      'unit_resident_is_holder',coalesce(row_data->'unit_resident_is_holder','false'),'unit_resident_is_minor',coalesce(row_data->'unit_resident_is_minor','false'))
  from jsonb_each(row_data);
$$;
-- Batch validation includes natural-key conflicts, current registry state and the final occupied-unit invariant.
create function app_private.validate_registry_import(target_tenant_id uuid,target_import_id uuid) returns integer
language plpgsql set search_path='' as $$
declare count_errors integer;
begin
  update public.registry_import_row set registry_import_row_errors=app_private.registry_import_row_errors(registry_import_row_data)
    where tenant_id=target_tenant_id and registry_import_id=target_import_id
      and registry_import_row_errors is distinct from app_private.registry_import_row_errors(registry_import_row_data);
  with rows as materialized(select registry_import_row_data d from public.registry_import_row where tenant_id=target_tenant_id and registry_import_id=target_import_id),
    conflicts as(select lower(d->>'unit_code') code from rows group by lower(d->>'unit_code') having count(distinct
      (d-array['unit_code','person_first_name','person_last_name','person_document_type','person_document_number','person_email','person_phone','person_birth_date',
        'unit_resident_relationship','unit_resident_is_holder','unit_resident_is_minor']))>1)
  update public.registry_import_row r set registry_import_row_errors=registry_import_row_errors||'"unit_rows_conflict"'::jsonb
    where r.tenant_id=target_tenant_id and r.registry_import_id=target_import_id and lower(r.registry_import_row_data->>'unit_code') in(select code from conflicts);
  with rows as materialized(select registry_import_row_data d from public.registry_import_row where tenant_id=target_tenant_id and registry_import_id=target_import_id),
    conflicts as(select coalesce((d->>'person_document_type')||':'||(d->>'person_document_number'),'email:'||(d->>'person_email')) identity_code
      from rows where d->>'person_first_name' is not null group by 1 having count(distinct
        (d-array['unit_code','unit_block_code','unit_lot_number','unit_status','unit_coefficient','unit_is_billable','unit_contact_phone','unit_backup_phone',
          'unit_resident_relationship','unit_resident_is_holder','unit_resident_is_minor']))>1)
  update public.registry_import_row r set registry_import_row_errors=registry_import_row_errors||'"person_rows_conflict"'::jsonb
    where r.tenant_id=target_tenant_id and r.registry_import_id=target_import_id
      and coalesce((r.registry_import_row_data->>'person_document_type')||':'||(r.registry_import_row_data->>'person_document_number'),'email:'||(r.registry_import_row_data->>'person_email')) in(select identity_code from conflicts);
  update public.registry_import_row r set registry_import_row_errors=registry_import_row_errors||'"person_identity_conflict"'::jsonb
    where r.tenant_id=target_tenant_id and r.registry_import_id=target_import_id and exists(
      select 1 from public.person p where p.tenant_id=target_tenant_id and
        ((p.person_document_type::text=r.registry_import_row_data->>'person_document_type' and p.person_document_number=r.registry_import_row_data->>'person_document_number')
          or p.person_email=r.registry_import_row_data->>'person_email') group by p.tenant_id having count(*)>1);
  with rows as materialized(select registry_import_row_data d from public.registry_import_row where tenant_id=target_tenant_id and registry_import_id=target_import_id),
    conflicts as(select d->>'person_email' email from rows where d->>'person_email' is not null group by 1
      having count(distinct coalesce((d->>'person_document_type')||':'||(d->>'person_document_number'),'email:'||(d->>'person_email')))>1)
  update public.registry_import_row r set registry_import_row_errors=registry_import_row_errors||'"person_identity_conflict"'::jsonb
    where r.tenant_id=target_tenant_id and r.registry_import_id=target_import_id and r.registry_import_row_data->>'person_email' in(select email from conflicts);
  with rows as materialized(select registry_import_row_data d from public.registry_import_row where tenant_id=target_tenant_id and registry_import_id=target_import_id),
    conflicts as(select lower(d->>'unit_code') code,
      coalesce((d->>'person_document_type')||':'||(d->>'person_document_number'),'email:'||(d->>'person_email')) identity_code
      from rows where d->>'person_first_name' is not null group by 1,2 having count(distinct
        jsonb_build_array(d->'unit_resident_relationship',d->'unit_resident_is_holder',d->'unit_resident_is_minor'))>1)
  update public.registry_import_row r set registry_import_row_errors=registry_import_row_errors||'"resident_rows_conflict"'::jsonb
    where r.tenant_id=target_tenant_id and r.registry_import_id=target_import_id and exists(select 1 from conflicts c
      where c.code=lower(r.registry_import_row_data->>'unit_code') and c.identity_code=
        coalesce((r.registry_import_row_data->>'person_document_type')||':'||(r.registry_import_row_data->>'person_document_number'),'email:'||(r.registry_import_row_data->>'person_email')));
  update public.registry_import_row r set registry_import_row_errors=registry_import_row_errors||'"unit_archived"'::jsonb
    where r.tenant_id=target_tenant_id and r.registry_import_id=target_import_id and exists(select 1 from public.unit u
      where u.tenant_id=target_tenant_id and lower(u.unit_code)=lower(r.registry_import_row_data->>'unit_code') and u.unit_archived_at is not null);
  update public.registry_import_row r set registry_import_row_errors=registry_import_row_errors||'"self_role_change"'::jsonb
    where r.tenant_id=target_tenant_id and r.registry_import_id=target_import_id and exists(
      select 1 from public.person p join public.unit_resident resident using(tenant_id,person_id) join public.unit u using(tenant_id,unit_id)
      where p.tenant_id=target_tenant_id and p.user_id=app_private.current_user_id() and lower(u.unit_code)=lower(r.registry_import_row_data->>'unit_code')
        and ((p.person_document_type::text=r.registry_import_row_data->>'person_document_type' and p.person_document_number=r.registry_import_row_data->>'person_document_number')
          or p.person_email=r.registry_import_row_data->>'person_email')
        and (resident.unit_resident_is_holder::text is distinct from r.registry_import_row_data->>'unit_resident_is_holder'
          or resident.unit_resident_is_minor::text is distinct from r.registry_import_row_data->>'unit_resident_is_minor'
          or r.registry_import_row_data->>'person_birth_date'>(current_date-interval '18 years')::date::text));
  update public.registry_import_row r set registry_import_row_errors=registry_import_row_errors||'"occupied_unit_requires_holder"'::jsonb
    where r.tenant_id=target_tenant_id and r.registry_import_id=target_import_id and r.registry_import_row_data->>'unit_status'='occupied'
      and not exists(select 1 from public.registry_import_row holder where holder.tenant_id=target_tenant_id and holder.registry_import_id=target_import_id
        and lower(holder.registry_import_row_data->>'unit_code')=lower(r.registry_import_row_data->>'unit_code')
        and holder.registry_import_row_errors='[]' and holder.registry_import_row_data->>'unit_resident_is_holder'='true')
      and not exists(select 1 from public.unit u join public.unit_resident holder using(tenant_id,unit_id) join public.person p using(tenant_id,person_id)
        where u.tenant_id=target_tenant_id and lower(u.unit_code)=lower(r.registry_import_row_data->>'unit_code')
          and holder.unit_resident_is_holder and not holder.unit_resident_is_minor and holder.unit_resident_valid_from_at<=now()
          and (holder.unit_resident_valid_to_at is null or now()<holder.unit_resident_valid_to_at)
          and not exists(select 1 from public.registry_import_row changing where changing.tenant_id=target_tenant_id and changing.registry_import_id=target_import_id
            and lower(changing.registry_import_row_data->>'unit_code')=lower(u.unit_code)
            and ((p.person_document_type::text=changing.registry_import_row_data->>'person_document_type' and p.person_document_number=changing.registry_import_row_data->>'person_document_number')
              or p.person_email=changing.registry_import_row_data->>'person_email')));
  select count(*) into count_errors from public.registry_import_row where tenant_id=target_tenant_id and registry_import_id=target_import_id and registry_import_row_errors<>'[]';
  return count_errors;
end;
$$;
create function public.create_registry_import(target_tenant_id uuid,rows jsonb,client_event_id uuid) returns uuid
language plpgsql security definer set search_path='' set statement_timeout='120s' as $$
declare target_id uuid; receipt jsonb; errors integer;
begin
  perform app_private.require_registry(target_tenant_id);
  receipt:=app_private.registry_retry(client_event_id,target_tenant_id,'create_registry_import',rows);
  if receipt is not null then return (receipt->>'id')::uuid; end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 8000 then
    raise exception 'Invalid registry import' using errcode='22023'; end if;
  insert into public.registry_import(tenant_id,registry_import_created_by_user_id,registry_import_row_count,registry_import_error_count,client_event_id)
    values(target_tenant_id,app_private.current_user_id(),jsonb_array_length(rows),0,create_registry_import.client_event_id) returning registry_import_id into target_id;
  insert into public.registry_import_row(tenant_id,registry_import_id,registry_import_row_number,registry_import_row_data,registry_import_row_errors)
    select target_tenant_id,target_id,position::integer,
      case when jsonb_typeof(value)='object' then app_private.normalize_registry_import_row(value) else jsonb_build_object('invalid_row',value) end,
      '[]' from jsonb_array_elements(rows) with ordinality r(value,position);
  errors:=app_private.validate_registry_import(target_tenant_id,target_id);
  update public.registry_import set registry_import_error_count=errors where registry_import_id=target_id;
  perform app_private.registry_finish(client_event_id,target_tenant_id,'create_registry_import',rows,jsonb_build_object('id',target_id)); return target_id;
end;
$$;
create function public.preview_registry_import(target_tenant_id uuid,target_import_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare batch public.registry_import; records jsonb;
begin
  perform app_private.require_registry(target_tenant_id,false);
  select * into batch from public.registry_import where tenant_id=target_tenant_id and registry_import_id=target_import_id;
  if not found then raise exception 'Registry import denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('row_number',registry_import_row_number,'data',registry_import_row_data,'errors',registry_import_row_errors)
    order by registry_import_row_number),'[]') into records from public.registry_import_row where tenant_id=target_tenant_id and registry_import_id=target_import_id;
  return jsonb_build_object('batch',to_jsonb(batch),'rows',records);
end;
$$;
create function public.confirm_registry_import(target_tenant_id uuid,target_import_id uuid,client_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='120s' as $$
declare batch public.registry_import; result jsonb; errors integer; units integer; residents integer;
begin
  perform app_private.require_registry(target_tenant_id);
  result:=app_private.registry_retry(client_event_id,target_tenant_id,'confirm_registry_import',to_jsonb(target_import_id));
  if result is not null then return result; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('import:'||target_tenant_id::text,0));
  select * into batch from public.registry_import where tenant_id=target_tenant_id and registry_import_id=target_import_id for update;
  if not found then raise exception 'Registry import denied' using errcode='42501'; end if;
  if batch.registry_import_status='confirmed' then
    return jsonb_build_object('status','confirmed','unit_count',batch.registry_import_unit_count,'resident_count',batch.registry_import_resident_count);
  end if;
  errors:=app_private.validate_registry_import(target_tenant_id,target_import_id);
  if errors>0 then
    update public.registry_import set registry_import_error_count=errors where registry_import_id=target_import_id;
    return jsonb_build_object('status','invalid','error_count',errors);
  end if;
  -- Set-oriented DML: one statement per entity, tenant-leading natural keys, no per-row RPC or authority lookup.
  with records as(select distinct on(lower(d->>'unit_code')) d from public.registry_import_row r
    cross join lateral(select r.registry_import_row_data d) v where tenant_id=target_tenant_id and registry_import_id=target_import_id order by lower(d->>'unit_code'))
  insert into public.unit(tenant_id,unit_code,unit_block_code,unit_lot_number,unit_status,unit_coefficient,unit_is_billable,unit_contact_phone,unit_backup_phone)
    select target_tenant_id,d->>'unit_code',d->>'unit_block_code',d->>'unit_lot_number',(d->>'unit_status')::public.unit_status,
      (d->>'unit_coefficient')::numeric,(d->>'unit_is_billable')::boolean,d->>'unit_contact_phone',d->>'unit_backup_phone' from records
  on conflict(tenant_id,lower(unit_code)) do update set unit_block_code=excluded.unit_block_code,unit_lot_number=excluded.unit_lot_number,
    unit_status=excluded.unit_status,unit_coefficient=excluded.unit_coefficient,unit_is_billable=excluded.unit_is_billable,
    unit_contact_phone=excluded.unit_contact_phone,unit_backup_phone=excluded.unit_backup_phone
    where (unit.unit_block_code,unit.unit_lot_number,unit.unit_status,unit.unit_coefficient,unit.unit_is_billable,unit.unit_contact_phone,unit.unit_backup_phone)
      is distinct from (excluded.unit_block_code,excluded.unit_lot_number,excluded.unit_status,excluded.unit_coefficient,excluded.unit_is_billable,excluded.unit_contact_phone,excluded.unit_backup_phone);
  with records as(select distinct d from public.registry_import_row r cross join lateral(select r.registry_import_row_data
    -array['unit_code','unit_block_code','unit_lot_number','unit_status','unit_coefficient','unit_is_billable','unit_contact_phone','unit_backup_phone',
      'unit_resident_relationship','unit_resident_is_holder','unit_resident_is_minor'] d) v
    where tenant_id=target_tenant_id and registry_import_id=target_import_id and registry_import_row_data->>'person_first_name' is not null)
  update public.person p set person_first_name=d->>'person_first_name',person_last_name=d->>'person_last_name',
    person_document_type=(d->>'person_document_type')::public.person_document_type,person_document_number=d->>'person_document_number',
    person_email=d->>'person_email',person_phone=d->>'person_phone',person_birth_date=(d->>'person_birth_date')::date
  from records where p.tenant_id=target_tenant_id and
    ((p.person_document_type::text=d->>'person_document_type' and p.person_document_number=d->>'person_document_number') or p.person_email=d->>'person_email')
    and (p.person_first_name,p.person_last_name,p.person_document_type::text,p.person_document_number,p.person_email,p.person_phone,p.person_birth_date)
      is distinct from (d->>'person_first_name',d->>'person_last_name',d->>'person_document_type',d->>'person_document_number',d->>'person_email',d->>'person_phone',(d->>'person_birth_date')::date);
  with records as(select distinct d from public.registry_import_row r cross join lateral(select r.registry_import_row_data
    -array['unit_code','unit_block_code','unit_lot_number','unit_status','unit_coefficient','unit_is_billable','unit_contact_phone','unit_backup_phone',
      'unit_resident_relationship','unit_resident_is_holder','unit_resident_is_minor'] d) v
    where tenant_id=target_tenant_id and registry_import_id=target_import_id and registry_import_row_data->>'person_first_name' is not null)
  insert into public.person(tenant_id,person_first_name,person_last_name,person_document_type,person_document_number,person_email,person_phone,person_birth_date)
    select target_tenant_id,d->>'person_first_name',d->>'person_last_name',(d->>'person_document_type')::public.person_document_type,
      d->>'person_document_number',d->>'person_email',d->>'person_phone',(d->>'person_birth_date')::date from records
    where not exists(select 1 from public.person p where p.tenant_id=target_tenant_id and
      ((p.person_document_type::text=d->>'person_document_type' and p.person_document_number=d->>'person_document_number') or p.person_email=d->>'person_email'));
  with records as(select r.registry_import_row_data d from public.registry_import_row r where tenant_id=target_tenant_id and registry_import_id=target_import_id)
  insert into public.unit_resident(tenant_id,unit_id,person_id,unit_resident_relationship,unit_resident_is_holder,unit_resident_is_minor,unit_resident_valid_from_at)
    select distinct target_tenant_id,u.unit_id,p.person_id,(d->>'unit_resident_relationship')::public.unit_resident_relationship,
      (d->>'unit_resident_is_holder')::boolean,app_private.resident_is_minor(p,(d->>'unit_resident_is_minor')::boolean),'2020-01-01'::timestamptz
    from records join public.unit u on u.tenant_id=target_tenant_id and lower(u.unit_code)=lower(d->>'unit_code')
      join public.person p on p.tenant_id=target_tenant_id and
        ((p.person_document_type::text=d->>'person_document_type' and p.person_document_number=d->>'person_document_number') or p.person_email=d->>'person_email')
  on conflict(tenant_id,unit_id,person_id) do update set unit_resident_relationship=excluded.unit_resident_relationship,
    unit_resident_is_holder=excluded.unit_resident_is_holder,unit_resident_is_minor=excluded.unit_resident_is_minor
    where (unit_resident.unit_resident_relationship,unit_resident.unit_resident_is_holder,unit_resident.unit_resident_is_minor)
      is distinct from (excluded.unit_resident_relationship,excluded.unit_resident_is_holder,excluded.unit_resident_is_minor);
  update public.membership m set membership_status='revoked' from public.unit_resident r where m.tenant_id=target_tenant_id
    and (m.tenant_id,m.unit_id,m.person_id)=(r.tenant_id,r.unit_id,r.person_id) and m.membership_status='active'
    and (r.unit_resident_is_minor or (m.membership_role='unit_holder' and not r.unit_resident_is_holder));
  select count(distinct lower(registry_import_row_data->>'unit_code')),count(*) filter(where registry_import_row_data->>'person_first_name' is not null)
    into units,residents from public.registry_import_row where tenant_id=target_tenant_id and registry_import_id=target_import_id;
  update public.registry_import set registry_import_status='confirmed',registry_import_unit_count=units,registry_import_resident_count=residents,registry_import_error_count=0
    where registry_import_id=target_import_id;
  -- Flush under the already-authorized capability so each deferred row does not re-evaluate client RLS helpers.
  set constraints public.validate_occupied_unit immediate;
  set constraints public.validate_occupied_unit deferred;
  result:=jsonb_build_object('status','confirmed','unit_count',units,'resident_count',residents);
  perform app_private.registry_finish(client_event_id,target_tenant_id,'confirm_registry_import',to_jsonb(target_import_id),result); return result;
end;
$$;
revoke all on function app_private.registry_import_row_errors(jsonb),app_private.normalize_registry_import_row(jsonb),app_private.validate_registry_import(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.registry_import_row_errors(jsonb),app_private.normalize_registry_import_row(jsonb),app_private.validate_registry_import(uuid,uuid) to registry_writer;
