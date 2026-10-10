-- M01: every exposed RPC, as complete definitions. Authorize the caller first, then look up and lock targets.

-- H0 management RPCs (20261009000000, frozen) upgraded to the central identity and to read-only enforcement:
-- suspended callers are rejected through writable_permission_tenant_ids before any target lookup or lock.
create or replace function app_private.lock_managed_membership(target_membership_id uuid, require_admin_management boolean,
  desired_role public.membership_role default null)
returns public.membership language plpgsql security definer set search_path = '' as $$
declare target public.membership;
begin
  if not (select app_private.is_platform_admin())
    and not exists (select app_private.writable_permission_tenant_ids('admin_management'))
    and (require_admin_management or not exists (select app_private.writable_permission_tenant_ids('registry'))) then
    raise exception 'Membership management denied' using errcode = '42501';
  end if;
  select m.* into target from public.membership m join public.person p
    on (p.tenant_id, p.person_id) = (m.tenant_id, m.person_id)
  where m.membership_id = target_membership_id and p.user_id is distinct from app_private.current_user_id()
    and ((select app_private.is_platform_admin())
      or ((m.membership_role = 'tenant_admin' or desired_role = 'tenant_admin' or require_admin_management)
        and m.tenant_id in (select app_private.writable_permission_tenant_ids('admin_management')))
      or (not require_admin_management and m.membership_role <> 'tenant_admin' and desired_role is distinct from 'tenant_admin'::public.membership_role
        and m.tenant_id in (select app_private.writable_permission_tenant_ids('registry'))))
    and (not require_admin_management or m.membership_role = 'tenant_admin')
  for update of m;
  if not found then raise exception 'Membership management denied' using errcode = '42501'; end if;
  if not (select app_private.is_platform_admin()) then
    -- Hold the caller's management authority until the transaction completes.
    perform 1 from public.membership m join public.person p on (p.tenant_id,p.person_id)=(m.tenant_id,m.person_id)
      join public.membership_permission mp on (mp.tenant_id,mp.membership_id)=(m.tenant_id,m.membership_id)
    where m.tenant_id = target.tenant_id and p.user_id = app_private.current_user_id()
      and m.membership_role = 'tenant_admin' and m.membership_status = 'active'
      and m.membership_valid_from <= now() and (m.membership_valid_to is null or now() < m.membership_valid_to)
      and mp.membership_permission_admin_permission = case
        when target.membership_role = 'tenant_admin' or desired_role = 'tenant_admin' or require_admin_management
          then 'admin_management'::public.admin_permission else 'registry'::public.admin_permission end
    for share of m, mp;
    if not found then raise exception 'Membership management denied' using errcode = '42501'; end if;
  end if;
  return target;
