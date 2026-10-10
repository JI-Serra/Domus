-- M02-F03/F07: bounded registry input, canonical storage paths and operational contact budgets.
alter table public.unit add constraint unit_text_length_check check
  (length(unit_block_code)<=100 and length(unit_lot_number)<=100);
alter table public.vehicle add constraint vehicle_text_length_check check
  (length(vehicle_make_name)<=100 and length(vehicle_model_name)<=100 and length(vehicle_color_name)<=100);
alter table public.pet add constraint pet_text_length_check check(length(pet_breed_name)<=100);
alter table public.person add constraint person_email_length_check check(length(person_email)<=254);
alter table public.unit_join_request add constraint unit_join_request_text_length_check check
  (length(unit_join_request_first_name) between 1 and 100 and length(unit_join_request_last_name) between 1 and 100
    and length(unit_join_request_email)<=254);
alter table public.registry_import_row add constraint registry_import_row_length_check check
  (octet_length(registry_import_row_data::text)<=16384);

create function app_private.valid_registry_storage_path(object_name text,segment_count integer) returns boolean
language sql immutable set search_path='' as $$
  select object_name is not null and length(object_name)<=512
    and cardinality(string_to_array(object_name,'/'))=segment_count
    and not exists(select 1 from unnest(string_to_array(object_name,'/')) segment
      where segment in('','.', '..') or segment ~ '[\\[:cntrl:]]' or segment ~ '%')
    and split_part(object_name,'/',1) ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
    and (segment_count<>3 or split_part(object_name,'/',2) ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$');
$$;
revoke all on function app_private.valid_registry_storage_path(text,integer) from public,anon,service_role;
grant execute on function app_private.valid_registry_storage_path(text,integer) to authenticated,registry_writer;
alter table public.pet drop constraint pet_photo_path_check;
alter table public.pet add constraint pet_photo_path_check check(pet_photo_path is null or
  (app_private.valid_registry_storage_path(pet_photo_path,3)
    and split_part(pet_photo_path,'/',1)=tenant_id::text and split_part(pet_photo_path,'/',2)=unit_id::text));
-- Restrictive policies apply to every existing permissive read/write policy, including future ones.
create policy "registry storage paths must be canonical" on storage.objects as restrictive for all to authenticated
  using(case bucket_id when 'pet-photo' then app_private.valid_registry_storage_path(name,3)
    when 'tenant-logo' then app_private.valid_registry_storage_path(name,2) else true end)
  with check(case bucket_id when 'pet-photo' then app_private.valid_registry_storage_path(name,3)
    when 'tenant-logo' then app_private.valid_registry_storage_path(name,2) else true end);

create type public.registry_contact_reason as enum('approval_phone_fallback','visit_phone_fallback');
grant create on schema public to registry_writer;
set role registry_writer;
create or replace function public.guard_backup_contact(target_tenant_id uuid,target_unit_id uuid,operation_code text) returns text
language plpgsql security definer set search_path='' as $$
declare phone text;
begin
  if app_private.is_impersonating() or target_tenant_id not in(select app_private.role_tenant_ids(array['guard']::public.membership_role[]))
    or operation_code is null or operation_code not in('approval_phone_fallback','visit_phone_fallback') then
    raise exception 'Operational contact denied' using errcode='42501'; end if;
  -- Five contacts per operator across all tenants per fifteen minutes. Return null on exhaustion so the counter commits.
  if not app_private.consume_registry_attempt('contact:user:'||app_private.current_user_id()::text,5) then return null; end if;
  select unit_backup_phone into phone from public.unit where tenant_id=target_tenant_id and unit_id=target_unit_id and unit_archived_at is null;
  if not found then return null; end if;
  perform app_private.record_registry_contact_reason(target_tenant_id,target_unit_id,operation_code::public.registry_contact_reason);
  return phone;
end;
$$;
reset role;
revoke create on schema public from registry_writer;

create function app_private.record_registry_contact_reason(target_tenant_id uuid,target_unit_id uuid,reason public.registry_contact_reason) returns void
language plpgsql security definer set search_path='' as $$
begin
  if app_private.is_impersonating() or target_tenant_id not in(select app_private.role_tenant_ids(array['guard']::public.membership_role[])) then
    raise exception 'Operational contact denied' using errcode='42501'; end if;
  insert into public.audit_event(tenant_id,audit_event_actor_user_id,audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff)
    values(target_tenant_id,app_private.current_actor_user_id(),'authenticated','insert','registry_contact_lookup',target_unit_id,
      jsonb_build_object('operation_code',reason));
end;
$$;
revoke all on function app_private.record_registry_contact_reason(uuid,uuid,public.registry_contact_reason) from public,anon,authenticated,service_role;
grant create on schema app_private to audit_writer;
alter function app_private.record_registry_contact_reason(uuid,uuid,public.registry_contact_reason) owner to audit_writer;
revoke create on schema app_private from audit_writer;
set role audit_writer;
grant execute on function app_private.record_registry_contact_reason(uuid,uuid,public.registry_contact_reason) to registry_writer,postgres;
reset role;

-- Scheduler groundwork only: no cron installation. Confirmed data is purged immediately by the import RPC.
create function app_private.purge_registry_import_pii() returns bigint
language plpgsql security definer set search_path='' as $$
declare purged bigint;
begin
  update public.registry_import_row r set registry_import_row_data='{}'
    from public.registry_import b where (b.tenant_id,b.registry_import_id)=(r.tenant_id,r.registry_import_id)
      and (b.registry_import_status='confirmed' or b.registry_import_created_at<=statement_timestamp()-interval '24 hours')
      and r.registry_import_row_data<>'{}';
  get diagnostics purged=row_count;
  return purged;
end;
$$;
revoke all on function app_private.purge_registry_import_pii() from public,anon,authenticated,service_role;
-- Remains owner-only (postgres); scheduler calls must not depend on an interactive Auth identity.
comment on function app_private.purge_registry_import_pii() is 'Owner-invoked retention job; confirmed or older-than-24-hour staged PII; no cron yet.';
comment on column public.registry_import_row.registry_import_row_data is
  'Registry values are data, including spreadsheet formulas. Render as text; all future CSV/XLSX exports must call neutralizeSpreadsheetFormula.';
