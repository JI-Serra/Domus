-- Final integrity gates also cover H0 RPCs/direct registry-profile edits without granting client role-table writes.
grant select on public.membership_permission to registry_writer;
create policy "registry capability can inspect permission integrity" on public.membership_permission for select to registry_writer using(true);
grant execute on function app_private.current_identity_is_valid() to invitation_acceptor;
grant execute on function app_private.writable_permission_tenant_ids(public.admin_permission) to authenticated;
alter table public.invitation add constraint invitation_tenant_id_invitation_id_key unique(tenant_id,invitation_id);
alter table public.unit_join_request drop constraint unit_join_request_invitation_id_fkey;
alter table public.unit_join_request add constraint unit_join_request_tenant_id_invitation_id_fkey
  foreign key(tenant_id,invitation_id) references public.invitation(tenant_id,invitation_id);
create index unit_join_request_tenant_id_invitation_id_idx on public.unit_join_request(tenant_id,invitation_id);
create index registry_import_row_tenant_id_registry_import_id_unit_code_idx
  on public.registry_import_row(tenant_id,registry_import_id,lower(registry_import_row_data->>'unit_code'));
alter table public.unit enable always trigger validate_occupied_unit;
alter table public.unit_resident enable always trigger validate_occupied_unit;
alter table public.unit_resident enable always trigger lock_resident_unit;
alter table public.membership enable always trigger validate_household_membership;
alter table public.membership_household_permission enable always trigger validate_household_permission;
alter table public.gate_guard enable always trigger validate_gate_guard;

create or replace function app_private.validate_occupied_unit() returns trigger
language plpgsql set search_path='' as $$
declare target_unit uuid:=coalesce(new.unit_id,old.unit_id); target_tenant uuid:=coalesce(new.tenant_id,old.tenant_id); coverage tstzmultirange;
begin
  if exists(select 1 from public.unit where tenant_id=target_tenant and unit_id=target_unit and unit_status='occupied' and unit_archived_at is null) then
    select range_agg(tstzrange(unit_resident_valid_from_at,unit_resident_valid_to_at,'[)')) into coverage
      from public.unit_resident where tenant_id=target_tenant and unit_id=target_unit and unit_resident_is_holder and not unit_resident_is_minor;
    -- Cover now AND future validity boundaries: time passing cannot leave an occupied unit without a holder.
    if coverage is null or not coverage @> tstzrange(now(),null,'[)') then
      raise exception 'Occupied unit requires an active holder' using errcode='23514'; end if;
  end if;
  return null;
end;
$$;
create or replace function app_private.holder_unit_ids() returns setof uuid
language sql stable security definer set search_path='' as $$
  select distinct m.unit_id from public.membership m join public.unit_resident r using(tenant_id,unit_id,person_id)
    join public.unit u using(tenant_id,unit_id) join public.person p using(tenant_id,person_id)
  where m.membership_id in(select app_private.own_membership_ids()) and m.membership_role='unit_holder'
    and r.unit_resident_is_holder and not app_private.resident_is_minor(p,r.unit_resident_is_minor)
    and r.unit_resident_valid_from_at<=now() and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at) and u.unit_archived_at is null;
$$;
create or replace function app_private.household_unit_ids() returns setof uuid
language sql stable security definer set search_path='' as $$
  select distinct m.unit_id from public.membership m join public.unit_resident r using(tenant_id,unit_id,person_id)
    join public.unit u using(tenant_id,unit_id) join public.person p using(tenant_id,person_id)
  where m.membership_id in(select app_private.own_membership_ids()) and m.membership_role in('unit_holder','household_member')
    and not app_private.resident_is_minor(p,r.unit_resident_is_minor) and r.unit_resident_valid_from_at<=now()
    and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at) and u.unit_archived_at is null;
$$;
create function app_private.synchronize_resident_minor() returns trigger
language plpgsql security definer set search_path='' as $$
declare originating_role text:=coalesce(nullif(current_setting('role',true),'none'),session_user);
begin
  if new.person_birth_date is not distinct from old.person_birth_date then return new; end if;
  -- Authorize before reading/locking related residents. Owners may seed; client-origin writes still use identity.
  if originating_role not in('postgres','supabase_admin') then
    if new.tenant_id not in(select app_private.writable_permission_tenant_ids('registry'))
      and (new.tenant_id not in(select app_private.writable_tenant_ids()) or not exists(select app_private.holder_unit_ids())) then
      raise exception 'Registry management denied' using errcode='42501'; end if;
    if new.tenant_id not in(select app_private.writable_permission_tenant_ids('registry')) and not exists(
      select 1 from public.unit_resident r where r.tenant_id=new.tenant_id and r.person_id=new.person_id
        and r.unit_id in(select app_private.holder_unit_ids()) and not r.unit_resident_is_holder) then
      raise exception 'Registry management denied' using errcode='42501'; end if;
  end if;
  if app_private.resident_is_minor(new,false) then
    update public.unit_resident set unit_resident_is_minor=true,unit_resident_is_holder=false where tenant_id=new.tenant_id and person_id=new.person_id and not unit_resident_is_minor;
    update public.membership set membership_status='revoked' where tenant_id=new.tenant_id and person_id=new.person_id and unit_id is not null and membership_status='active';
    update public.invitation set invitation_status='revoked' where tenant_id=new.tenant_id and person_id=new.person_id and invitation_status='pending';
  end if;
  return new;
