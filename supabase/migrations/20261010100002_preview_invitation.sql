-- M01-F01/D17: the invitee must see WHERE they are joining and AS WHAT before they accept, but cannot read tenant or
-- invitation rows. One private helper holds the whole acceptance gate; accept_invitation (which locks the row) and
-- preview_invitation (read only) both call it, so the two can never drift apart. Every failure is the same uniform
-- error: missing, expired, revoked, replayed, wrong-email, unverified and support-token requests are indistinguishable.
create function app_private.pending_invitation_for_token(token text, lock_row boolean) returns public.invitation
language plpgsql security definer set search_path = '' as $$
declare actor uuid := app_private.current_user_id(); email text := app_private.verified_email(); target public.invitation;
begin
  if actor is null or email is null or app_private.is_impersonating() or token is null or length(token) <> 64 then
    raise exception 'Invitation unavailable' using errcode = '42501'; end if;
  -- Lookup by a fixed-length SHA256 digest; no raw secret comparison or branching on a prefix.
  if lock_row then
    select i.* into target from public.invitation i where i.invitation_token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
      and i.invitation_email = email and i.invitation_status = 'pending' and i.invitation_expires_at > statement_timestamp()
      and exists(select 1 from public.tenant t where t.tenant_id = i.tenant_id and t.tenant_subscription_status in ('pilot', 'active')) for update;
  else
    select i.* into target from public.invitation i where i.invitation_token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
      and i.invitation_email = email and i.invitation_status = 'pending' and i.invitation_expires_at > statement_timestamp()
      and exists(select 1 from public.tenant t where t.tenant_id = i.tenant_id and t.tenant_subscription_status in ('pilot', 'active'));
  end if;
  -- Fixed-work hash comparison (also for a missing row) and the grantor's CURRENT authority, as in migration 3.
  if not app_private.constant_time_hash_equal(coalesce(target.invitation_token_hash, repeat('0', 64)),
      encode(extensions.digest(token, 'sha256'), 'hex')) or target.invitation_id is null
    or not app_private.invitation_grant_is_valid(target.invitation_id) then
    raise exception 'Invitation unavailable' using errcode = '42501'; end if;
  return target;
end;
$$;
revoke all on function app_private.pending_invitation_for_token(text, boolean) from public, anon, authenticated, service_role;
grant execute on function app_private.pending_invitation_for_token(text, boolean) to invitation_acceptor;

-- accept_invitation is owned by the isolated consent capability; replace it as that role.
grant create on schema public to invitation_acceptor;
set role invitation_acceptor;
create or replace function public.accept_invitation(token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target public.invitation; actor uuid; target_person uuid; created_membership uuid;
begin
  target := app_private.pending_invitation_for_token(token, true);
  actor := app_private.current_user_id();
  -- Serializes same-user acceptance in the tenant across different invitations.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target.tenant_id::text||actor::text,0));
  target_person := target.person_id;
  if target_person is null then
    if exists(select 1 from public.person p where p.tenant_id=target.tenant_id and p.user_id=actor) then
      raise exception 'Invitation unavailable' using errcode='42501'; end if;
    insert into public.person(tenant_id,user_id,person_first_name,person_last_name)
      values(target.tenant_id,actor,target.invitation_first_name,target.invitation_last_name) returning person_id into target_person;
  else
    update public.person set user_id=actor where tenant_id=target.tenant_id and person_id=target_person and user_id is null;
    if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  end if;
  insert into public.membership(tenant_id,person_id,membership_role)
    values(target.tenant_id,target_person,target.invitation_membership_role) returning membership_id into created_membership;
  insert into public.membership_permission(tenant_id,membership_id,membership_permission_admin_permission)
    select target.tenant_id,created_membership,p from (select distinct unnest(target.invitation_admin_permissions) p) granted;
  update public.invitation set person_id=target_person,invitation_status='accepted',invitation_accepted_at=statement_timestamp(),
    invitation_accepted_by_user_id=actor where invitation_id=target.invitation_id;
  return created_membership;
exception when unique_violation or check_violation then raise exception 'Invitation unavailable' using errcode='42501';
end;
$$;
reset role;
revoke create on schema public from invitation_acceptor;

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
revoke all on function public.preview_invitation(text) from public, anon, service_role;
grant execute on function public.preview_invitation(text) to authenticated;
