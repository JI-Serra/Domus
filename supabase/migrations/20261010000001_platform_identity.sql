-- M01: the central identity validator and every tenant-set helper, as complete definitions. The H0 helpers of
-- 20261009000000 are redefined here to consume the validator; the H0 migration itself stays frozen.

-- One validator is the choke point for ALL identities, including Storage.
create function app_private.current_identity_is_valid() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb := (select auth.jwt()); target_session public.support_session;
begin
  if (select auth.uid()) is null then return false; end if;
  if not (claims ? 'support_session_id' or claims ? 'impersonator_user_id') then return true; end if;
  if claims ->> 'support_session_id' is null or claims ->> 'impersonator_user_id' is null
    or claims ->> 'aal' <> 'aal1' then return false; end if;
  select s.* into target_session from public.support_session s
    where s.support_session_id = (claims ->> 'support_session_id')::uuid
      and s.support_session_status = 'active' and s.support_session_expires_at > statement_timestamp()
      and s.support_session_target_user_id = (select auth.uid())
      and s.support_session_actor_user_id = (claims ->> 'impersonator_user_id')::uuid
      and s.support_session_id = (claims ->> 'session_id')::uuid
      and s.tenant_id = (claims ->> 'support_tenant_id')::uuid
      and (claims ->> 'exp')::numeric <= extract(epoch from s.support_session_expires_at)
      and (claims ->> 'exp')::numeric > extract(epoch from statement_timestamp())
      and claims ->> 'impersonator_aal' = 'aal2';
  if not found then return false; end if;
  return exists (select 1 from public.platform_admin a where a.user_id = target_session.support_session_actor_user_id
      and a.platform_admin_is_active)
    and not exists (select 1 from public.platform_admin a where a.user_id = target_session.support_session_target_user_id)
    and not exists (select 1 from auth.sessions a where a.id = target_session.support_session_id);
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;
$$;
create function app_private.is_impersonating() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.jwt()) ? 'support_session_id' or (select auth.jwt()) ? 'impersonator_user_id';
$$;
create function app_private.current_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when app_private.current_identity_is_valid() then (select auth.uid()) end;
$$;
create function app_private.current_support_session_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when app_private.current_identity_is_valid() and app_private.is_impersonating()
    then ((select auth.jwt())->>'support_session_id')::uuid end;
$$;
create or replace function app_private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.current_identity_is_valid() and not app_private.is_impersonating()
    and coalesce((select auth.jwt())->>'aal' = 'aal2', false)
    and exists (select 1 from public.platform_admin a where a.user_id = app_private.current_user_id() and a.platform_admin_is_active);
$$;
-- Even directly callable policy helpers reveal only authorized tenant IDs.
-- Avoid calling member_tenant_ids here: that helper consumes this set.
create function app_private.identity_tenant_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t.tenant_id from public.tenant t where app_private.current_identity_is_valid()
    and (app_private.is_platform_admin() or (
      t.tenant_subscription_status <> 'cancelled'
      and exists(select 1 from public.membership m join public.person p using(tenant_id,person_id)
        where m.tenant_id=t.tenant_id and p.user_id=app_private.current_user_id()
          and m.membership_status='active' and m.membership_valid_from<=now()
          and (m.membership_valid_to is null or now()<m.membership_valid_to))
      and (not app_private.is_impersonating()
        or t.tenant_id=((select auth.jwt())->>'support_tenant_id')::uuid)));
$$;
create or replace function app_private.member_tenant_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.tenant_id from public.membership m join public.person p using (tenant_id, person_id)
    join public.tenant t using (tenant_id)
  where p.user_id = app_private.current_user_id() and m.membership_status = 'active'
    and m.membership_valid_from <= now() and (m.membership_valid_to is null or now() < m.membership_valid_to)
    and t.tenant_subscription_status <> 'cancelled' and m.tenant_id in (select app_private.identity_tenant_ids());
