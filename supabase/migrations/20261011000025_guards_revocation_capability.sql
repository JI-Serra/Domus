-- M02-F06: keep H1 management ownership; isolate the only new guard write capability.
create or replace function app_private.validate_household_membership() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user='registry_writer' and new.membership_role not in('unit_holder','household_member') then
    -- Only guard revocation may use this capability for a non-household role.
    if tg_op='UPDATE' and old.membership_role='guard' and new.membership_role='guard'
      and new.membership_status='revoked'
      and (to_jsonb(new)-array['membership_status','membership_updated_at'])
        is not distinct from (to_jsonb(old)-array['membership_status','membership_updated_at'])
      and new.tenant_id in(select app_private.writable_permission_tenant_ids('guards')) then
      return new;
    end if;
    raise exception 'Registry role grant denied' using errcode='42501'; end if;
  if new.unit_id is not null and new.membership_status='active' and not exists(
    select 1 from public.unit_resident r join public.person p using(tenant_id,person_id)
    where r.tenant_id=new.tenant_id and r.unit_id=new.unit_id and r.person_id=new.person_id
      and not app_private.resident_is_minor(p,r.unit_resident_is_minor)
      and (new.membership_role<>'unit_holder' or r.unit_resident_is_holder)
      and r.unit_resident_valid_from_at<=new.membership_valid_from
      and (r.unit_resident_valid_to_at is null or (new.membership_valid_to is not null and new.membership_valid_to<=r.unit_resident_valid_to_at))) then
    raise exception 'Membership requires an eligible resident' using errcode='23514'; end if;
  return new;
end;
$$;

grant create on schema app_private to registry_writer;
set role registry_writer;
create function app_private.revoke_managed_guard(target_membership_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select app_private.writable_permission_tenant_ids('guards')) then
    raise exception 'Membership management denied' using errcode='42501'; end if;
  update public.membership m set membership_status='revoked'
    where m.membership_id=target_membership_id and m.membership_role='guard'
      and m.tenant_id in(select app_private.writable_permission_tenant_ids('guards'))
      and exists(select 1 from public.person p where p.tenant_id=m.tenant_id and p.person_id=m.person_id
        and p.user_id is distinct from app_private.current_user_id());
  if not found then raise exception 'Membership management denied' using errcode='42501'; end if;
end;
$$;
revoke all on function app_private.revoke_managed_guard(uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.revoke_managed_guard(uuid) to postgres;
reset role;
revoke create on schema app_private from registry_writer;

set role registry_writer;
drop function public.revoke_membership(uuid);
reset role;
revoke execute on function app_private.lock_managed_membership(uuid,boolean,public.membership_role) from registry_writer;

create or replace function public.revoke_membership(target_membership_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target public.membership;
begin
  if exists(select app_private.writable_permission_tenant_ids('guards')) then
    select m.* into target from public.membership m join public.person p using(tenant_id,person_id)
      where m.membership_id=target_membership_id and m.membership_role='guard'
        and m.tenant_id in(select app_private.writable_permission_tenant_ids('guards'))
        and p.user_id is distinct from app_private.current_user_id() for update of m;
  end if;
  if target.membership_id is null then
    target:=app_private.lock_managed_membership(target_membership_id,false);
  else
    -- Retain current grantor authority through the write.
    perform 1 from public.membership m join public.person p using(tenant_id,person_id)
      join public.membership_permission mp using(tenant_id,membership_id)
      where m.tenant_id=target.tenant_id and p.user_id=app_private.current_user_id()
        and m.membership_id in(select app_private.own_membership_ids()) and m.membership_role='tenant_admin'
        and mp.membership_permission_admin_permission='guards' for share of m,mp;
    if not found then raise exception 'Membership management denied' using errcode='42501'; end if;
  end if;
  if target.membership_role='guard' and target.tenant_id in(select app_private.writable_permission_tenant_ids('guards')) then
    perform app_private.revoke_managed_guard(target.membership_id);
  else
    update public.membership set membership_status='revoked' where membership_id=target.membership_id;
  end if;
end;
$$;

revoke all on function public.revoke_membership(uuid) from public,anon,service_role;
grant execute on function public.revoke_membership(uuid) to authenticated;
