-- M01: platform onboarding, invitation consent and exceptional support access.
create type public.unit_status as enum ('occupied', 'under_construction', 'vacant');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.support_session_status as enum ('active', 'ended', 'revoked', 'expired');
alter table public.tenant add column tenant_billable_unit_statuses public.unit_status[]
  not null default array['occupied','under_construction','vacant']::public.unit_status[];
alter table public.tenant add constraint tenant_billable_unit_statuses_check check (
  cardinality(tenant_billable_unit_statuses) between 1 and 3
  and array_position(tenant_billable_unit_statuses, null) is null);
grant update (tenant_billable_unit_statuses) on public.tenant to authenticated;

create table public.invitation (
  invitation_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(tenant_id),
  invitation_email text not null,
  person_id uuid,
  invitation_first_name text,
  invitation_last_name text,
  invitation_membership_role public.membership_role not null,
  invitation_admin_permissions public.admin_permission[] not null default '{}',
  invitation_token_hash text not null constraint invitation_invitation_token_hash_key unique,
  invitation_expires_at timestamptz not null,
  invitation_status public.invitation_status not null default 'pending',
  invitation_created_by_user_id uuid not null references auth.users(id),
  invitation_accepted_by_user_id uuid references auth.users(id),
  invitation_accepted_at timestamptz,
  client_event_id uuid not null constraint invitation_client_event_id_key unique,
  invitation_created_at timestamptz not null default now(),
  invitation_updated_at timestamptz not null default now(),
  constraint invitation_tenant_id_person_id_fkey foreign key (tenant_id, person_id)
    references public.person(tenant_id, person_id),
  constraint invitation_target_check check (person_id is not null or
    (length(btrim(invitation_first_name)) > 0 and length(btrim(invitation_last_name)) > 0)),
  constraint invitation_email_check check (invitation_email = lower(btrim(invitation_email)) and invitation_email like '%@%'),
  constraint invitation_token_hash_check check (invitation_token_hash ~ '^[a-f0-9]{64}$'),
  constraint invitation_permissions_check check (
    (invitation_membership_role = 'tenant_admin' or cardinality(invitation_admin_permissions) = 0)
    and array_position(invitation_admin_permissions, null) is null),
  constraint invitation_acceptance_check check ((invitation_status = 'accepted') =
    (invitation_accepted_at is not null and invitation_accepted_by_user_id is not null))
);
create index invitation_tenant_id_person_id_idx on public.invitation(tenant_id, person_id);
create index invitation_person_id_idx on public.invitation(person_id);
create index invitation_created_by_user_id_idx on public.invitation(invitation_created_by_user_id);
create index invitation_accepted_by_user_id_idx on public.invitation(invitation_accepted_by_user_id);
comment on table public.invitation is 'Audit redaction: invitation_email, invitation_first_name, invitation_last_name, invitation_token_hash. Raw tokens are never persisted.';

create table public.support_session (
  support_session_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(tenant_id),
  support_session_actor_user_id uuid not null references auth.users(id),
  support_session_target_user_id uuid not null references auth.users(id),
  support_session_reason text not null,
  support_session_duration_minutes_count integer not null default 30,
  support_session_started_at timestamptz not null default now(),
  support_session_expires_at timestamptz not null,
  support_session_ended_at timestamptz,
  support_session_status public.support_session_status not null default 'active',
  support_session_ended_by_user_id uuid references auth.users(id),
  client_event_id uuid not null constraint support_session_client_event_id_key unique,
  support_session_created_at timestamptz not null default now(),
  support_session_updated_at timestamptz not null default now(),
  constraint support_session_reason_check check (length(btrim(support_session_reason)) between 1 and 500),
  constraint support_session_duration_check check (support_session_duration_minutes_count between 1 and 60
    and support_session_expires_at > support_session_started_at
    and support_session_expires_at <= support_session_started_at + interval '60 minutes'),
  constraint support_session_actor_target_check check (support_session_actor_user_id <> support_session_target_user_id),
  constraint support_session_ended_check check ((support_session_status = 'active') = (support_session_ended_at is null))
);
create unique index support_session_active_actor_key on public.support_session(support_session_actor_user_id)
  where support_session_status = 'active';
