-- M02-F02: complete self-role validation, including verified account email.
alter table public.person add constraint person_name_length_check check
  (length(btrim(person_first_name)) between 1 and 100 and length(btrim(person_last_name)) between 1 and 100);
create or replace function app_private.validate_registry_import(target_tenant_id uuid,target_import_id uuid) returns integer
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
      select 1 from public.person p left join public.unit_resident resident on resident.tenant_id=p.tenant_id and resident.person_id=p.person_id
        and resident.unit_id in(select u.unit_id from public.unit u where u.tenant_id=target_tenant_id and lower(u.unit_code)=lower(r.registry_import_row_data->>'unit_code'))
      where p.tenant_id=target_tenant_id and p.user_id=app_private.current_user_id()
        and ((p.person_document_type::text=r.registry_import_row_data->>'person_document_type' and p.person_document_number=r.registry_import_row_data->>'person_document_number')
          or p.person_email=r.registry_import_row_data->>'person_email'
          or app_private.verified_email()=r.registry_import_row_data->>'person_email')
        and ((resident.unit_resident_id is null and r.registry_import_row_data->>'unit_resident_is_holder'='true')
          or (resident.unit_resident_id is not null and resident.unit_resident_is_holder::text is distinct from r.registry_import_row_data->>'unit_resident_is_holder')
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
