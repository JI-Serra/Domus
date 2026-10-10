-- D24: guards have no broad person-table access; operational data is a minimized RPC projection.
drop policy "registry admins guards and owners can read people" on public.person;
create policy "registry admins and owners can read people" on public.person for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('registry')) or person_id in(select app_private.current_person_ids()));

create policy "registry admins and households can read units" on public.unit for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('registry')) or unit_id in(select app_private.household_unit_ids()));
create policy "registry admins holders and residents can read residents" on public.unit_resident for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('registry')) or unit_id in(select app_private.holder_unit_ids())
    or person_id in(select app_private.current_person_ids()));
create policy "registry admins and households can read vehicles" on public.vehicle for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('registry')) or unit_id in(select app_private.household_unit_ids()));
create policy "registry admins and households can read pets" on public.pet for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('registry')) or unit_id in(select app_private.household_unit_ids()));
create policy "members can read own household permissions" on public.membership_household_permission for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('registry')) or membership_id in(select app_private.own_membership_ids()));
create policy "registry admins holders and applicants can read requests" on public.unit_join_request for select to authenticated using
  (not(select app_private.is_impersonating()) and (tenant_id in(select app_private.permission_tenant_ids('registry'))
    or unit_id in(select app_private.holder_unit_ids()) or unit_join_request_user_id=(select app_private.current_user_id()))
    and tenant_id in(select app_private.identity_tenant_ids()) );