create index support_session_tenant_id_idx on public.support_session(tenant_id);
create index support_session_actor_user_id_idx on public.support_session(support_session_actor_user_id);
create index support_session_target_user_id_idx on public.support_session(support_session_target_user_id);
create index support_session_ended_by_user_id_idx on public.support_session(support_session_ended_by_user_id);
comment on table public.support_session is 'Audit redaction: support_session_reason. Session IDs never correspond to auth.sessions: Auth mutation endpoints must reject support JWTs.';
alter table public.audit_event add column audit_event_on_behalf_of_user_id uuid;
alter table public.audit_event add column support_session_id uuid;
create index audit_event_support_session_id_idx on public.audit_event(support_session_id);

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
create function app_private.identity_tenant_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t.tenant_id from public.tenant t where app_private.current_identity_is_valid()
    and (not app_private.is_impersonating() or t.tenant_id = ((select auth.jwt())->>'support_tenant_id')::uuid);
$$;
create or replace function app_private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.current_identity_is_valid() and not app_private.is_impersonating()
    and coalesce((select auth.jwt())->>'aal' = 'aal2', false)
    and exists (select 1 from public.platform_admin a where a.user_id = app_private.current_user_id() and a.platform_admin_is_active);
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
do $$ declare table_name text; begin
  foreach table_name in array array['tenant','person','membership','membership_permission'] loop
    execute format('create trigger enforce_tenant_writes before insert or update or delete on public.%I for each row execute function app_private.enforce_tenant_writes()',table_name);
    execute format('alter table public.%I enable always trigger enforce_tenant_writes',table_name);
  end loop;
end $$;
-- Restrictive ALL would also constrain reads; the identity predicate only binds
-- support tenant, while the write CHECK plus trigger handles UPDATE/DELETE.

create function public.create_tenant(tenant_name text, tenant_slug text, tenant_address text default null,
  tenant_time_zone text default 'America/Argentina/Tucuman',
  tenant_subscription_status public.tenant_subscription_status default 'pilot', tenant_logo_path text default null,
  client_event_id uuid default gen_random_uuid()) returns uuid
language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if not app_private.is_platform_admin() then raise exception 'MFA platform administrator required' using errcode='42501'; end if;
  if length(btrim(tenant_name)) not between 1 and 200 or tenant_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=tenant_time_zone) then
    raise exception 'Invalid tenant input' using errcode='22023'; end if;
  created_id := client_event_id;
  if tenant_logo_path is not null and tenant_logo_path not like created_id::text || '/%' then
    raise exception 'Invalid tenant logo path' using errcode='22023'; end if;
  insert into public.tenant(tenant_id,tenant_name,tenant_slug,tenant_address,tenant_time_zone,tenant_subscription_status,tenant_logo_path,tenant_settings)
  values(created_id,btrim(tenant_name),tenant_slug,tenant_address,tenant_time_zone,tenant_subscription_status,tenant_logo_path,
    '{"locale":"es-AR","currency":"ARS"}'::jsonb) on conflict (tenant_id) do nothing;
  return created_id;
