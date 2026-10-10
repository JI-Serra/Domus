-- M02-F05: end one household membership without changing identity or other residences.
grant create on schema public to registry_writer;
set role registry_writer;
create function public.end_household_membership(target_membership_id uuid,client_event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target public.membership; receipt jsonb;
  payload jsonb:=jsonb_build_array(target_membership_id);
begin
  -- Authorize the validated identity before reading any target or retry receipt.
  if not app_private.current_identity_is_valid() or client_event_id is null
    or (not exists(select app_private.writable_permission_tenant_ids('registry'))
      and not exists(select 1 from public.unit u where u.unit_id in(select app_private.holder_unit_ids())
        and u.tenant_id in(select app_private.writable_tenant_ids()))) then
    raise exception 'Household membership management denied' using errcode='42501';
  end if;
  -- Resolve only within authorized tenant/unit scopes; no existence oracle for foreign targets.
  select m.* into target from public.membership m join public.person p using(tenant_id,person_id)
    where m.membership_id=target_membership_id and m.unit_id is not null
      and m.membership_role='household_member' and p.user_id is distinct from app_private.current_user_id()
      and (m.tenant_id in(select app_private.writable_permission_tenant_ids('registry'))
        or (m.tenant_id in(select app_private.writable_tenant_ids())
          and m.unit_id in(select app_private.holder_unit_ids())));
  if not found then raise exception 'Household membership management denied' using errcode='42501'; end if;
  receipt:=app_private.registry_retry(client_event_id,target.tenant_id,'end_household_membership',payload);
  if receipt is not null then return; end if;
  -- Serialize against concurrent delegation and membership changes, then recheck live eligibility.
  select m.* into target from public.membership m join public.person p using(tenant_id,person_id)
    where m.membership_id=target_membership_id and m.membership_role='household_member'
      and m.membership_status='active' and m.membership_valid_from<=now()
      and (m.membership_valid_to is null or now()<m.membership_valid_to)
      and p.user_id is distinct from app_private.current_user_id()
      and app_private.can_manage_unit(m.tenant_id,m.unit_id) for update of m;
  if not found then raise exception 'Household membership management denied' using errcode='42501'; end if;
  delete from public.membership_household_permission where tenant_id=target.tenant_id and membership_id=target.membership_id;
  update public.membership set membership_status='revoked',membership_valid_to=statement_timestamp()
    where membership_id=target.membership_id;
  update public.invitation set invitation_status='revoked'
    where tenant_id=target.tenant_id and unit_id=target.unit_id and person_id=target.person_id and invitation_status='pending';
  perform app_private.registry_finish(client_event_id,target.tenant_id,'end_household_membership',payload,'{}');
exception when insufficient_privilege then
  raise exception 'Household membership management denied' using errcode='42501';
end;
$$;
reset role;
revoke create on schema public from registry_writer;
revoke all on function public.end_household_membership(uuid,uuid) from public,anon,service_role;
grant execute on function public.end_household_membership(uuid,uuid) to authenticated;