-- Requesters without tenant membership use their safe request receipt; they cannot browse a tenant.
create policy "guards managers and guards can read gates" on public.gate for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('guards')) or tenant_id in(select app_private.role_tenant_ids(array['guard']::public.membership_role[])));
create policy "guards managers and assigned guards can read assignments" on public.gate_guard for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('guards')) or membership_id in(select app_private.own_membership_ids()));
create policy "guards managers can read devices" on public.device for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('guards')));
-- Hash tables intentionally have no client grants or policy; capability policies are their only access.
create policy "registry admins can read imports" on public.registry_import for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('registry')));
create policy "registry admins can read import rows" on public.registry_import_row for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('registry')));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('pet-photo','pet-photo',false,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy "households and registry admins can read pet photos" on storage.objects for select to authenticated using
  (bucket_id='pet-photo' and (storage.foldername(name))[1] in(select app_private.member_tenant_ids()::text)
    and ((storage.foldername(name))[1] in(select app_private.permission_tenant_ids('registry')::text)
      or (storage.foldername(name))[2] in(select app_private.household_unit_ids()::text)));
create policy "holders and registry admins can upload pet photos" on storage.objects for insert to authenticated with check
  (bucket_id='pet-photo' and (storage.foldername(name))[1] in(select app_private.writable_tenant_ids()::text)
    and ((storage.foldername(name))[1] in(select app_private.permission_tenant_ids('registry')::text)
      or (storage.foldername(name))[2] in(select app_private.holder_unit_ids()::text)));
create policy "holders and registry admins can update pet photos" on storage.objects for update to authenticated using
  (bucket_id='pet-photo' and (storage.foldername(name))[1] in(select app_private.writable_tenant_ids()::text)
    and ((storage.foldername(name))[1] in(select app_private.permission_tenant_ids('registry')::text)
      or (storage.foldername(name))[2] in(select app_private.holder_unit_ids()::text))) with check
  (bucket_id='pet-photo' and (storage.foldername(name))[1] in(select app_private.writable_tenant_ids()::text)
    and ((storage.foldername(name))[1] in(select app_private.permission_tenant_ids('registry')::text)
      or (storage.foldername(name))[2] in(select app_private.holder_unit_ids()::text)));
create policy "holders and registry admins can delete pet photos" on storage.objects for delete to authenticated using
  (bucket_id='pet-photo' and (storage.foldername(name))[1] in(select app_private.writable_tenant_ids()::text)
    and ((storage.foldername(name))[1] in(select app_private.permission_tenant_ids('registry')::text)
      or (storage.foldername(name))[2] in(select app_private.holder_unit_ids()::text)));

create or replace function app_private.audit_redacted_columns(target_table text) returns text[]
language sql immutable set search_path='' as $$
  select case target_table
    when 'person' then array['person_first_name','person_last_name','person_document_number','person_email','person_phone','person_birth_date']::text[]
    when 'tenant' then array[]::text[] when 'platform_admin' then array[]::text[]
    when 'membership' then array[]::text[] when 'membership_permission' then array[]::text[]
    when 'invitation' then array['invitation_email','invitation_first_name','invitation_last_name','invitation_token_hash']::text[]
    when 'support_session' then array['support_session_reason','support_session_revocation_reason']::text[]
    when 'unit' then array['unit_contact_phone','unit_backup_phone']::text[]
    when 'unit_resident' then array[]::text[] when 'membership_household_permission' then array[]::text[]
    when 'vehicle' then array['vehicle_plate_code']::text[]
    when 'pet' then array['pet_photo_path']::text[]
    when 'unit_join_code' then array['unit_join_code_hash']::text[]
    when 'unit_join_request' then array['unit_join_request_email','unit_join_request_first_name','unit_join_request_last_name','unit_join_request_document_number','unit_join_request_birth_date']::text[]
    when 'gate' then array[]::text[] when 'gate_guard' then array[]::text[]
    when 'device' then array['device_credential_hash']::text[]
    when 'device_pairing' then array['device_pairing_code_hash']::text[]
    when 'registry_import' then array[]::text[]
    when 'registry_import_row' then array['registry_import_row_data']::text[] else null::text[] end;
$$;
-- The dedicated writer is reachable only through authorized RPCs. Trigger WHEN transfers that capability to the
-- dedicated audit writer; no caller-set flag, nesting-depth condition or client audit INSERT privilege is involved.
create function app_private.audit_registry_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_data jsonb; new_data jsonb; row_data jsonb; changes jsonb; target_tenant_id uuid;
  actor uuid:=app_private.current_actor_user_id(); redactions text[]; column_name text; actor_person uuid;
begin
  if tg_name<>'audit_registry_change' then raise exception 'Audited write denied' using errcode='42501'; end if;
  if tg_op<>'INSERT' then old_data:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then new_data:=to_jsonb(new); end if;
  row_data:=coalesce(new_data,old_data); target_tenant_id:=(row_data->>'tenant_id')::uuid;
  redactions:=app_private.audit_redacted_columns(tg_table_name);
  if redactions is null then raise exception 'Declare audit redaction' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    select coalesce(jsonb_object_agg(n.key,jsonb_build_object('old',old_data->n.key,'new',n.value)),'{}'::jsonb)
      into changes from jsonb_each(new_data) n where n.value is distinct from old_data->n.key;
    if changes='{}'::jsonb then return new; end if;
  else changes:=row_data; end if;
  foreach column_name in array redactions loop
    if changes ? column_name then changes:=jsonb_set(changes,array[column_name],'{"changed":true}'); end if;
  end loop;
  select person_id into actor_person from public.person where tenant_id=target_tenant_id and user_id=actor;
  insert into public.audit_event(tenant_id,audit_event_actor_user_id,audit_event_actor_person_id,audit_event_db_role,
    audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff,audit_event_on_behalf_of_user_id,support_session_id)
  values(target_tenant_id,actor,actor_person,coalesce(nullif(current_setting('role',true),'none'),session_user),
    lower(tg_op)::public.audit_event_action,tg_table_name,(row_data->>(tg_table_name||'_id'))::uuid,changes,
    case when app_private.is_impersonating() then app_private.current_user_id() end,app_private.current_support_session_id());
  return coalesce(new,old);
end;
$$;
revoke all on function app_private.audit_registry_change() from public,anon,authenticated,service_role,registry_writer;
grant create on schema app_private to audit_writer;
alter function app_private.audit_registry_change() owner to audit_writer;
revoke create on schema app_private from audit_writer;
set role audit_writer;
grant execute on function app_private.audit_registry_change() to postgres;
reset role;

-- Keep H1's consent audit branch and its authority unchanged; exclude only the new exclusive writer.
drop trigger audit_row_change on public.person;
drop trigger audit_row_change on public.membership;
drop trigger audit_row_change on public.invitation;
create trigger audit_row_change after insert or update or delete on public.person
  for each row when(current_user not in('invitation_acceptor','registry_writer')) execute function app_private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.membership
  for each row when(current_user not in('invitation_acceptor','registry_writer')) execute function app_private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.invitation
  for each row when(current_user not in('invitation_acceptor','registry_writer')) execute function app_private.audit_row_change();
do $$ declare table_name text; begin
  foreach table_name in array array['unit','unit_resident','membership_household_permission','vehicle','pet','unit_join_code',
    'unit_join_request','gate','gate_guard','device','device_pairing','registry_import','registry_import_row','person','membership','invitation'] loop
    execute format('create trigger audit_registry_change after insert or update or delete on public.%I for each row when(current_user=''registry_writer'') execute function app_private.audit_registry_change()',table_name);
    execute format('alter table public.%I enable always trigger audit_registry_change',table_name);
    if table_name in('person','membership','invitation') then
      execute format('alter table public.%I enable always trigger audit_row_change',table_name);
    else
      execute format('create trigger audit_invitation_acceptance after insert or update or delete on public.%I for each row when(current_user=''invitation_acceptor'') execute function app_private.audit_invitation_acceptance()',table_name);
      execute format('create trigger audit_row_change after insert or update or delete on public.%I for each row when(current_user not in(''registry_writer'',''invitation_acceptor'')) execute function app_private.audit_row_change()',table_name);
      execute format('alter table public.%I enable always trigger audit_invitation_acceptance',table_name);
      execute format('alter table public.%I enable always trigger audit_row_change',table_name);
    end if;
  end loop;
end $$;
grant select,insert,update on public.unit_resident,public.membership_household_permission to invitation_acceptor;
grant select,update on public.unit to invitation_acceptor; -- SELECT FOR UPDATE serializes holder changes.
grant select on public.unit_join_request to invitation_acceptor;
do $$ declare table_name text; begin
  foreach table_name in array array['unit','unit_resident','membership_household_permission','unit_join_request'] loop
    execute format('create policy "invitation acceptor can read registry consent" on public.%I for select to invitation_acceptor using(true)',table_name);
    if table_name<>'unit_join_request' then
      execute format('create policy "invitation acceptor can update registry consent" on public.%I for update to invitation_acceptor using(true) with check(true)',table_name);
    end if;
    if table_name in('unit_resident','membership_household_permission') then
      execute format('create policy "invitation acceptor can create registry consent" on public.%I for insert to invitation_acceptor with check(true)',table_name);
    end if;
  end loop;
end $$;