end;
$$;
create or replace function public.create_membership(target_person_id uuid, target_role public.membership_role,
  valid_from timestamptz default now(), valid_to timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid; new_membership_id uuid;
begin
  if not (select app_private.is_platform_admin())
    and not exists (select app_private.writable_permission_tenant_ids('admin_management'))
    and (target_role = 'tenant_admin' or not exists (select app_private.writable_permission_tenant_ids('registry'))) then
    raise exception 'Membership management denied' using errcode = '42501';
  end if;
  select p.tenant_id into target_tenant_id from public.person p where p.person_id = target_person_id
    and p.user_id is distinct from app_private.current_user_id()
    and ((select app_private.is_platform_admin()) or p.tenant_id in (
      select app_private.writable_permission_tenant_ids(case when target_role = 'tenant_admin' then 'admin_management'::public.admin_permission else 'registry'::public.admin_permission end)));
  if not found then raise exception 'Membership management denied' using errcode = '42501'; end if;
  insert into public.membership (tenant_id, person_id, membership_role, membership_valid_from, membership_valid_to)
    values (target_tenant_id, target_person_id, target_role, valid_from, valid_to) returning membership_id into new_membership_id;
  return new_membership_id;
end;
$$;
create or replace function public.update_membership(target_membership_id uuid, target_role public.membership_role,
  target_status public.membership_status, valid_from timestamptz, valid_to timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.membership;
begin
  target := app_private.lock_managed_membership(target_membership_id, false, target_role);
  if (target.membership_role = 'tenant_admin' or target_role = 'tenant_admin')
    and not (select app_private.is_platform_admin())
    and target.tenant_id not in (select app_private.writable_permission_tenant_ids('admin_management')) then
    raise exception 'Membership management denied' using errcode = '42501';
  end if;
  update public.membership set membership_role = target_role, membership_status = target_status,
    membership_valid_from = valid_from, membership_valid_to = valid_to where membership_id = target_membership_id;
end;
$$;
create or replace function public.grant_admin_permission(target_membership_id uuid, target_permission public.admin_permission) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.membership;
begin
  target := app_private.lock_managed_membership(target_membership_id, true);
  if not (select app_private.is_platform_admin()) then
    -- Lock grantor authority against concurrent revocation/suspension.
    perform 1 from public.membership m join public.person p on (p.tenant_id,p.person_id)=(m.tenant_id,m.person_id)
      join public.membership_permission mp on (mp.tenant_id,mp.membership_id)=(m.tenant_id,m.membership_id)
    where m.tenant_id = target.tenant_id and p.user_id = app_private.current_user_id()
      and m.membership_role = 'tenant_admin' and m.membership_status = 'active'
      and m.membership_valid_from <= now() and (m.membership_valid_to is null or now() < m.membership_valid_to)
      and mp.membership_permission_admin_permission = target_permission for share of m, mp;
    if not found then raise exception 'Permission grant denied' using errcode = '42501'; end if;
  end if;
  insert into public.membership_permission (tenant_id, membership_id, membership_permission_admin_permission)
    values (target.tenant_id, target.membership_id, target_permission)
    on conflict (tenant_id, membership_id, membership_permission_admin_permission) do nothing;
end;
$$;

create function public.create_tenant(tenant_name text, tenant_slug text, tenant_address text default null,
  tenant_time_zone text default 'America/Argentina/Tucuman',
  tenant_subscription_status public.tenant_subscription_status default 'pilot', tenant_logo_path text default null,
  client_event_id uuid default gen_random_uuid()) returns uuid
language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if not app_private.is_platform_admin() then raise exception 'MFA platform administrator required' using errcode='42501'; end if;
  if tenant_name is null or length(btrim(tenant_name)) not between 1 and 200 or tenant_slug is null
    or tenant_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=tenant_time_zone) then
    raise exception 'Invalid tenant input' using errcode='22023'; end if;
  created_id:=client_event_id;
  if tenant_logo_path is not null and tenant_logo_path not like created_id::text||'/%' then
    raise exception 'Invalid tenant logo path' using errcode='22023'; end if;
  insert into public.tenant(tenant_id,tenant_name,tenant_slug,tenant_address,tenant_time_zone,tenant_subscription_status,tenant_logo_path,tenant_settings,client_event_id)
  values(created_id,btrim(tenant_name),tenant_slug,tenant_address,tenant_time_zone,tenant_subscription_status,tenant_logo_path,
    '{"locale":"es-AR","currency":"ARS"}'::jsonb,client_event_id)
  on conflict on constraint tenant_client_event_id_key do nothing returning tenant_id into created_id;
  if created_id is null then
    select t.tenant_id into created_id from public.tenant t where t.client_event_id=create_tenant.client_event_id
      and t.tenant_slug=create_tenant.tenant_slug and t.tenant_name=btrim(create_tenant.tenant_name);
    if not found then raise exception 'Idempotency key conflict' using errcode='22023'; end if;
  end if;
  return created_id;
end;
$$;

-- UX routing only: this is not an authorization primitive.
create function public.current_user_is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.current_identity_is_valid() and not app_private.is_impersonating()
    and exists(select 1 from public.platform_admin a where a.user_id=app_private.current_user_id() and a.platform_admin_is_active);
$$;

-- M01-F02: a user whose only memberships are in cancelled tenants must learn why they cannot enter.
-- Cancelled tenants are (correctly) invisible to RLS, so this narrow definer function discloses just the caller's
-- OWN active memberships' tenant id and name. It consumes the central identity validator and is empty for support
-- tokens, so impersonation can never be used to learn about cancelled memberships.
create function public.current_user_cancelled_tenants()
returns table (tenant_id uuid, tenant_name text)
language sql stable security definer set search_path = '' as $$
  select distinct t.tenant_id, t.tenant_name
  from public.tenant t
    join public.membership m on m.tenant_id = t.tenant_id
    join public.person p on p.tenant_id = m.tenant_id and p.person_id = m.person_id
  where app_private.current_identity_is_valid()
    and not app_private.is_impersonating()
    and p.user_id = app_private.current_user_id()
    and t.tenant_subscription_status = 'cancelled'
    and m.membership_status = 'active'
    and m.membership_valid_from <= now()
    and (m.membership_valid_to is null or now() < m.membership_valid_to)
  order by t.tenant_name, t.tenant_id;
$$;

-- Invitations (M01-F01, D17).
create function public.create_invitation(target_tenant_id uuid, invited_email text, target_role public.membership_role,
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
-- L5: the email function records a successful delivery, so a retry with the same client_event_id never mails again.
create function public.mark_invitation_delivered(target_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app_private.is_impersonating() or app_private.current_user_id() is null then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  perform 1 from public.invitation i where i.invitation_id=target_invitation_id
    and i.invitation_created_by_user_id=app_private.current_user_id() and i.invitation_status='pending'
    and app_private.can_invite(i.tenant_id,i.invitation_membership_role,i.invitation_admin_permissions) for update;
  if not found then raise exception 'Invitation management denied' using errcode='42501'; end if;
  update public.invitation set invitation_delivered_at=statement_timestamp()
    where invitation_id=target_invitation_id and invitation_delivered_at is null;
end;
$$;
create function public.revoke_invitation(target_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app_private.is_impersonating() or (not app_private.is_platform_admin()
    and not exists(select app_private.permission_tenant_ids('registry'))
    and not exists(select app_private.permission_tenant_ids('admin_management'))) then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  perform 1 from public.invitation i where i.invitation_id=target_invitation_id
    and app_private.can_invite(i.tenant_id,i.invitation_membership_role,i.invitation_admin_permissions) for update;
  if not found then raise exception 'Invitation management denied' using errcode='42501'; end if;
  update public.invitation set invitation_status='revoked' where invitation_id=target_invitation_id and invitation_status='pending';
end;
$$;
create function public.accept_invitation(token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target public.invitation; actor uuid; target_person public.person; created_membership uuid;
begin
  -- The shared gate authorizes first: valid non-support identity, email-verified session, pending unexpired invitation
  -- for that verified email in an available tenant, fixed-work hash check and the grantor's current authority.
  target := app_private.pending_invitation_for_token(token, true);
  actor := app_private.current_user_id();
  if actor is null then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  -- Serializes same-user acceptance in the tenant across different invitations.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target.tenant_id::text||actor::text,0));
  if target.person_id is null then
    -- L5: an existing member of the tenant receives the new role on their own person; anyone else gets a new person.
    select p.* into target_person from public.person p where p.tenant_id=target.tenant_id and p.user_id=actor for update;
    if not found then
      insert into public.person(tenant_id,user_id,person_first_name,person_last_name)
        values(target.tenant_id,actor,target.invitation_first_name,target.invitation_last_name) returning * into target_person;
    end if;
  else
    -- H1: lock the invited person and bind it only while it is unclaimed. A person already bound to any account (for
    -- example through a competing invitation) makes this invitation unusable; the grant never follows the person.
    select p.* into target_person from public.person p where p.tenant_id=target.tenant_id and p.person_id=target.person_id
      for update;
    if not found or target_person.user_id is not null then
      raise exception 'Invitation unavailable' using errcode='42501'; end if;
    update public.person p set user_id=actor
      where p.tenant_id=target.tenant_id and p.person_id=target_person.person_id and p.user_id is null
      returning p.* into target_person;
    if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  end if;
  -- The membership and every permission can only ever land on the accepting caller's own person.
  if target_person.user_id is distinct from actor or target_person.tenant_id is distinct from target.tenant_id then
    raise exception 'Invitation unavailable' using errcode='42501'; end if;
  if exists(select 1 from public.membership m where m.tenant_id=target.tenant_id and m.person_id=target_person.person_id
      and m.membership_role=target.invitation_membership_role and m.membership_status='active'
      and (m.membership_valid_to is null or now()<m.membership_valid_to)) then
    raise exception 'Invitation unavailable' using errcode='42501'; end if;
  insert into public.membership(tenant_id,person_id,membership_role)
    values(target.tenant_id,target_person.person_id,target.invitation_membership_role) returning membership_id into created_membership;
  insert into public.membership_permission(tenant_id,membership_id,membership_permission_admin_permission)
    select target.tenant_id,created_membership,p from (select distinct unnest(target.invitation_admin_permissions) p) granted;
  update public.invitation set person_id=target_person.person_id,invitation_status='accepted',
    invitation_accepted_at=statement_timestamp(),invitation_accepted_by_user_id=actor where invitation_id=target.invitation_id;
  -- H1: once the person is bound, any other pending invitation for it can no longer be honoured.
  update public.invitation set invitation_status='revoked' where tenant_id=target.tenant_id
    and person_id=target_person.person_id and invitation_status='pending' and invitation_id<>target.invitation_id;
  return created_membership;
exception when unique_violation or check_violation then raise exception 'Invitation unavailable' using errcode='42501';
end;
$$;
-- Read only, no audit, no state change: just the two facts the confirmation screen shows.
create function public.preview_invitation(token text)
returns table (tenant_name text, invitation_membership_role public.membership_role)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare target public.invitation;
begin
  target := app_private.pending_invitation_for_token(token, false);
  return query select t.tenant_name, target.invitation_membership_role
    from public.tenant t where t.tenant_id = target.tenant_id;
end;
$$;

-- Support sessions (M01-F04, D18).
create function public.start_support_session(target_tenant_id uuid, target_user_id uuid, reason text,
  client_event_id uuid, duration_minutes integer default 30) returns public.support_session
language plpgsql security definer set search_path = '' as $$
declare result public.support_session;
begin
  if not app_private.is_platform_admin() then raise exception 'MFA platform administrator required' using errcode='42501'; end if;
  if duration_minutes is null or duration_minutes not between 1 and 60 or reason is null or length(btrim(reason)) not between 1 and 500 then
    raise exception 'Invalid support session input' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(app_private.current_user_id()::text,0));
  if exists(select 1 from public.platform_admin a where a.user_id=target_user_id)
    or not exists(select 1 from public.person p join public.membership m using(tenant_id,person_id)
      where p.user_id=target_user_id and p.tenant_id=target_tenant_id and m.membership_status='active'
      and m.membership_valid_from<=now() and (m.membership_valid_to is null or now()<m.membership_valid_to)) then
    raise exception 'Support session denied' using errcode='42501'; end if;
  select s.* into result from public.support_session s where s.client_event_id=start_support_session.client_event_id
    and s.support_session_actor_user_id=app_private.current_user_id() and s.tenant_id=target_tenant_id
    and s.support_session_target_user_id=target_user_id;
  if found then
    if result.support_session_status<>'active' or result.support_session_expires_at<=statement_timestamp() then
      raise exception 'Support session denied' using errcode='42501'; end if;
    return result;
  end if;
  update public.support_session set support_session_status='expired',support_session_ended_at=statement_timestamp(),
    support_session_ended_by_user_id=app_private.current_user_id()
    where support_session_actor_user_id=app_private.current_user_id() and support_session_status='active'
      and support_session_expires_at<=statement_timestamp();
  if exists(select 1 from public.support_session s where s.support_session_actor_user_id=app_private.current_user_id() and s.support_session_status='active') then
    raise exception 'Support session already active' using errcode='55000'; end if;
  insert into public.support_session(tenant_id,support_session_actor_user_id,support_session_target_user_id,
    support_session_reason,support_session_duration_minutes_count,support_session_started_at,support_session_expires_at,client_event_id)
  values(target_tenant_id,app_private.current_user_id(),target_user_id,btrim(reason),duration_minutes,statement_timestamp(),
    statement_timestamp()+duration_minutes*interval '1 minute',client_event_id) returning * into result;
  return result;
end;
$$;
create function public.end_support_session(target_support_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_platform_admin() and app_private.current_support_session_id() is distinct from target_support_session_id then
    raise exception 'Support session denied' using errcode='42501'; end if;
  update public.support_session set support_session_status='ended',support_session_ended_at=statement_timestamp(),
    support_session_ended_by_user_id=app_private.current_user_id()
  where support_session_id=target_support_session_id and support_session_status='active'
    and (support_session_actor_user_id=app_private.current_user_id() or support_session_id=app_private.current_support_session_id());
end;
$$;
-- L3: any MFA platform administrator can stop any live session immediately (incident response). Support identities,
-- non-MFA callers and tenant users cannot. The change is audited with the revoking actor, the target and the session;
-- the next request with the support token fails the identity validator.
create function public.revoke_support_session(target_support_session_id uuid, reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_platform_admin() then
    raise exception 'MFA platform administrator required' using errcode='42501'; end if;
  if reason is null or length(btrim(reason)) not between 1 and 500 then
    raise exception 'Invalid support session input' using errcode='22023'; end if;
  update public.support_session set support_session_status='revoked',support_session_ended_at=statement_timestamp(),
    support_session_ended_by_user_id=app_private.current_user_id(),support_session_revocation_reason=btrim(reason)
  where support_session_id=target_support_session_id and support_session_status='active';
  if not found then raise exception 'Support session denied' using errcode='42501'; end if;
end;
$$;
-- M01-F04: a platform administrator has no standing registry access, so choosing the user to support needs a
-- dedicated, minimized and audited lookup. It exposes only user id, first/last name and role of ACTIVE memberships
-- (never email, document, phone or birth date), excludes platform administrators, and records every call.
create function public.list_support_targets(target_tenant_id uuid, search text default null)
returns table (user_id uuid, person_first_name text, person_last_name text, membership_role public.membership_role)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  term text := nullif(btrim(search), '');
  pattern text;
  result jsonb;
begin
  -- Authorize first. Support tokens fail is_platform_admin(), so they get the same denial as ordinary users.
  if not app_private.is_platform_admin() then
    raise exception 'MFA platform administrator required' using errcode = '42501'; end if;
  if not exists (select 1 from public.tenant t where t.tenant_id = target_tenant_id
    and t.tenant_subscription_status <> 'cancelled') then
    raise exception 'Support target lookup denied' using errcode = '42501'; end if;
  if term is not null and length(term) > 100 then
    raise exception 'Invalid support target search' using errcode = '22023'; end if;
  if term is not null then
    pattern := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.person_last_name, q.person_first_name, q.membership_role), '[]'::jsonb)
    into result
    from (
      select p.user_id, p.person_first_name, p.person_last_name, m.membership_role
      from public.person p
        join public.membership m on m.tenant_id = p.tenant_id and m.person_id = p.person_id
      where p.tenant_id = target_tenant_id and p.user_id is not null
        and m.membership_status = 'active' and m.membership_valid_from <= now()
        and (m.membership_valid_to is null or now() < m.membership_valid_to)
        and not exists (select 1 from public.platform_admin a where a.user_id = p.user_id)
        and (pattern is null or (p.person_first_name || ' ' || p.person_last_name) ilike pattern escape '\')
      order by p.person_last_name, p.person_first_name, m.membership_role
      limit 50) q;
  perform app_private.record_support_target_lookup(app_private.current_user_id(), target_tenant_id,
    coalesce(length(term), 0), jsonb_array_length(result));
  return query select (e.item ->> 'user_id')::uuid, e.item ->> 'person_first_name', e.item ->> 'person_last_name',
    (e.item ->> 'membership_role')::public.membership_role
    from jsonb_array_elements(result) with ordinality e(item, position) order by e.position;
end;
$$;

revoke all on function public.create_tenant(text,text,text,text,public.tenant_subscription_status,text,uuid),
  public.current_user_is_platform_admin(),public.current_user_cancelled_tenants(),
  public.create_invitation(uuid,text,public.membership_role,uuid,uuid,text,text,public.admin_permission[]),
  public.mark_invitation_delivered(uuid),public.revoke_invitation(uuid),public.accept_invitation(text),
  public.preview_invitation(text),public.start_support_session(uuid,uuid,text,uuid,integer),
  public.end_support_session(uuid),public.revoke_support_session(uuid,text),public.list_support_targets(uuid,text) from public,anon,service_role;
grant execute on function public.create_tenant(text,text,text,text,public.tenant_subscription_status,text,uuid),
  public.current_user_is_platform_admin(),public.current_user_cancelled_tenants(),
  public.create_invitation(uuid,text,public.membership_role,uuid,uuid,text,text,public.admin_permission[]),
  public.mark_invitation_delivered(uuid),public.revoke_invitation(uuid),public.accept_invitation(text),
  public.preview_invitation(text),public.start_support_session(uuid,uuid,text,uuid,integer),
  public.end_support_session(uuid),public.revoke_support_session(uuid,text),public.list_support_targets(uuid,text) to authenticated;

-- accept_invitation runs as the isolated consent capability, which keeps no CREATE on public afterwards.
grant create on schema public to invitation_acceptor;
alter function public.accept_invitation(text) owner to invitation_acceptor;
revoke create on schema public from invitation_acceptor;