$$;
create or replace function app_private.role_tenant_ids(target_roles public.membership_role[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.tenant_id from public.membership m join public.person p using (tenant_id, person_id)
  where p.user_id = app_private.current_user_id() and m.membership_status = 'active'
    and m.membership_valid_from <= now() and (m.membership_valid_to is null or now() < m.membership_valid_to)
    and m.membership_role = any(target_roles) and m.tenant_id in (select app_private.member_tenant_ids());
$$;
create or replace function app_private.permission_tenant_ids(target_permission public.admin_permission) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.tenant_id from public.membership m join public.person p using (tenant_id, person_id)
    join public.membership_permission mp using (tenant_id, membership_id)
  where p.user_id = app_private.current_user_id() and m.membership_status = 'active' and m.membership_role = 'tenant_admin'
    and m.membership_valid_from <= now() and (m.membership_valid_to is null or now() < m.membership_valid_to)
    and mp.membership_permission_admin_permission = target_permission and m.tenant_id in (select app_private.member_tenant_ids());
$$;
create or replace function app_private.own_membership_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.membership_id from public.membership m join public.person p using (tenant_id, person_id)
  where p.user_id = app_private.current_user_id() and m.membership_status = 'active'
    and m.membership_valid_from <= now() and (m.membership_valid_to is null or now() < m.membership_valid_to)
    and m.tenant_id in (select app_private.member_tenant_ids());
$$;
create or replace function app_private.current_person_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.person_id from public.person p where p.user_id = app_private.current_user_id()
    and p.tenant_id in (select app_private.member_tenant_ids());
$$;

-- Subscription status: suspended tenants are read-only, cancelled tenants are invisible (member_tenant_ids).
create function app_private.tenant_allows_writes(target_tenant_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.is_platform_admin() or (target_tenant_id in (select app_private.member_tenant_ids())
    and exists (select 1 from public.tenant t where t.tenant_id = target_tenant_id and t.tenant_subscription_status in ('pilot','active')));
$$;
create function app_private.writable_tenant_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t.tenant_id from public.tenant t where app_private.is_platform_admin()
    or (t.tenant_subscription_status in ('pilot','active') and t.tenant_id in (select app_private.member_tenant_ids()));
$$;
create function app_private.writable_permission_tenant_ids(target_permission public.admin_permission) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t from app_private.permission_tenant_ids(target_permission) t where t in (select app_private.writable_tenant_ids());
$$;
-- M05 must explicitly create a narrowly granted gate RPC owned by a dedicated
-- NOLOGIN role and a table-specific trigger exemption. Never use a client claim
-- or a set_config flag as an exemption. No gate exemption exists in H1.
create function app_private.enforce_tenant_writes() returns trigger
language plpgsql set search_path = '' as $$
declare target_tenant_id uuid := coalesce(new.tenant_id, old.tenant_id);
begin
  if current_user in ('postgres','supabase_admin','service_role') then
    -- Definer RPCs still originate from authenticated; service writes have no user.
    if coalesce(nullif(current_setting('role',true),'none'),session_user) <> 'authenticated' then return coalesce(new,old); end if;
  end if;
  if current_user = 'invitation_acceptor' then
    if exists (select 1 from public.tenant t where t.tenant_id = target_tenant_id and t.tenant_subscription_status in ('pilot','active')) then return coalesce(new,old); end if;
  elsif app_private.tenant_allows_writes(target_tenant_id) then return coalesce(new,old); end if;
  raise exception 'Tenant write denied' using errcode = '42501';
end;
$$;
-- Restrictive ALL would also constrain reads; the identity predicate only binds
-- support tenant, while the write CHECK plus trigger handles UPDATE/DELETE.
create trigger enforce_tenant_writes before insert or update or delete on public.tenant
  for each row execute function app_private.enforce_tenant_writes();
create trigger enforce_tenant_writes before insert or update or delete on public.person
  for each row execute function app_private.enforce_tenant_writes();
create trigger enforce_tenant_writes before insert or update or delete on public.membership
  for each row execute function app_private.enforce_tenant_writes();
create trigger enforce_tenant_writes before insert or update or delete on public.membership_permission
  for each row execute function app_private.enforce_tenant_writes();
alter table public.tenant enable always trigger enforce_tenant_writes;
alter table public.person enable always trigger enforce_tenant_writes;
alter table public.membership enable always trigger enforce_tenant_writes;
alter table public.membership_permission enable always trigger enforce_tenant_writes;

-- Invitation authority (D17) and consent helpers.
create function app_private.verified_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id=app_private.current_user_id()
    and not app_private.is_impersonating() and u.email_confirmed_at is not null;
$$;
create function app_private.can_invite(target_tenant_id uuid, target_role public.membership_role,
  permissions public.admin_permission[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select not app_private.is_impersonating() and app_private.current_identity_is_valid()
    and (app_private.is_platform_admin() or (
      app_private.tenant_allows_writes(target_tenant_id)
      and app_private.has_admin_permission(target_tenant_id,case when target_role='tenant_admin'
        then 'admin_management'::public.admin_permission else 'registry'::public.admin_permission end)
      and not exists(select 1 from unnest(permissions) p where not app_private.has_admin_permission(target_tenant_id,p))));
$$;
-- Fixed work for secret-hash comparison, including missing-record failures.
create function app_private.constant_time_hash_equal(left_hash text,right_hash text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare mismatch integer := 0;
begin
  if length(left_hash)<>64 or length(right_hash)<>64 then return false; end if;
  for position in 0..63 loop
    mismatch := mismatch | (ascii(substr(left_hash,position+1,1)) # ascii(substr(right_hash,position+1,1)));
  end loop;
  return mismatch=0;
end;
$$;
-- Pending invitations cannot retain a revoked grantor's authority.
create function app_private.invitation_grant_is_valid(target_invitation_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare target public.invitation; required_permission public.admin_permission;
begin
  if app_private.verified_email() is null or app_private.is_impersonating() then return false; end if;
  select i.* into target from public.invitation i where i.invitation_id=target_invitation_id
    and i.invitation_email=app_private.verified_email() and i.invitation_status='pending';
  if not found then return false; end if;
  perform 1 from public.platform_admin a where a.user_id=target.invitation_created_by_user_id
    and a.platform_admin_is_active for share;
  if found then return true; end if;
  required_permission:=case when target.invitation_membership_role='tenant_admin'
    then 'admin_management'::public.admin_permission else 'registry'::public.admin_permission end;
  -- Hold current grantor authority through binding and permission inserts.
  perform 1 from public.membership m join public.person p using(tenant_id,person_id)
    join public.membership_permission mp using(tenant_id,membership_id)
  where m.tenant_id=target.tenant_id and p.user_id=target.invitation_created_by_user_id
    and m.membership_role='tenant_admin' and m.membership_status='active'
    and m.membership_valid_from<=now() and (m.membership_valid_to is null or now()<m.membership_valid_to)
    and mp.membership_permission_admin_permission=required_permission for share of m,mp;
  if not found then return false; end if;
  return not exists(select 1 from unnest(target.invitation_admin_permissions) requested where not exists(
    select 1 from public.membership m join public.person p using(tenant_id,person_id)
      join public.membership_permission mp using(tenant_id,membership_id)
    where m.tenant_id=target.tenant_id and p.user_id=target.invitation_created_by_user_id
      and m.membership_role='tenant_admin' and m.membership_status='active'
      and m.membership_valid_from<=now() and (m.membership_valid_to is null or now()<m.membership_valid_to)
      and mp.membership_permission_admin_permission=requested));
end;
$$;
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

-- Audit actor resolution and the explicit redaction registry (audit capture itself is in the next migration).
create or replace function app_private.current_actor_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when app_private.current_identity_is_valid() then
    case when app_private.is_impersonating() then ((select auth.jwt())->>'impersonator_user_id')::uuid
      else app_private.current_user_id() end end;
$$;
create or replace function app_private.audit_redacted_columns(target_table text) returns text[]
language sql immutable set search_path = '' as $$
  select case target_table
    when 'person' then array['person_document_number','person_phone','person_birth_date']::text[]
    when 'tenant' then array[]::text[] when 'platform_admin' then array[]::text[]
    when 'membership' then array[]::text[] when 'membership_permission' then array[]::text[]
    when 'invitation' then array['invitation_email','invitation_first_name','invitation_last_name','invitation_token_hash']::text[]
    when 'support_session' then array['support_session_reason']::text[] else null::text[] end;
$$;

-- Private helpers: nothing for PUBLIC/anon; clients get only the policy helper allowlist.
revoke all on function app_private.current_identity_is_valid(),app_private.is_impersonating(),app_private.current_user_id(),
  app_private.current_support_session_id(),app_private.is_platform_admin(),app_private.identity_tenant_ids(),
  app_private.member_tenant_ids(),app_private.role_tenant_ids(public.membership_role[]),
  app_private.permission_tenant_ids(public.admin_permission),app_private.own_membership_ids(),app_private.current_person_ids(),
  app_private.is_tenant_member(uuid),app_private.has_tenant_role(uuid,public.membership_role[]),
  app_private.has_admin_permission(uuid,public.admin_permission),app_private.tenant_allows_writes(uuid),
  app_private.writable_tenant_ids(),app_private.writable_permission_tenant_ids(public.admin_permission),
  app_private.enforce_tenant_writes(),app_private.verified_email(),
  app_private.can_invite(uuid,public.membership_role,public.admin_permission[]),
  app_private.constant_time_hash_equal(text,text),app_private.invitation_grant_is_valid(uuid),
  app_private.pending_invitation_for_token(text,boolean) from public,anon,authenticated,service_role;
grant execute on function app_private.member_tenant_ids(),app_private.role_tenant_ids(public.membership_role[]),
  app_private.permission_tenant_ids(public.admin_permission),app_private.current_person_ids(),app_private.own_membership_ids(),
  app_private.is_tenant_member(uuid),app_private.has_tenant_role(uuid,public.membership_role[]),app_private.has_admin_permission(uuid,public.admin_permission),
  app_private.is_platform_admin(),app_private.current_user_id(),app_private.current_identity_is_valid(),app_private.current_support_session_id(),
  app_private.is_impersonating(),app_private.identity_tenant_ids(),app_private.writable_tenant_ids(),app_private.tenant_allows_writes(uuid) to authenticated;
grant execute on function app_private.current_user_id(),app_private.verified_email(),app_private.is_impersonating(),app_private.tenant_allows_writes(uuid),
  app_private.constant_time_hash_equal(text,text),app_private.invitation_grant_is_valid(uuid),
  app_private.pending_invitation_for_token(text,boolean) to invitation_acceptor;
grant execute on function app_private.current_identity_is_valid(),app_private.current_user_id(),
  app_private.current_support_session_id(),app_private.is_impersonating(),app_private.can_invite(uuid,public.membership_role,public.admin_permission[]) to audit_writer;