end;
$$;

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
create function public.create_invitation(target_tenant_id uuid, invited_email text,
  target_role public.membership_role, token_hash text, expires_at timestamptz, client_event_id uuid,
  target_person_id uuid default null, first_name text default null, last_name text default null,
  admin_permissions public.admin_permission[] default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if not app_private.can_invite(target_tenant_id,target_role,admin_permissions)
    or lower(btrim(invited_email)) = app_private.verified_email() then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  if expires_at <= statement_timestamp() or expires_at > statement_timestamp()+interval '7 days' then
    raise exception 'Invalid invitation input' using errcode='22023'; end if;
  if target_person_id is not null then
    perform 1 from public.person p where p.tenant_id=target_tenant_id and p.person_id=target_person_id
      and p.user_id is null for update;
    if not found then raise exception 'Invitation management denied' using errcode='42501'; end if;
  end if;
  insert into public.invitation(tenant_id,invitation_email,person_id,invitation_first_name,invitation_last_name,
    invitation_membership_role,invitation_admin_permissions,invitation_token_hash,invitation_expires_at,
    invitation_created_by_user_id,client_event_id)
  values(target_tenant_id,lower(btrim(invited_email)),target_person_id,first_name,last_name,target_role,
    admin_permissions,token_hash,expires_at,app_private.current_user_id(),client_event_id)
  on conflict on constraint invitation_client_event_id_key do nothing returning invitation_id into created_id;
  if created_id is null then
    select i.invitation_id into created_id from public.invitation i where i.client_event_id=create_invitation.client_event_id
      and i.tenant_id=target_tenant_id and i.invitation_created_by_user_id=app_private.current_user_id();
    if not found then raise exception 'Invitation management denied' using errcode='42501'; end if;
  end if;
  return created_id;
end;
$$;
create function public.revoke_invitation(target_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.invitation;
begin
  if app_private.is_impersonating() or (not app_private.is_platform_admin()
    and not exists(select app_private.permission_tenant_ids('registry'))
    and not exists(select app_private.permission_tenant_ids('admin_management'))) then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  select i.* into target from public.invitation i where i.invitation_id=target_invitation_id
    and app_private.can_invite(i.tenant_id,i.invitation_membership_role,i.invitation_admin_permissions) for update;
  if not found then raise exception 'Invitation management denied' using errcode='42501'; end if;
  update public.invitation set invitation_status='revoked' where invitation_id=target_invitation_id and invitation_status='pending';
end;
$$;

-- Invitation consent is an isolated capability, never a client/server role.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='invitation_acceptor') then create role invitation_acceptor nologin noinherit; end if;
end $$;
grant invitation_acceptor to postgres with inherit false, set true;
grant usage on schema public, app_private, extensions to invitation_acceptor;
grant select on public.tenant,public.person,public.membership,public.membership_permission,public.invitation to invitation_acceptor;
grant insert on public.person,public.membership,public.membership_permission to invitation_acceptor;
grant update(user_id) on public.person to invitation_acceptor;
grant update(person_id,invitation_status,invitation_accepted_at,invitation_accepted_by_user_id) on public.invitation to invitation_acceptor;

create function public.accept_invitation(token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target public.invitation; actor uuid; email text; target_person uuid; created_membership uuid;
begin
  actor := app_private.current_user_id(); email := app_private.verified_email();
  if actor is null or email is null or app_private.is_impersonating() or token is null or length(token)<>64 then
    raise exception 'Invitation unavailable' using errcode='42501'; end if;
  -- Lookup by a fixed-length SHA256 digest; no raw secret comparison or branching
  -- on prefix. All invalid, expired, wrong-email and replay paths use one error.
  select i.* into target from public.invitation i where i.invitation_token_hash=encode(extensions.digest(token,'sha256'),'hex')
    and i.invitation_email=email and i.invitation_status='pending' and i.invitation_expires_at>statement_timestamp()
    and exists(select 1 from public.tenant t where t.tenant_id=i.tenant_id and t.tenant_subscription_status in ('pilot','active')) for update;
  if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
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
    support_session_reason,support_session_duration_minutes_count,support_session_expires_at,client_event_id)
  values(target_tenant_id,app_private.current_user_id(),target_user_id,btrim(reason),duration_minutes,
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

alter table public.invitation enable row level security;
alter table public.support_session enable row level security;
revoke all on public.invitation,public.support_session from public,anon,authenticated,service_role;
-- Email/hash/profile data is returned only to invitation managers, never to invitees.
grant select on public.invitation,public.support_session to authenticated;
create policy "invitation managers can read invitations" on public.invitation for select to authenticated
  using ((select app_private.is_platform_admin()) or
    (tenant_id in (select app_private.permission_tenant_ids('admin_management')) and invitation_membership_role='tenant_admin') or
    (tenant_id in (select app_private.permission_tenant_ids('registry')) and invitation_membership_role<>'tenant_admin'));
create policy "audit admins can read support sessions" on public.support_session for select to authenticated
  using (not (select app_private.is_impersonating()) and ((select app_private.is_platform_admin())
    or tenant_id in (select app_private.permission_tenant_ids('access_audit'))));
do $$ declare table_name text; begin
  foreach table_name in array array['person','membership','membership_permission','invitation'] loop
    execute format('create policy "invitation acceptor can read consent records" on public.%I for select to invitation_acceptor using (true)',table_name);
    if table_name<>'invitation' then
      execute format('create policy "invitation acceptor can create consent records" on public.%I for insert to invitation_acceptor with check (true)',table_name);
    end if;
  end loop;
end $$;
create policy "invitation acceptor can read tenant status" on public.tenant for select to invitation_acceptor using(true);
create policy "invitation acceptor can bind own identity" on public.person for update to invitation_acceptor using(true) with check(true);
create policy "invitation acceptor can close consent" on public.invitation for update to invitation_acceptor using(true) with check(true);

-- Private bucket. First object path component must be the canonical tenant UUID.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('tenant-logo','tenant-logo',false,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy "members can read tenant logos" on storage.objects for select to authenticated
  using(bucket_id='tenant-logo' and ((storage.foldername(name))[1] in (select app_private.member_tenant_ids()::text)
    or ((select app_private.is_platform_admin()) and (storage.foldername(name))[1] in (select app_private.identity_tenant_ids()::text))));
create policy "platform admins can upload tenant logos" on storage.objects for insert to authenticated
  with check(bucket_id='tenant-logo' and (select app_private.is_platform_admin())
    and (storage.foldername(name))[1] in (select app_private.identity_tenant_ids()::text));
create policy "platform admins can update tenant logos" on storage.objects for update to authenticated
  using(bucket_id='tenant-logo' and (select app_private.is_platform_admin()))
  with check(bucket_id='tenant-logo' and (select app_private.is_platform_admin())
    and (storage.foldername(name))[1] in (select app_private.identity_tenant_ids()::text));
create policy "platform admins can delete tenant logos" on storage.objects for delete to authenticated
  using(bucket_id='tenant-logo' and (select app_private.is_platform_admin()));

-- All exposed RPCs consume the central identity; H0 source files stay frozen.
do $$ declare fn record; body text; begin
  for fn in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and p.proowner='postgres'::regrole loop
    body := pg_get_functiondef(fn.signature);
    body := replace(body,'(select auth.uid())','app_private.current_user_id()');
    execute body;
  end loop;
end $$;
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='app_private'::regnamespace and p.proowner='postgres'::regrole loop
    execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  end loop;
end $$;
grant execute on function app_private.member_tenant_ids(),app_private.role_tenant_ids(public.membership_role[]),
  app_private.permission_tenant_ids(public.admin_permission),app_private.current_person_ids(),app_private.own_membership_ids(),
  app_private.is_tenant_member(uuid),app_private.has_tenant_role(uuid,public.membership_role[]),app_private.has_admin_permission(uuid,public.admin_permission),
  app_private.is_platform_admin(),app_private.current_user_id(),app_private.current_identity_is_valid(),app_private.current_support_session_id(),
  app_private.is_impersonating(),app_private.identity_tenant_ids(),app_private.writable_tenant_ids(),app_private.tenant_allows_writes(uuid) to authenticated;
grant execute on function app_private.current_user_id(),app_private.verified_email(),app_private.is_impersonating(),app_private.tenant_allows_writes(uuid)
  to invitation_acceptor;
revoke all on function public.create_tenant(text,text,text,text,public.tenant_subscription_status,text,uuid),
  public.create_invitation(uuid,text,public.membership_role,text,timestamptz,uuid,uuid,text,text,public.admin_permission[]),
  public.revoke_invitation(uuid),public.accept_invitation(text),public.start_support_session(uuid,uuid,text,uuid,integer),
  public.end_support_session(uuid) from public,anon,service_role;
grant execute on function public.create_tenant(text,text,text,text,public.tenant_subscription_status,text,uuid),
  public.create_invitation(uuid,text,public.membership_role,text,timestamptz,uuid,uuid,text,text,public.admin_permission[]),
  public.revoke_invitation(uuid),public.accept_invitation(text),public.start_support_session(uuid,uuid,text,uuid,integer),
  public.end_support_session(uuid) to authenticated;

grant create on schema public to invitation_acceptor;
alter function public.accept_invitation(text) owner to invitation_acceptor;
revoke create on schema public from invitation_acceptor;