end;
$$;
revoke all on function app_private.synchronize_resident_minor() from public,anon,authenticated,service_role;
grant create on schema app_private to registry_writer;
alter function app_private.synchronize_resident_minor() owner to registry_writer;
revoke create on schema app_private from registry_writer;
set role registry_writer;
grant execute on function app_private.synchronize_resident_minor() to postgres;
reset role;
create trigger synchronize_resident_minor after update of person_birth_date on public.person for each row execute function app_private.synchronize_resident_minor();
alter table public.person enable always trigger synchronize_resident_minor;

create function app_private.validate_invitation_resident() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.person_id is not null and (exists(select 1 from public.person p where p.tenant_id=new.tenant_id and p.person_id=new.person_id
      and app_private.resident_is_minor(p,false))
    or exists(select 1 from public.unit_resident r where r.tenant_id=new.tenant_id and r.person_id=new.person_id and r.unit_resident_is_minor
      and r.unit_resident_valid_from_at<=now() and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at))) then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function app_private.validate_invitation_resident() from public,anon,authenticated,service_role;
grant execute on function app_private.resident_is_minor(public.person,boolean) to postgres;
create trigger validate_invitation_resident before insert on public.invitation for each row execute function app_private.validate_invitation_resident();
alter table public.invitation enable always trigger validate_invitation_resident;

-- Complete H1 management RPC: moving to a non-resident role clears its unit scope, with D17 self/grantor checks intact.
create or replace function public.update_membership(target_membership_id uuid,target_role public.membership_role,
  target_status public.membership_status,valid_from timestamptz,valid_to timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
declare target public.membership;
begin
  target:=app_private.lock_managed_membership(target_membership_id,false,target_role);
  if (target.membership_role='tenant_admin' or target_role='tenant_admin') and not app_private.is_platform_admin()
    and target.tenant_id not in(select app_private.writable_permission_tenant_ids('admin_management')) then
    raise exception 'Membership management denied' using errcode='42501'; end if;
  update public.membership set membership_role=target_role,membership_status=target_status,membership_valid_from=valid_from,membership_valid_to=valid_to,
    unit_id=case when target_role in('unit_holder','household_member') then unit_id else null end where membership_id=target_membership_id;
end;
$$;
-- Storage unit path must belong to the tenant prefix, even for holders with homes in several tenants.
create function app_private.household_storage_paths(holders_only boolean,writing boolean) returns setof text
language sql stable security definer set search_path='' as $$
  select u.tenant_id::text||'/'||u.unit_id::text from public.unit u where
    u.unit_id in(select app_private.household_unit_ids()) and (not holders_only or u.unit_id in(select app_private.holder_unit_ids()))
    and (not writing or u.tenant_id in(select app_private.writable_tenant_ids()));
$$;
revoke all on function app_private.household_storage_paths(boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function app_private.household_storage_paths(boolean,boolean) to authenticated;
drop policy "households and registry admins can read pet photos" on storage.objects;
drop policy "holders and registry admins can upload pet photos" on storage.objects;
drop policy "holders and registry admins can update pet photos" on storage.objects;
drop policy "holders and registry admins can delete pet photos" on storage.objects;
create policy "households and registry admins can read pet photos" on storage.objects for select to authenticated using
  (bucket_id='pet-photo' and ((storage.foldername(name))[1] in(select app_private.permission_tenant_ids('registry')::text)
    or (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2] in(select app_private.household_storage_paths(false,false))));
create policy "holders and registry admins can upload pet photos" on storage.objects for insert to authenticated with check
  (bucket_id='pet-photo' and ((storage.foldername(name))[1] in(select app_private.writable_permission_tenant_ids('registry')::text)
    or (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2] in(select app_private.household_storage_paths(true,true))));
create policy "holders and registry admins can update pet photos" on storage.objects for update to authenticated using
  (bucket_id='pet-photo' and ((storage.foldername(name))[1] in(select app_private.writable_permission_tenant_ids('registry')::text)
    or (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2] in(select app_private.household_storage_paths(true,true)))) with check
  (bucket_id='pet-photo' and ((storage.foldername(name))[1] in(select app_private.writable_permission_tenant_ids('registry')::text)
    or (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2] in(select app_private.household_storage_paths(true,true))));
create policy "holders and registry admins can delete pet photos" on storage.objects for delete to authenticated using
  (bucket_id='pet-photo' and ((storage.foldername(name))[1] in(select app_private.writable_permission_tenant_ids('registry')::text)
    or (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2] in(select app_private.household_storage_paths(true,true))));
