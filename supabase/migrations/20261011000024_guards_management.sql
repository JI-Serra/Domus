-- M02-F06: guards management is independent of registry, without broad person access.

create or replace function app_private.can_invite(target_tenant_id uuid, target_role public.membership_role,
  permissions public.admin_permission[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select not app_private.is_impersonating() and app_private.current_identity_is_valid()
    and (app_private.is_platform_admin() or (
      app_private.tenant_allows_writes(target_tenant_id)
      and (app_private.has_admin_permission(target_tenant_id,case when target_role='tenant_admin'
        then 'admin_management'::public.admin_permission else 'registry'::public.admin_permission end)
        or (target_role='guard' and cardinality(permissions)=0
          and target_tenant_id in(select app_private.writable_permission_tenant_ids('guards'))))
      and not exists(select 1 from unnest(permissions) p where not app_private.has_admin_permission(target_tenant_id,p))));
$$;

create or replace function app_private.invitation_grant_is_valid(target_invitation_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare target public.invitation; required_permission public.admin_permission;
begin
  if app_private.verified_email() is null or app_private.is_impersonating() then return false; end if;
  select i.* into target from public.invitation i where i.invitation_id=target_invitation_id
    and i.invitation_email=app_private.verified_email() and i.invitation_status='pending';
  if not found then return false; end if;
  if target.unit_id is not null then
    if not exists(select 1 from public.unit u join public.unit_resident r using(tenant_id,unit_id)
      join public.person p using(tenant_id,person_id)
      where u.tenant_id=target.tenant_id and u.unit_id=target.unit_id and u.unit_archived_at is null
        and r.person_id=target.person_id and (p.user_id is null or p.user_id=app_private.current_user_id())
        and not app_private.resident_is_minor(p,r.unit_resident_is_minor)
        and r.unit_resident_valid_from_at<=now() and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at)
        and (target.invitation_membership_role<>'unit_holder' or r.unit_resident_is_holder)) then return false; end if;
    if target.invitation_membership_role='household_member' then
      perform 1 from public.membership m join public.person p using(tenant_id,person_id)
        join public.unit_resident r using(tenant_id,unit_id,person_id)
      where m.tenant_id=target.tenant_id and m.unit_id=target.unit_id and p.user_id=target.invitation_created_by_user_id
        and m.membership_role='unit_holder' and m.membership_status='active' and m.membership_valid_from<=now()
        and (m.membership_valid_to is null or now()<m.membership_valid_to) and r.unit_resident_is_holder
        and not app_private.resident_is_minor(p,r.unit_resident_is_minor) and r.unit_resident_valid_from_at<=now()
        and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at) for share of m,r;
      if found then return true; end if;
    end if;
  end if;
  perform 1 from public.platform_admin a where a.user_id=target.invitation_created_by_user_id and a.platform_admin_is_active for share;
  if found and target.unit_id is null then return true; end if;
  required_permission:=case when target.invitation_membership_role='tenant_admin' then 'admin_management'::public.admin_permission else 'registry'::public.admin_permission end;
  perform 1 from public.membership m join public.person p using(tenant_id,person_id)
    join public.membership_permission mp using(tenant_id,membership_id)
  where m.tenant_id=target.tenant_id and p.user_id=target.invitation_created_by_user_id
    and m.membership_role='tenant_admin' and m.membership_status='active' and m.membership_valid_from<=now()
    and (m.membership_valid_to is null or now()<m.membership_valid_to) and (mp.membership_permission_admin_permission=required_permission
      or (target.invitation_membership_role='guard' and target.unit_id is null
        and cardinality(target.invitation_admin_permissions)=0 and mp.membership_permission_admin_permission='guards')) for share of m,mp;
  if not found then return false; end if;
  return not exists(select 1 from unnest(target.invitation_admin_permissions) requested where not exists(
    select 1 from public.membership m join public.person p using(tenant_id,person_id) join public.membership_permission mp using(tenant_id,membership_id)
    where m.tenant_id=target.tenant_id and p.user_id=target.invitation_created_by_user_id and m.membership_role='tenant_admin'
      and m.membership_status='active' and m.membership_valid_from<=now() and (m.membership_valid_to is null or now()<m.membership_valid_to)
      and mp.membership_permission_admin_permission=requested));
end;
$$;

create or replace function public.create_invitation(target_tenant_id uuid, invited_email text, target_role public.membership_role,
  client_event_id uuid, target_person_id uuid default null, first_name text default null, last_name text default null,
  admin_permissions public.admin_permission[] default '{}')
returns table (invitation_id uuid, invitation_token text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  actor uuid := app_private.current_user_id();
  recipient text := lower(btrim(invited_email));
  granted public.admin_permission[] := coalesce(admin_permissions, '{}');
  -- L2: the secret is generated here (256 bits); only its SHA256 digest is stored and the secret is returned once,
  -- to the creating caller (the email function). Clients never choose the secret or the expiry.
  secret text := encode(extensions.gen_random_bytes(32), 'hex');
  existing public.invitation;
  created_id uuid;
begin
  -- Authorize first (D17): grantor authority for the role and every permission, no support identity, no self-invitation.
  if actor is null or target_role is null or not app_private.can_invite(target_tenant_id, target_role, granted)
    or recipient = app_private.verified_email() then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  -- Guards-only managers cannot invite a resident identity into a different role.
  if target_role='guard' and target_person_id is not null and not app_private.is_platform_admin()
    and target_tenant_id not in(select app_private.writable_permission_tenant_ids('registry'))
    and not exists(select 1 from public.membership m where m.tenant_id=target_tenant_id
      and m.person_id=target_person_id and m.membership_role='guard') then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  if create_invitation.client_event_id is null then
    raise exception 'Invalid invitation input' using errcode='22023'; end if;
  -- Retries with the same client_event_id are serialized and bound to the original creator, tenant, recipient, target,
  -- role and permissions. A delivered invitation is never re-issued (no second email); an undelivered one gets a fresh
  -- secret, so a secret from a failed delivery stops working. The expiry never moves.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(create_invitation.client_event_id::text, 0));
  select i.* into existing from public.invitation i where i.client_event_id = create_invitation.client_event_id for update;
  if found then
    if existing.tenant_id is distinct from target_tenant_id or existing.invitation_created_by_user_id is distinct from actor
      or existing.invitation_email is distinct from recipient or existing.invitation_membership_role is distinct from target_role
      or existing.invitation_admin_permissions is distinct from granted or existing.person_id is distinct from target_person_id
      or existing.invitation_status <> 'pending' or existing.invitation_expires_at <= statement_timestamp() then
      raise exception 'Invitation management denied' using errcode='42501'; end if;
    if existing.invitation_delivered_at is not null then
      return query select existing.invitation_id, null::text;
      return;
    end if;
    update public.invitation i set invitation_token_hash = encode(extensions.digest(secret, 'sha256'), 'hex')
      where i.invitation_id = existing.invitation_id;
    return query select existing.invitation_id, secret;
    return;
  end if;
  if target_person_id is not null then
    -- The target must be an unclaimed person of this tenant, locked against concurrent binding and invitations.
    perform 1 from public.person p where p.tenant_id = target_tenant_id and p.person_id = target_person_id
      and p.user_id is null for update;
    if not found then raise exception 'Invitation management denied' using errcode='42501'; end if;
    -- H1: at most one live invitation per person, so two grants can never compete to bind the same identity.
    if exists(select 1 from public.invitation i where i.tenant_id = target_tenant_id and i.person_id = target_person_id
        and i.invitation_status = 'pending' and i.invitation_expires_at > statement_timestamp()) then
      raise exception 'Invitation management denied' using errcode='42501'; end if;
  end if;
  insert into public.invitation(tenant_id,invitation_email,person_id,invitation_first_name,invitation_last_name,
    invitation_membership_role,invitation_admin_permissions,invitation_token_hash,invitation_expires_at,
    invitation_created_by_user_id,client_event_id)
  values(target_tenant_id,recipient,target_person_id,first_name,last_name,target_role,granted,
    encode(extensions.digest(secret, 'sha256'), 'hex'),statement_timestamp()+interval '7 days',actor,
    create_invitation.client_event_id)
  returning invitation_id into created_id;
  return query select created_id, secret;
end;
$$;

create or replace function public.revoke_invitation(target_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app_private.is_impersonating() or (not app_private.is_platform_admin()
    and not exists(select app_private.permission_tenant_ids('registry'))
    and not exists(select app_private.writable_permission_tenant_ids('guards'))
    and not exists(select app_private.permission_tenant_ids('admin_management'))) then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  perform 1 from public.invitation i where i.invitation_id=target_invitation_id
    and app_private.can_invite(i.tenant_id,i.invitation_membership_role,i.invitation_admin_permissions) for update;
  if not found then raise exception 'Invitation management denied' using errcode='42501'; end if;
  update public.invitation set invitation_status='revoked' where invitation_id=target_invitation_id and invitation_status='pending';
end;
$$;

-- Keep the existing management helper for registry/admin/platform callers; the new branch only revokes guards.
grant execute on function app_private.lock_managed_membership(uuid,boolean,public.membership_role) to registry_writer;
grant create on schema public to registry_writer;
alter function public.revoke_membership(uuid) owner to registry_writer;
set role registry_writer;
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
  update public.membership set membership_status='revoked' where membership_id=target.membership_id;
end;
$$;
revoke all on function public.revoke_membership(uuid) from public,anon,service_role;
grant execute on function public.revoke_membership(uuid) to authenticated;

-- No person or membership RLS policy is broadened. Project only guard-management fields.
create function public.list_tenant_guards(target_tenant_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guards jsonb; invitations jsonb;
begin
  if target_tenant_id is null or (target_tenant_id not in(select app_private.permission_tenant_ids('guards'))
    and target_tenant_id not in(select app_private.permission_tenant_ids('registry'))) then
    raise exception 'Guard management denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id',m.membership_id,'person_id',p.person_id,
    'person_first_name',p.person_first_name,'person_last_name',p.person_last_name,'person_email',p.person_email,
    'membership_status',m.membership_status,'membership_valid_from',m.membership_valid_from,'membership_valid_to',m.membership_valid_to,
    'gates',(select coalesce(jsonb_agg(jsonb_build_object('gate_id',g.gate_id,'gate_name',g.gate_name)
      order by g.gate_name,g.gate_id),'[]'::jsonb) from public.gate_guard gg join public.gate g using(tenant_id,gate_id)
      where gg.tenant_id=m.tenant_id and gg.membership_id=m.membership_id))
    order by p.person_last_name,p.person_first_name,m.membership_id),'[]'::jsonb) into guards
    from public.membership m join public.person p using(tenant_id,person_id)
    where m.tenant_id=target_tenant_id and m.membership_role='guard';
  select coalesce(jsonb_agg(jsonb_build_object(
    'invitation_id',i.invitation_id,'invitation_email',i.invitation_email,
    'invitation_first_name',i.invitation_first_name,'invitation_last_name',i.invitation_last_name,
    'invitation_status',i.invitation_status,'invitation_expires_at',i.invitation_expires_at,
    'invitation_delivered_at',i.invitation_delivered_at) order by i.invitation_created_at,i.invitation_id),'[]'::jsonb)
    into invitations from public.invitation i where i.tenant_id=target_tenant_id
      and i.invitation_membership_role='guard' and i.invitation_status='pending';
  return jsonb_build_object('guards',guards,'pending_invitations',invitations);
end;
$$;
revoke all on function public.list_tenant_guards(uuid) from public,anon,service_role;
grant execute on function public.list_tenant_guards(uuid) to authenticated;
reset role;
revoke create on schema public from registry_writer;

